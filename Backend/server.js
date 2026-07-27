/*          !!!   MODÜLLER   !!!          */

// require() başka bir modülü dosyaya getir,  node:http  Node.js in hazır HTTP modülü
const http = require("node:http");
const { Server } = require("socket.io"); // Socket.IO paketinin dışarı sunduğu değerlerden Server sınıfını alır.
const os = require("node:os");
const { exec } = require("node:child_process");


/*          !!!   DEĞİŞKENLER   !!!         */

const cpuList = os.cpus();
const cpuCount = cpuList.length;
let cpuInterval;
let systemInfo;
let isShuttingDown = false;
let isMetricsRunning = false;



/*          !!!   FONKSİYONLAR   !!!         */

function getCpuTimes() {
    const cpus = os.cpus();

    let totalTime = 0;
    let idleTime = 0;

    cpus.forEach((cpu)=>{
        totalTime += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
        idleTime += cpu.times.idle;
    });

    return {
        total: totalTime,
        idle: idleTime
    };
}

function getPhysicalCoreCount(callback) {
    exec(
        "powershell -NoProfile -Command \"(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum\"",
        (error, stdout, stderr) => {
            if (error) {
                console.error("Fiziksel çekirdek bilgisi alınamadı:", error);
                return;
            }
            const physicalCoreCount = Number(stdout.trim());
            callback(physicalCoreCount);
        }
    );
}

function getRamMetrics(){
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = usedMem / totalMem * 100;

    const bytesInGB = 1024 ** 3;
    
    return{
        totalMemGB: Number((totalMem/bytesInGB).toFixed(2)),
        freeMemGB: Number((freeMem/bytesInGB).toFixed(2)),
        usedMemGB: Number((usedMem/bytesInGB).toFixed(2)),
        usagePercentage: Number(memUsage.toFixed(2))
    };
}

function getNetworkInfo(callback){
    exec(
        "powerShell -NoProfile -Command \"Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1 Name, InterfaceDescription, LinkSpeed | ConvertTo-Json -Compress\"",
        (error, stdout, stderr) => {
            if (error) {
                console.error("Ağ bilgisi alınamadı: ", error);
                return;
            }
            const networkInfo = JSON.parse(stdout.trim());

            const counterInstanceName = networkInfo.InterfaceDescription
                .replaceAll("(","[")
                .replaceAll(")","]");

            const linkSpeedText = networkInfo.LinkSpeed.trim();
            let interfaceSpeedMbps;

            if(linkSpeedText.includes("Gbps")){
                interfaceSpeedMbps = Number(linkSpeedText.replace("Gbps", "").trim()) * 1000;
            } else if(linkSpeedText.includes("Mbps")){
                interfaceSpeedMbps = Number(linkSpeedText.replace("Mbps", "").trim());
            } else {
                console.error("Tanımlanmayan bağlantı hızı birimi: ", linkSpeedText);
                return;
            }

            const activeNetworkInfo = {
                interfaceName: networkInfo.Name,
                interfaceDescription: networkInfo.InterfaceDescription,
                counterInstanceName,
                interfaceSpeedMbps
            };
            callback(activeNetworkInfo);
        }
    );
}

function getUnitedDynamicMetrics(counterInstanceName, callback){
    const bytesInMB = 1024 ** 2;
    exec(
        `powerShell -NoProfile -Command \"(Get-Counter '\\FizikselDisk(_Total)\\Disk Okuma Bayt/sn','\\FizikselDisk(_Total)\\Disk Yazma Bayt/sn','\\Ağ Bağdaştırıcısı(${counterInstanceName})\\Alınan Bayt/sn','\\Ağ Bağdaştırıcısı(${counterInstanceName})\\Gönderilen Bayt/sn').CounterSamples | Select-Object -ExpandProperty CookedValue\"`,
        (error,stdout,stderr) => {
            if(isShuttingDown){
                return;
            }

            if(error){
                console.log("!!! Metrikler alınamadı !!!", error);
                callback(null);
                return;
            }

            const values = stdout.trim().split(/\r?\n/);

            const readBytesPerSec = Number(values[0].replace(",","."));
            const writeBytesPerSec = Number(values[1].replace(",", "."));

            const receivedBytesPerSec = Number(values[2].replace(",", "."));
            const sentBytesPerSec = Number(values[3].replace(",", "."));

            const readMBPerSec = Number((readBytesPerSec/bytesInMB).toFixed(2));
            const writeMBPerSec = Number((writeBytesPerSec/bytesInMB).toFixed(2));

            callback({
                readMBPerSec,
                writeMBPerSec,
                receivedBytesPerSec,
                sentBytesPerSec
            });
        }
    );
}


/*          !!!   SERVER   !!!         */

// (req, res) her gelen istek için çalışan bir callback,   req istemciden gelen   res gönderilen
const server = http.createServer((req, res)=>{

    // writeHead durum kodu ve içerik türü bilgileri ayarlar
    res.writeHead(200,{
        "Content-Type":"text/plain; charset=utf-8"
    });

    // end cevabı gönderir ve işlemi bitirir. İçine doğrudan metin de verilebilir
    res.end("Server Çalışıyor!");
});

const io = new Server(server, {
    cors: {
        origin: "http://localhost:4200",
        methods: ["GET", "POST"]
    }
});

/*          !!!   SİSTEM METRİKLERİ   !!!         */

getPhysicalCoreCount((count) => {
    getNetworkInfo((networkInfo)=>{
        systemInfo = {
            physicalCoreCount: count,
            logicalProcessorCount: cpuCount,
            totalMemGB: getRamMetrics().totalMemGB,
            interfaceName: networkInfo.interfaceName,
            interfaceSpeedMbps: networkInfo.interfaceSpeedMbps
        };
        console.log("SystemInfo", systemInfo);
        io.emit("systemInfo", systemInfo);

        let previousMeasure = getCpuTimes();
        
        cpuInterval = setInterval(()=>{

            if(isMetricsRunning){
                return;
            }
            isMetricsRunning = true;

            const currentMeasure = getCpuTimes();
            const totalDiff = currentMeasure.total - previousMeasure.total;
            const idleDiff = currentMeasure.idle - previousMeasure.idle;
            const activeDiff = totalDiff - idleDiff;
            const cpuUsage = (activeDiff / totalDiff) * 100;

            const ramMeasure = getRamMetrics();

            previousMeasure = currentMeasure;

            getUnitedDynamicMetrics(networkInfo.counterInstanceName,
                (dynamicMetrics) => {
                    if(!dynamicMetrics){
                        isMetricsRunning = false;
                        return;
                    }
                    const receivedMbps = Number(((dynamicMetrics.receivedBytesPerSec * 8) / 1_000_000).toFixed(2));
                    const sentMbps = Number(((dynamicMetrics.sentBytesPerSec * 8) / 1_000_000).toFixed(2));
                    const totalBytesPerSec = dynamicMetrics.receivedBytesPerSec + dynamicMetrics.sentBytesPerSec;

                    const totalBitsPerSec = totalBytesPerSec * 8;
                    const capacityBitsPerSec = networkInfo.interfaceSpeedMbps * 1_000_000;
                    const networkUsagePercentage = Number(((totalBitsPerSec / capacityBitsPerSec) * 100).toFixed(2));

                    const systemMetrics = {            
                        cpuUsagePercentage: Number(cpuUsage.toFixed(2)),
                        usedMemGB: ramMeasure.usedMemGB,
                        freeMemGB: ramMeasure.freeMemGB,
                        memUsagePercentage: ramMeasure.usagePercentage,
                        readMBPerSec: dynamicMetrics.readMBPerSec,
                        writeMBPerSec: dynamicMetrics.writeMBPerSec,
                        receivedMbps,
                        sentMbps,
                        networkUsagePercentage
                    };

                    console.log("CurrentMetrics", systemMetrics);
                    io.emit("systemMetrics", systemMetrics);
                    isMetricsRunning = false;
                }
            );
        },2000);
    });
});


/*          !!!   OLAY DİNLEYİCİLERİ   !!!         */

// io.on() socket.io sunucusunda bir olayı dinler, "connection" yeni istemci bağlantısı oluştuğunda tetiklenir.
// socket yalnızca bağlanan o istemiciyi temsil eder.
io.on("connection",(socket)=>{
    console.log("Bağlandı.");

    if(systemInfo){
        socket.emit("systemInfo", systemInfo);
    }
});

server.listen(3000,()=>{
    console.log("Server çalışmaya başladı!");
});

/*          !!!   KAPATMA İŞLEMİ   !!!         */

process.on("SIGINT",()=>{
    console.log("\nKapatma işlemi başlatıldı... ");

    isShuttingDown = true;
    clearInterval(cpuInterval);

    io.close(()=>{
        console.log("Server kapandı!");
    });
});



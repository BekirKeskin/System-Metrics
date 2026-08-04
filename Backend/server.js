/*          !!!   MODÜLLER   !!!          */

// require() başka bir modülü dosyaya getir,  node:http  Node.js in hazır HTTP modülü
const http = require("node:http");
const { Server } = require("socket.io"); // Socket.IO paketinin dışarı sunduğu değerlerden Server sınıfını alır.
const os = require("node:os");
const { exec, spawn } = require("node:child_process");
const bcrypt = require("bcrypt");
const pool = require("./db");
const handleAlarmRoutes = require("./routes/alarm-routes");
const handleUserRoutes = require("./routes/user-routes");
const handleLoginRoutes = require("./routes/auth-routes");



/*          !!!   DEĞİŞKENLER   !!!         */

const allowedMetricsIntervals = [1000, 5000, 10000];
const LOGIN_TOKEN = "system-metrics-auth-token";

const BYTES_IN_MB = 1024 ** 2;
const BYTES_IN_GB = 1024 ** 3;
const BITS_IN_BYTE = 8;
const BITS_IN_MEGABIT = 1_000_000;

const POWERSHELL_COMMAND_END = "__COMMAND_END__";

// daha önce tetiklenen alarm ID lerini terkarsız tutmak ve has() ile hızlıca kontrol amaçlı Set() kullnılır
const triggeredAlarmIds = new Set();

const cpuList = os.cpus();
const cpuCount = cpuList.length;

let metricsIntervalMs = 2000;
let cpuInterval;

let powerShellProcess;
let powerShellOutput = "";
let pendingPowerShellCallback = null;

let systemInfo;
let activeNetworkInfo;

let isMetricsRunning = false;
let isShuttingDown = false;


/*          !!!   FONKSİYONLAR   !!!         */

function startPowerShellProcess() {
    powerShellProcess = spawn("powershell.exe",["-NoLogo","-NoProfile",
        "-NonInteractive","-Command","-"]);

    powerShellProcess.on("spawn",()=>{ //spawn hazır event
        console.log("PowerShell süreci başlatıldı.");

        powerShellProcess.stdin.write(
            '[Console]::InputEncoding = [System.Text.Encoding]::UTF8; ' +
            '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
            '$OutputEncoding = [System.Text.Encoding]::UTF8\n'
        );
    });

    powerShellProcess.stdout.on("data",(data)=>{
        powerShellOutput += data.toString();

        if(powerShellOutput.includes(POWERSHELL_COMMAND_END)) {

            const completedOutput = powerShellOutput
            .replace(POWERSHELL_COMMAND_END, "")
            .trim();

            powerShellOutput = "";

            if(pendingPowerShellCallback) {
                pendingPowerShellCallback(completedOutput);
                pendingPowerShellCallback = null;
            }
        }
    });

    powerShellProcess.stderr.on("data", (data)=>{
        console.error("PowerShell Hatası:", data.toString());
    });
}
startPowerShellProcess();

function runPowerShellCommand(command, callback) {
    pendingPowerShellCallback = callback;

    powerShellProcess.stdin.write(`${command}; Write-Output "${POWERSHELL_COMMAND_END}"\n`);
}


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

function calculateCpuUsage(previousMeasure, currentMeasure){
    const totalDiff = currentMeasure.total - previousMeasure.total;
    const idleDiff = currentMeasure.idle - previousMeasure.idle;
    const activeDiff = totalDiff - idleDiff;

    return totalDiff > 0 ? (activeDiff / totalDiff) * 100 : 0;
}

function getRamMetrics(){
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = usedMem / totalMem * 100;
    
    return{
        totalMemGB: Number((totalMem/BYTES_IN_GB).toFixed(2)),
        freeMemGB: Number((freeMem/BYTES_IN_GB).toFixed(2)),
        usedMemGB: Number((usedMem/BYTES_IN_GB).toFixed(2)),
        usagePercentage: Number(memUsage.toFixed(2))
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

            const parsedNetworkInfo = {
                interfaceName: networkInfo.Name,
                interfaceDescription: networkInfo.InterfaceDescription,
                counterInstanceName,
                interfaceSpeedMbps
            };
            callback(parsedNetworkInfo);
        }
    );
}

function calculateNetworkMetrics(dynamicMetrics, interfaceSpeedMbps){

    const receivedMbps = Number(((dynamicMetrics.receivedBytesPerSec * BITS_IN_BYTE) / BITS_IN_MEGABIT).toFixed(2));
    const sentMbps = Number(((dynamicMetrics.sentBytesPerSec * BITS_IN_BYTE) / BITS_IN_MEGABIT).toFixed(2));
    const totalBytesPerSec = dynamicMetrics.receivedBytesPerSec + dynamicMetrics.sentBytesPerSec;

    const totalBitsPerSec = totalBytesPerSec * BITS_IN_BYTE;
    const capacityBitsPerSec = interfaceSpeedMbps * BITS_IN_MEGABIT;
    const networkUsagePercentage = Number(((totalBitsPerSec / capacityBitsPerSec) * 100).toFixed(2));

    return {
        receivedMbps,
        sentMbps,
        networkUsagePercentage
    };
}

function getUnitedDynamicMetrics(counterInstanceName, callback){
    const command = `(Get-Counter '\\FizikselDisk(_Total)\\Disk Okuma Bayt/sn','\\FizikselDisk(_Total)\\Disk Yazma Bayt/sn','\\Ağ Bağdaştırıcısı(${counterInstanceName})\\Alınan Bayt/sn','\\Ağ Bağdaştırıcısı(${counterInstanceName})\\Gönderilen Bayt/sn').CounterSamples | Select-Object -ExpandProperty CookedValue`;

    runPowerShellCommand(command, (output) => {

        if(isShuttingDown){
            return;
        }

        try {
            const values = output.trim().split(/\r?\n/);

            if (values.length < 4) {
                console.log("Tüm dinamik metrikler alınamadı:", values);
                callback(null);
                return;
            }

            const readBytesPerSec = Number(values[0].replace(",", "."));
            const writeBytesPerSec = Number(values[1].replace(",", "."));
            const receivedBytesPerSec = Number(values[2].replace(",", "."));
            const sentBytesPerSec = Number(values[3].replace(",", "."));

            const readMBPerSec = Number((readBytesPerSec/BYTES_IN_MB).toFixed(2));
            const writeMBPerSec = Number((writeBytesPerSec/BYTES_IN_MB).toFixed(2));

            callback({
                readMBPerSec,
                writeMBPerSec,
                receivedBytesPerSec,
                sentBytesPerSec
            });
        } catch (error) {
            console.error("Dinamik metrik çıktısı çözülemedi:", output);
            console.error(error);
            callback(null);
        }
    });
}

function startMetricsInterval(networkInfo){

    clearInterval(cpuInterval);
    
    let previousMeasure = getCpuTimes();
        
    cpuInterval = setInterval(()=>{

        if(isMetricsRunning || isShuttingDown){
            return;
        }
        isMetricsRunning = true;

        const currentMeasure = getCpuTimes();
        const cpuUsage = calculateCpuUsage(previousMeasure, currentMeasure);
        const ramMeasure = getRamMetrics();
        previousMeasure = currentMeasure;

        getUnitedDynamicMetrics(networkInfo.counterInstanceName,
            (dynamicMetrics) => {
                if(!dynamicMetrics || isShuttingDown){
                    isMetricsRunning = false;
                    return;
                }

                const networkMetrics = calculateNetworkMetrics(
                    dynamicMetrics,
                    networkInfo.interfaceSpeedMbps
                );

                const systemMetrics = {            
                    cpuUsagePercentage: Number(cpuUsage.toFixed(2)),
                    usedMemGB: ramMeasure.usedMemGB,
                    freeMemGB: ramMeasure.freeMemGB,
                    memUsagePercentage: ramMeasure.usagePercentage,
                    readMBPerSec: dynamicMetrics.readMBPerSec,
                    writeMBPerSec: dynamicMetrics.writeMBPerSec,
                    receivedMbps: networkMetrics.receivedMbps,
                    sentMbps: networkMetrics.sentMbps,
                    networkUsagePercentage: networkMetrics.networkUsagePercentage
                };

                console.log("CurrentMetrics", systemMetrics);
                io.emit("systemMetrics", systemMetrics);
                isMetricsRunning = false;
            }
        );
    },metricsIntervalMs);
}


/*          !!!   SERVER   !!!         */

// (req, res) her gelen istek için çalışan bir callback,   req istemciden gelen   res gönderilen
const server = http.createServer(async (req, res)=>{
    //cors yalnızca socket.io tarafını yönettiği için node:http ile yazılan /login cevabına otomatik uygulanmaz
    // bu nedenle res.setHeader kontrollerini ekliyoruz. setHeader HTTP response a header eklemek için kullanılır
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:4200"); // Angular frontende izin
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"); // Hangi HTTP yöntemlerine izin verildiği
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");  //Frontend'in Content-Type application/json headerını kullanmasına izin verir.

    if(req.method === "OPTIONS"){
        res.writeHead(204); // NO CONTENT = istek başarılı ama body yok
        res.end();
        return;
    }

    if (await handleLoginRoutes(req, res, LOGIN_TOKEN)) {
        return;
    }

    if (await handleUserRoutes(req, res)) {
        return;
    }

    if (await handleAlarmRoutes(req, res)) {
        return;
    }

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

/*          !!!   OLAY DİNLEYİCİLERİ   !!!         */

// io.on() socket.io sunucusunda bir olayı dinler, "connection" yeni istemci bağlantısı oluştuğunda tetiklenir.
// socket yalnızca bağlanan o istemiciyi temsil eder.
io.on("connection",(socket)=>{

    if(isShuttingDown){
        socket.disconnect(true);
        return;
    }

    console.log("Bağlandı:", socket.id);

    if(systemInfo){
        socket.emit("systemInfo", systemInfo);
    }

    socket.on("changeMetricsInterval", (intervalMs)=>{

        console.log("Süre isteği geldi:",intervalMs,"Socket:",socket.id);

        if(!allowedMetricsIntervals.includes(intervalMs)) {
            console.log("Geçersiz metrik aralığı: ", intervalMs);
            return;
        }

        if(!activeNetworkInfo){
            console.log("Network bilgisi henüz hazır değil.");
            return;
        }

        metricsIntervalMs = intervalMs;
        startMetricsInterval(activeNetworkInfo);

        console.log(`Metrik aralığı ${intervalMs} ms olarak değiştirildi.`);
    });
});

/*          !!!   SİSTEM METRİKLERİ   !!!         */

getPhysicalCoreCount((count) => {
    getNetworkInfo((networkInfo)=>{
        
        activeNetworkInfo = networkInfo;

        systemInfo = {
            physicalCoreCount: count,
            logicalProcessorCount: cpuCount,
            totalMemGB: getRamMetrics().totalMemGB,
            interfaceName: networkInfo.interfaceName,
            interfaceSpeedMbps: networkInfo.interfaceSpeedMbps
        };

        console.log("SystemInfo", systemInfo);
        io.emit("systemInfo", systemInfo);

        startMetricsInterval(networkInfo);
    });
});


server.listen(3000,()=>{
    console.log("Server çalışmaya başladı!");
});

/*          !!!   KAPATMA İŞLEMİ   !!!         */

process.on("SIGINT",()=>{

    if(isShuttingDown){
        return;
    }
    isShuttingDown = true;
    console.log("\nKapatma işlemi başlatıldı... ");

    clearInterval(cpuInterval);

    if(powerShellProcess){
        powerShellProcess.stdin.end();
        powerShellProcess.kill();
    }

    io.close(()=>{
        console.log("Server kapandı!");
    });
});
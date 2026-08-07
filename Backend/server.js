/*          !!!   MODÜLLER   !!!          */

const http = require("node:http");
const { Server } = require("socket.io");
const os = require("node:os");
const handleAlarmRoutes = require("./routes/alarm-routes");
const handleUserRoutes = require("./routes/user-routes");
const handleLoginRoutes = require("./routes/auth-routes");
const checkAlarms = require("./services/alarm-service");
const { startPowerShellProcess, stopPowerShellProcess } = require("./services/powershell-service");
const { getCpuTimes, calculateCpuUsage, getRamMetrics, getPhysicalCoreCount, getNetworkInfo, calculateNetworkMetrics, getUnitedDynamicMetrics } = require("./services/metrics-service");


/*          !!!   DEĞİŞKENLER   !!!         */

const allowedMetricsIntervals = [1000, 5000, 10000];
const LOGIN_TOKEN = "system-metrics-auth-token";

const cpuList = os.cpus();
const cpuCount = cpuList.length;

let metricsIntervalMs = 1000;
let cpuInterval;

let systemInfo;
let activeNetworkInfo;

let isMetricsRunning = false;
let isShuttingDown = false;


/*          !!!   FONKSİYONLAR   !!!         */

startPowerShellProcess();

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
            async (dynamicMetrics) => {
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

                try {
                    await checkAlarms(systemMetrics);
                }
                catch (error) {
                    console.error("Alarm kontrol hatası:", error);
                }
                finally {
                    isMetricsRunning = false;
                }
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

    stopPowerShellProcess();

    io.close(()=>{
        console.log("Server kapandı!");
    });
});
/*          !!!   MODÜLLER   !!!          */

const http = require("node:http");
const { Server } = require("socket.io");
const os = require("node:os");
const { createHash, timingSafeEqual } = require("node:crypto");
const pool = require("./db");
const handleAlarmRoutes = require("./routes/alarm-routes");
const handleUserRoutes = require("./routes/user-routes");
const handleLoginRoutes = require("./routes/auth-routes");
const checkAlarms = require("./services/alarm-service");
const { startPowerShellProcess, stopPowerShellProcess } = require("./services/powershell-service");
const { getCpuTimes, calculateCpuUsage, getRamMetrics, getPhysicalCoreCount, getNetworkInfo, calculateNetworkMetrics, getUnitedDynamicMetrics } = require("./services/metrics-service");


/*          !!!   DEĞİŞKENLER   !!!         */

const allowedMetricsIntervals = [1000, 5000, 10000];
const LOCAL_SERVER_KEY = `local:${os.hostname()}`;
const LOGIN_TOKEN = "system-metrics-auth-token";

const cpuList = os.cpus();
const cpuCount = cpuList.length;

let metricsIntervalMs = 1000;
let cpuInterval;

let systemInfo;
let activeNetworkInfo;

let isMetricsRunning = false;
let isShuttingDown = false;

let localServerId = null;
let serverListInterval = null;


/*          !!!   FONKSİYONLAR   !!!         */

startPowerShellProcess();

async function upsertServer(serverData) {
    const result = await pool.query(
        `
        INSERT INTO servers (
            server_key,
            name,
            hostname,
            os,
            source_type,
            physical_core_count,
            logical_processor_count,
            total_mem_gb,
            interface_name,
            interface_speed_mbps,
            last_seen
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            NOW()
        )
        ON CONFLICT (server_key)
        DO UPDATE SET
            name =
                EXCLUDED.name,

            hostname =
                EXCLUDED.hostname,

            os =
                EXCLUDED.os,

            source_type =
                EXCLUDED.source_type,

            physical_core_count =
                EXCLUDED.physical_core_count,

            logical_processor_count =
                EXCLUDED.logical_processor_count,

            total_mem_gb =
                EXCLUDED.total_mem_gb,

            interface_name =
                EXCLUDED.interface_name,

            interface_speed_mbps =
                EXCLUDED.interface_speed_mbps,

            last_seen =
                NOW()

        RETURNING id
        `,
        [
            serverData.serverKey,
            serverData.name,
            serverData.hostname,
            serverData.os,
            serverData.sourceType,
            serverData.physicalCoreCount,
            serverData.logicalProcessorCount,
            serverData.totalMemGB,
            serverData.interfaceName,
            serverData.interfaceSpeedMbps
        ]
    );

    return result.rows[0];
}

async function saveMetric(
    serverId,
    metrics
) {
    await pool.query(
        `
        INSERT INTO metrics (
            server_id,
            cpu_usage,
            used_mem_gb,
            free_mem_gb,
            mem_usage,
            disk_read_mbps,
            disk_write_mbps,
            received_mbps,
            sent_mbps,
            network_usage
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10
        )
        `,
        [
            serverId,
            metrics.cpuUsagePercentage,
            metrics.usedMemGB,
            metrics.freeMemGB,
            metrics.memUsagePercentage,
            metrics.readMBPerSec,
            metrics.writeMBPerSec,
            metrics.receivedMbps,
            metrics.sentMbps,
            metrics.networkUsagePercentage
        ]
    );
}

async function touchServer(serverId) {
    await pool.query(
        `
        UPDATE servers
        SET last_seen = NOW()
        WHERE id = $1
        `,
        [serverId]
    );
}

async function getServerList() {
    const result = await pool.query(
        `
        SELECT
            id,
            name,
            hostname,
            os,
            source_type,
            physical_core_count,
            logical_processor_count,
            total_mem_gb,
            interface_name,
            interface_speed_mbps,
            last_seen,
        CASE
            WHEN last_seen IS NOT NULL
                AND NOW() - last_seen <= INTERVAL '15 seconds'
            THEN true
            ELSE false
        END AS is_online        
        FROM servers
        ORDER BY id
        `
    );

    return result.rows.map(
        (row) => ({
            id: row.id,

            name:
                row.name,

            hostname:
                row.hostname,

            os:
                row.os,

            sourceType:
                row.source_type,

            physicalCoreCount:
                row.physical_core_count,

            logicalProcessorCount:
                row.logical_processor_count,

            totalMemGB:
                Number(row.total_mem_gb),

            interfaceName:
                row.interface_name,

            interfaceSpeedMbps:
                Number(
                    row.interface_speed_mbps
                ),

            lastSeen:
                row.last_seen,

            isOnline:
                row.is_online
        })
    );
}

async function emitServerList() {
    const servers =
        await getServerList();

    io.emit(
        "serverList",
        servers
    );
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

                if (localServerId) {

                    io.emit("serverMetrics", {
                        serverId: localServerId,
                        metrics: systemMetrics
                    });

                    try {
                        await saveMetric(
                            localServerId,
                            systemMetrics
                        );

                        await touchServer(
                            localServerId
                        );
                    }
                    catch (error) {
                        console.error(
                            "Windows metric DB hatası:",
                            error.message
                        );
                    }
                }

                try {
                    await checkAlarms(systemMetrics);
                }
                catch (error) {
                    console.error(
                        "Alarm kontrol hatası:",
                        error
                    );
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

io.use(async (socket, next) => {

    const {
        clientType,
        serverKey,
        agentSecret
    } = socket.handshake.auth ?? {};

    // Angular/dashboard bağlantısıysa
    // agent authentication uygulanmaz.
    if (clientType !== "agent") {
        return next();
    }

    if (!serverKey || !agentSecret) {
        console.log(
            "Agent authentication reddedildi: eksik bilgi."
        );

        return next(
            new Error("Agent authentication failed.")
        );
    }

    try {
        const result = await pool.query(
            `
            SELECT
                id,
                agent_secret_hash
            FROM servers
            WHERE server_key = $1
              AND source_type = 'agent'
            LIMIT 1
            `,
            [serverKey]
        );

        if (result.rows.length === 0) {
            console.log(
                "Agent authentication reddedildi: kayıtlı agent yok."
            );

            return next(
                new Error("Agent authentication failed.")
            );
        }

        const server = result.rows[0];

        if (!server.agent_secret_hash) {
            console.log(
                "Agent authentication reddedildi: secret hash yok."
            );

            return next(
                new Error("Agent authentication failed.")
            );
        }

        const receivedHash =
            createHash("sha256")
                .update(agentSecret)
                .digest();

        const storedHash =
            Buffer.from(
                server.agent_secret_hash,
                "hex"
            );

        if (
            receivedHash.length !== storedHash.length ||
            !timingSafeEqual(
                receivedHash,
                storedHash
            )
        ) {
            console.log(
                "Agent authentication reddedildi: secret yanlış."
            );

            return next(
                new Error("Agent authentication failed.")
            );
        }

        socket.data.serverId =
            server.id;

        console.log(
            `Agent authentication başarılı. serverId: ${server.id}`
        );

        next();

    }
    catch (error) {
        console.error(
            "Agent authentication hatası:",
            error.message
        );

        next(
            new Error("Agent authentication failed.")
        );
    }
});

/*          !!!   OLAY DİNLEYİCİLERİ   !!!         */

// io.on() socket.io sunucusunda bir olayı dinler, "connection" yeni istemci bağlantısı oluştuğunda tetiklenir.
// socket yalnızca bağlanan o istemiciyi temsil eder.
io.on("connection", async (socket) => {

    if (isShuttingDown) {
        socket.disconnect(true);
        return;
    }

    const clientType =
        socket.handshake.auth
            ?.clientType
        ?? "dashboard";

    if (clientType === "agent") {

        const serverKey =
            socket.handshake.auth.serverKey;

        const serverId =
            socket.data.serverId;

        console.log(
            `Agent bağlandı: ${socket.id} | serverId: ${serverId}`
        );

        socket.on(
            "agentSystemInfo",
            async (agentSystemInfo) => {

                try {
                    await upsertServer({
                        serverKey,

                        name:
                            agentSystemInfo.hostname,

                        hostname:
                            agentSystemInfo.hostname,

                        os:
                            agentSystemInfo.os,

                        sourceType:
                            "agent",

                        physicalCoreCount:
                            agentSystemInfo.physicalCoreCount,

                        logicalProcessorCount:
                            agentSystemInfo.logicalProcessorCount,

                        totalMemGB:
                            agentSystemInfo.totalMemGB,

                        interfaceName:
                            agentSystemInfo.interfaceName,

                        interfaceSpeedMbps:
                            agentSystemInfo.interfaceSpeedMbps
                    });

                    console.log(
                        `Agent bilgileri güncellendi. serverId: ${serverId}`
                    );

                    await emitServerList();
                }
                catch (error) {
                    console.error(
                        "Agent sistem bilgisi güncelleme hatası:",
                        error.message
                    );
                }
            }
        );

        socket.on(
            "agentMetrics",
            async (agentMetrics) => {

                io.emit(
                    "serverMetrics",
                    {
                        serverId,
                        metrics: agentMetrics
                    }
                );

                try {
                    await saveMetric(
                        serverId,
                        agentMetrics
                    );
                }
                catch (error) {
                    console.error(
                        "Agent metric DB hatası:",
                        error.message
                    );
                }
            }
        );

        socket.on(
            "agentHeartbeat",
            async () => {

                try {
                    await touchServer(
                        serverId
                    );
                }
                catch (error) {
                    console.error(
                        "Heartbeat güncelleme hatası:",
                        error.message
                    );
                }
            }
        );

        return;
    }

    console.log(
        "Dashboard bağlandı:",
        socket.id
    );

    try {
        socket.emit(
            "serverList",
            await getServerList()
        );
    } catch (error) {
        console.error(
            "Server listesi alınamadı:",
            error.message
        );
    }

    socket.on(
        "changeMetricsInterval",
        ({ serverId, intervalMs }) => {

            console.log(
                "Metrik süre isteği:",
                "Server:", serverId,
                "Süre:", intervalMs
            );

            if (
                !allowedMetricsIntervals.includes(intervalMs)
            ) {
                console.log(
                    "Geçersiz metrik aralığı:",
                    intervalMs
                );

                return;
            }

            // Seçilen server Windows ise
            if (serverId === localServerId) {

                if (!activeNetworkInfo) {
                    console.log(
                        "Windows network bilgisi hazır değil."
                    );

                    return;
                }

                metricsIntervalMs = intervalMs;

                startMetricsInterval(
                    activeNetworkInfo
                );

                console.log(
                    `Windows metrik aralığı ${intervalMs} ms oldu.`
                );

                return;
            }

            // Seçilen server bir Agent ise
            const agentSocket =
                [...io.sockets.sockets.values()]
                    .find(
                        connectedSocket =>
                            connectedSocket.data.serverId
                            === serverId
                    );

            if (!agentSocket) {
                console.log(
                    `Server ${serverId} için bağlı agent bulunamadı.`
                );

                return;
            }

            agentSocket.emit(
                "changeMetricsInterval",
                intervalMs
            );

            console.log(
                `Server ${serverId} agentına ${intervalMs} ms gönderildi.`
            );
        }
    );
});

/*          !!!   SİSTEM METRİKLERİ   !!!         */

getPhysicalCoreCount((count) => {

    getNetworkInfo(async (networkInfo) => {

        activeNetworkInfo = networkInfo;

        systemInfo = {
            physicalCoreCount: count,
            logicalProcessorCount: cpuCount,
            totalMemGB: getRamMetrics().totalMemGB,
            interfaceName: networkInfo.interfaceName,
            interfaceSpeedMbps: networkInfo.interfaceSpeedMbps
        };

        try {
            const localServer =
                await upsertServer({
                    serverKey:
                        LOCAL_SERVER_KEY,

                    name:
                        os.hostname(),

                    hostname:
                        os.hostname(),

                    os:
                        os.platform(),

                    sourceType:
                        "local",

                    physicalCoreCount:
                        systemInfo.physicalCoreCount,

                    logicalProcessorCount:
                        systemInfo.logicalProcessorCount,

                    totalMemGB:
                        systemInfo.totalMemGB,

                    interfaceName:
                        systemInfo.interfaceName,

                    interfaceSpeedMbps:
                        systemInfo.interfaceSpeedMbps
                });

            localServerId =
                localServer.id;

            console.log(
                `Windows server kaydedildi. serverId: ${localServerId}`
            );

            await emitServerList();
        }
        catch (error) {
            console.error(
                "Windows server kayıt hatası:",
                error.message
            );
        }

        startMetricsInterval(
            networkInfo
        );
    });
});


server.listen(3000,()=>{
    console.log("Server çalışmaya başladı!");
});

serverListInterval = setInterval(async () => {
    try {
        await emitServerList();
    }
    catch (error) {
        console.error(
            "Server durum listesi güncellenemedi:",
            error.message
        );
    }
}, 5000);

/*          !!!   KAPATMA İŞLEMİ   !!!         */

process.on("SIGINT",()=>{

    if(isShuttingDown){
        return;
    }
    isShuttingDown = true;
    console.log("\nKapatma işlemi başlatıldı... ");

    clearInterval(cpuInterval);
    clearInterval(serverListInterval);

    stopPowerShellProcess();

    io.close(()=>{
        console.log("Server kapandı!");
    });
});
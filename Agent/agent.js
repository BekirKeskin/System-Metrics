require("dotenv").config();

const si = require("systeminformation");
const { io } = require("socket.io-client");

const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const BACKEND_URL = "http://192.168.250.1:3000";

const AGENT_ID_FILE = path.join(__dirname, ".agent-id");

const BYTES_IN_GB = 1024 ** 3;
const BYTES_IN_MB = 1024 ** 2;
const BITS_IN_MEGABIT = 1_000_000;

const ALLOWED_METRICS_INTERVALS = [
    1000,
    5000,
    10000
];

const HEARTBEAT_INTERVAL_MS = 5000;

let systemInfo = null;
let metricsIntervalMs = 1000;
let metricsInterval = null;

function getOrCreateAgentId() {
    if (fs.existsSync(AGENT_ID_FILE)) {
        return fs
            .readFileSync(
                AGENT_ID_FILE,
                "utf8"
            )
            .trim();
    }

    const agentId = randomUUID();

    fs.writeFileSync(
        AGENT_ID_FILE,
        agentId,
        "utf8"
    );

    return agentId;
}

const agentId = getOrCreateAgentId();

const agentSecret = process.env.AGENT_SECRET;

if (!agentSecret) {
    throw new Error(
        "AGENT_SECRET .env dosyasında bulunamadı."
    );
}

const socket = io(BACKEND_URL, {
    auth: {
        clientType: "agent",
        serverKey: agentId,
	agentSecret
    }
});

function roundMetric(value) {
    return Number(value.toFixed(2));
}

socket.on("connect", () => {
    console.log("Backend bağlantısı kuruldu.");
    console.log("Socket ID:", socket.id);
    console.log("Agent ID:", agentId);

    if (systemInfo) {
        socket.emit(
            "agentSystemInfo",
            systemInfo
        );
    }
});

socket.on("disconnect", (reason) => {
    console.log(
        "Backend bağlantısı kesildi:",
        reason
    );
});

socket.on("connect_error", (error) => {
    console.error(
        "Backend bağlantı hatası:",
        error.message
    );
});

socket.on(
    "changeMetricsInterval",
    (intervalMs) => {

        if (
            !ALLOWED_METRICS_INTERVALS
                .includes(intervalMs)
        ) {
            console.log(
                "Geçersiz metrik aralığı:",
                intervalMs
            );

            return;
        }

        metricsIntervalMs = intervalMs;

        startMetricsInterval();

        console.log(
            `Agent metrik aralığı ${intervalMs} ms olarak değiştirildi.`
        );
    }
);

async function getSystemInfo() {
    const cpu = await si.cpu();
    const memory = await si.mem();

    const networkInterface =
        await si.networkInterfaces("default");

    return {
        hostname: os.hostname(),
        os: os.platform(),

        physicalCoreCount:
            cpu.physicalCores,

        logicalProcessorCount:
            cpu.cores,

        totalMemGB:
            roundMetric(
                memory.total / BYTES_IN_GB
            ),

        interfaceName:
            networkInterface.iface,

        interfaceSpeedMbps:
            networkInterface.speed
    };
}

async function getMetrics() {
    try {
        const cpu = await si.currentLoad();
        const memory = await si.mem();
        const disk = await si.fsStats();

        const networkInterface =
            await si.networkInterfaces("default");

        const networkStats =
            await si.networkStats(
                networkInterface.iface
            );

        const network = networkStats[0];

        const usedMemory =
            memory.total -
            memory.available;

        const receivedMbps =
            network.rx_sec == null
                ? 0
                : (network.rx_sec * 8)
                    / BITS_IN_MEGABIT;

        const sentMbps =
            network.tx_sec == null
                ? 0
                : (network.tx_sec * 8)
                    / BITS_IN_MEGABIT;

        const readMBPerSec =
            disk.rx_sec == null
                ? 0
                : disk.rx_sec
                    / BYTES_IN_MB;

        const writeMBPerSec =
            disk.wx_sec == null
                ? 0
                : disk.wx_sec
                    / BYTES_IN_MB;

        const networkUsagePercentage =
            networkInterface.speed > 0
                ? (
                    (
                        receivedMbps +
                        sentMbps
                    )
                    /
                    networkInterface.speed
                ) * 100
                : 0;

        const metrics = {
            cpuUsagePercentage:
                roundMetric(
                    cpu.currentLoad
                ),

            usedMemGB:
                roundMetric(
                    usedMemory
                    / BYTES_IN_GB
                ),

            freeMemGB:
                roundMetric(
                    memory.available
                    / BYTES_IN_GB
                ),

            memUsagePercentage:
                roundMetric(
                    (
                        usedMemory /
                        memory.total
                    ) * 100
                ),

            readMBPerSec:
                roundMetric(
                    readMBPerSec
                ),

            writeMBPerSec:
                roundMetric(
                    writeMBPerSec
                ),

            receivedMbps:
                roundMetric(
                    receivedMbps
                ),

            sentMbps:
                roundMetric(
                    sentMbps
                ),

            networkUsagePercentage:
                roundMetric(
                    networkUsagePercentage
                )
        };

        if (socket.connected) {
            socket.emit(
                "agentMetrics",
                metrics
            );
        }

    } catch (error) {
        console.error(
            "Metric toplama hatası:",
            error.message
        );
    }
}

function startMetricsInterval() {

    if (metricsInterval) {
        clearInterval(
            metricsInterval
        );
    }

    metricsInterval = setInterval(
        getMetrics,
        metricsIntervalMs
    );
}

async function startAgent() {
    try {
        systemInfo =
            await getSystemInfo();

        console.log(
            "System Info:",
            systemInfo
        );

        if (socket.connected) {
            socket.emit(
                "agentSystemInfo",
                systemInfo
            );
        }

        await si.currentLoad();
        await si.fsStats();
        await si.networkStats();

        startMetricsInterval();

	setInterval(() => {
		if (socket.connected) {
			socket.emit("agentHeartbeat");
		}
	},HEARTBEAT_INTERVAL_MS);

    } catch (error) {
        console.error(
            "Agent başlatma hatası:",
            error.message
        );
    }
}

startAgent();

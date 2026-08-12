const os = require("node:os");

const checkAlarms = require("./alarm-service");

const {
    startPowerShellProcess,
    stopPowerShellProcess
} = require("./powershell-service");

const {
    getCpuTimes,
    calculateCpuUsage,
    getRamMetrics,
    getPhysicalCoreCount,
    getNetworkInfo,
    calculateNetworkMetrics,
    getUnitedDynamicMetrics
} = require("./metrics-service");

const {
    upsertServer,
    touchServer
} = require("./server-service");

const {
    saveMetric
} = require("./metric-history-service");


const LOCAL_SERVER_KEY = `local:${os.hostname()}`;

const cpuCount = os.cpus().length;


function createWindowsMonitor(io, emitServerList) {

    let metricsIntervalMs = 1000;
    let cpuInterval = null;

    let activeNetworkInfo = null;

    let isMetricsRunning = false;
    let isStopping = false;

    let localServerId = null;


    function startMetricsInterval(networkInfo) {

        clearInterval(cpuInterval);

        let previousMeasure = getCpuTimes();

        cpuInterval = setInterval(() => {

            if (isMetricsRunning || isStopping) {
                return;
            }

            isMetricsRunning = true;

            const currentMeasure = getCpuTimes();

            const cpuUsage = calculateCpuUsage(
                previousMeasure,
                currentMeasure
            );

            const ramMeasure = getRamMetrics();

            previousMeasure = currentMeasure;

            getUnitedDynamicMetrics(
                networkInfo.counterInstanceName,
                async (dynamicMetrics) => {

                    if (!dynamicMetrics || isStopping) {
                        isMetricsRunning = false;
                        return;
                    }

                    const networkMetrics =
                        calculateNetworkMetrics(
                            dynamicMetrics,
                            networkInfo.interfaceSpeedMbps
                        );

                    const systemMetrics = {
                        cpuUsagePercentage:
                            Number(cpuUsage.toFixed(2)),

                        usedMemGB:
                            ramMeasure.usedMemGB,

                        freeMemGB:
                            ramMeasure.freeMemGB,

                        memUsagePercentage:
                            ramMeasure.usagePercentage,

                        readMBPerSec:
                            dynamicMetrics.readMBPerSec,

                        writeMBPerSec:
                            dynamicMetrics.writeMBPerSec,

                        receivedMbps:
                            networkMetrics.receivedMbps,

                        sentMbps:
                            networkMetrics.sentMbps,

                        networkUsagePercentage:
                            networkMetrics.networkUsagePercentage
                    };

                    if (localServerId) {

                        io.emit(
                            "serverMetrics",
                            {
                                serverId: localServerId,
                                metrics: systemMetrics
                            }
                        );

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
                        if (localServerId) {
                            await checkAlarms(
                                localServerId,
                                systemMetrics
                            );
                        }
                    }
                    catch (error) {
                        console.error(
                            "Windows alarm kontrol hatası:",
                            error
                        );
                    }
                    finally {
                        isMetricsRunning = false;
                    }
                }
            );

        }, metricsIntervalMs);
    }


    function start() {

        isStopping = false;

        startPowerShellProcess();

        getPhysicalCoreCount((count) => {

            getNetworkInfo(async (networkInfo) => {

                activeNetworkInfo = networkInfo;

                const systemInfo = {
                    physicalCoreCount:
                        count,

                    logicalProcessorCount:
                        cpuCount,

                    totalMemGB:
                        getRamMetrics().totalMemGB,

                    interfaceName:
                        networkInfo.interfaceName,

                    interfaceSpeedMbps:
                        networkInfo.interfaceSpeedMbps
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
    }


    function isLocalServer(serverId) {
        return serverId === localServerId;
    }


    function changeInterval(intervalMs) {

        if (!activeNetworkInfo) {
            return false;
        }

        metricsIntervalMs = intervalMs;

        startMetricsInterval(
            activeNetworkInfo
        );

        return true;
    }


    function stop() {

        isStopping = true;

        clearInterval(cpuInterval);

        stopPowerShellProcess();
    }


    return {
        start,
        stop,
        isLocalServer,
        changeInterval
    };
}


module.exports = createWindowsMonitor;
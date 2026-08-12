const checkAlarms = require("../services/alarm-service");
const {
    upsertServer,
    touchServer
} = require("../services/server-service");
const {
    saveMetric
} = require("../services/metric-history-service");

function handleAgentConnection(io, socket, emitServerList) {

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

            try {
                await checkAlarms(
                    serverId,
                    agentMetrics
                );
            }
            catch (error) {
                console.error(
                    "Agent alarm kontrol hatası:",
                    error
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
}

module.exports = handleAgentConnection;
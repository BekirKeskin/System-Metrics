const {
    getServerList
} = require("../services/server-service");

const allowedMetricsIntervals = [
    1000,
    5000,
    10000
];

async function handleDashboardConnection(
    io,
    socket,
    windowsMonitor
) {

    console.log(
        "Dashboard bağlandı:",
        socket.id
    );

    try {
        socket.emit(
            "serverList",
            await getServerList()
        );
    }
    catch (error) {
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
                !allowedMetricsIntervals.includes(
                    intervalMs
                )
            ) {
                console.log(
                    "Geçersiz metrik aralığı:",
                    intervalMs
                );

                return;
            }

            // Seçilen server local Windows ise
            if (
                windowsMonitor.isLocalServer(
                    serverId
                )
            ) {

                const intervalChanged =
                    windowsMonitor.changeInterval(
                        intervalMs
                    );

                if (!intervalChanged) {
                    console.log(
                        "Windows network bilgisi hazır değil."
                    );

                    return;
                }

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
}

module.exports = handleDashboardConnection;
const { getCpuHistory } = require("../services/metric-history-service");

async function handleCpuHistory(req, res, requestUrl) {

    try {

        const serverId = Number(requestUrl.searchParams.get("serverId"));
        const limitParameter = requestUrl.searchParams.get("limit");
        const limit = limitParameter === null ? 60 : Number(limitParameter);

        if (!Number.isInteger(serverId) || serverId <= 0) {

            res.writeHead(400, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Geçersiz serverId."
            }));

            return;
        }

        if (!Number.isInteger(limit) || limit <= 0 || limit > 300) {

            res.writeHead(400, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Limit 1 ile 300 arasında olmalıdır."
            }));

            return;
        }

        const cpuHistory = await getCpuHistory(serverId, limit);

        const history = cpuHistory.map(
            (metric) => ({
                cpuUsage: Number(metric.cpu_usage),
                recordedAt: metric.recorded_at
            })
        );

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: true,
            history
        }));
    }
    catch (error) {

        console.error("CPU geçmişi getirilemedi:", error);

        if (!res.headersSent) {

            res.writeHead(500, {
                "Content-Type": "application/json; charset=utf-8"
            });
        }

        res.end(JSON.stringify({
            success: false,
            message: "Sunucu hatası oluştu."
        }));
    }
}

const routes = {

    GET: {
        "/metrics/cpu-history": handleCpuHistory
    }

};

async function handleMetricRoutes(req, res) {

    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = requestUrl.pathname;
    const handler = routes[req.method]?.[pathname];

    if (!handler) {
        return false;
    }

    await handler(req, res, requestUrl);

    return true;
}

module.exports = handleMetricRoutes;
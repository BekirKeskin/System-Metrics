const pool = require("../../db");

const allowedMetricTypes = ["cpu", "ram"];
const allowedSeverityTypes = ["low", "medium", "high", "critical"];


async function handleCreateAlarm(req, res) {

    console.log("Alarm ekleme isteği geldi.");

    let body = "";

    req.on("data", (chunk) => {
        body += chunk.toString();
    });

    req.on("end", async () => {

        try {

            const addAlarm = JSON.parse(body);

            const serverId = addAlarm.serverId;
            const recipientUserId = addAlarm.recipientUserId;
            const metricType = addAlarm.metricType;
            const threshold = addAlarm.threshold;
            const severity = addAlarm.severity;


            if (
                !Number.isInteger(serverId) ||
                serverId <= 0 ||
                !Number.isInteger(recipientUserId) ||
                recipientUserId <= 0 ||
                !allowedMetricTypes.includes(metricType) ||
                !Number.isFinite(threshold) ||
                threshold <= 0 ||
                threshold > 100 ||
                !allowedSeverityTypes.includes(severity)
            ) {

                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Alarm bilgileri eksik veya geçersiz !!!"
                }));

                return;
            }

            const serverResult = await pool.query(
                `SELECT id
                FROM servers
                WHERE id = $1`,
                [serverId]
            );

            if (serverResult.rows.length === 0) {

                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Geçersiz sunucu seçildi."
                }));

                return;
            }

            const userResult = await pool.query(
                `SELECT id
                FROM users
                WHERE id = $1`,
                [recipientUserId]
            );

            if (userResult.rows.length === 0) {

                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Geçersiz kullanıcı seçildi."
                }));

                return;
            }

            const result = await pool.query(
                `INSERT INTO alarms (
                    server_id,
                    recipient_user_id,
                    metric_type,
                    threshold,
                    severity
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING
                    id,
                    server_id,
                    recipient_user_id,
                    metric_type,
                    threshold,
                    severity,
                    is_active,
                    created_at`,
                [
                    serverId,
                    recipientUserId,
                    metricType,
                    threshold,
                    severity
                ]
            );

            console.log(result.rows[0]);

            res.writeHead(201, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: true,
                message: "Alarm başarıyla oluşturuldu.",
                alarm: result.rows[0]
            }));
        }
        catch (error) {

            console.error("Alarm Ekleme hatası:", error);

            if (!res.headersSent) {
                res.writeHead(500, {
                    "Content-Type": "application/json; charset=utf-8"
                });
            }

            res.end(JSON.stringify({
                success: false,
                message: "Sunucu hatası oluştu"
            }));
        }
    });
}

module.exports = handleCreateAlarm;
const pool = require("../../db");

const allowedMetricTypes = ["cpu", "ram"];
const allowedSeverityTypes = ["low", "medium", "high", "critical"];

async function handleUpdateAlarm(req, res, routeParams) {

    const alarmId = Number(routeParams.id);

    if (!Number.isInteger(alarmId) || alarmId <= 0) {

        res.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Geçersiz alarm ID."
        }));

        return;
    }

    let body = "";

    req.on("data", (chunk) => {
        body += chunk.toString();
    });

    req.on("end", async () => {

        try {

            const {
                serverId,
                recipientUserId,
                metricType,
                threshold,
                severity,
                isActive
            } = JSON.parse(body);


            if (
                !Number.isInteger(serverId) ||
                serverId <= 0 ||
                !Number.isInteger(recipientUserId) ||
                recipientUserId <= 0 ||
                !allowedMetricTypes.includes(metricType) ||
                !Number.isFinite(threshold) ||
                threshold <= 0 ||
                threshold > 100 ||
                !allowedSeverityTypes.includes(severity) ||
                typeof isActive !== "boolean"
            ) {

                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Güncellenecek alarm bilgileri eksik veya geçersiz."
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
                `UPDATE alarms
                SET
                    server_id = $1,
                    recipient_user_id = $2,
                    metric_type = $3,
                    threshold = $4,
                    severity = $5,
                    is_active = $6
                WHERE id = $7
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
                    severity,
                    isActive,
                    alarmId
                ]
            );

            if (result.rows.length === 0) {

                res.writeHead(404, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Güncellenecek alarm bulunamadı."
                }));

                return;
            }

            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: true,
                message: "Alarm başarıyla güncellendi.",
                alarm: result.rows[0]
            }));
        }
        catch (error) {

            console.error("Alarm güncellenemedi:", error);

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
    });
}

module.exports = handleUpdateAlarm;
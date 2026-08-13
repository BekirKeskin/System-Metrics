const pool = require("../../db");

async function handleGetAlarms(req, res) {

    try {

        const result = await pool.query(
            `SELECT
                alarms.id,
                alarms.server_id,
                alarms.recipient_user_id,
                users.username,
                users.name,
                users.surname,
                alarms.metric_type,
                alarms.threshold,
                alarms.severity,
                alarms.is_active,
                alarms.created_at
            FROM alarms
            INNER JOIN users
                ON alarms.recipient_user_id = users.id
            ORDER BY alarms.created_at DESC`
        );

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: true,
            message: "Değerler getirildi.",
            alarms: result.rows
        }));
    }
    catch (error) {

        console.error("Değerler getirilemedi !!!", error);

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
}

module.exports = handleGetAlarms;
const pool = require("../../db");

async function handleDeleteAlarm(req, res, routeParams) {

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

    try {

        const result = await pool.query(
            `DELETE FROM alarms
            WHERE id = $1
            RETURNING id`,
            [alarmId]
        );

        if (result.rows.length === 0) {

            res.writeHead(404, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Silinecek alarm bulunamadı."
            }));

            return;
        }

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: true,
            message: "Alarm başarıyla silindi.",
            deletedAlarmId: result.rows[0].id
        }));
    }
    catch (error) {

        console.error("Alarm silinemedi:", error);

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

module.exports = handleDeleteAlarm;
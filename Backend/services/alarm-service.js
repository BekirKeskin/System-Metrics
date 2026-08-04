const pool = require("../db");

const triggeredAlarmIds = new Set();

async function checkAlarms(systemMetrics) {

    try {

        const result = await pool.query(
            `SELECT id, recipient_user_id, metric_type, threshold, severity
            FROM alarms
            WHERE is_active = true`,
        );
        if (result.rows.length === 0) {
            return;
        }

        const exceededAlarms = [];
        let currentMetricValue;

        for (const alarm of result.rows) {
            
            if (alarm.metric_type === "cpu") {
                currentMetricValue = systemMetrics.cpuUsagePercentage;
            }
            else if (alarm.metric_type === "ram"){
                currentMetricValue = systemMetrics.memUsagePercentage;
            }
            else { 
                continue;
            }

            const threshold = Number(alarm.threshold);

            if (currentMetricValue >= threshold) {
                exceededAlarms.push(alarm);
            }
        }

        for (const alarm of exceededAlarms) {
            if (!triggeredAlarmIds.has(alarm.id)) {
                console.log("Alarm tetiklendi:", alarm);
                triggeredAlarmIds.add(alarm.id);
            }
        }

    }
    catch (error) {
        console.error("Aktif alarmlar getirilemedi:", error);
    }
}

module.exports = checkAlarms;
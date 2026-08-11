const pool = require("../db");
const sendAlarmEmail = require("./mail-service");

const triggeredAlarmIds = new Set();

async function checkAlarms(serverId, systemMetrics) {

    try {

        const result = await pool.query(
            `SELECT 
                alarms.id,
                alarms.server_id,
                alarms.recipient_user_id,
                alarms.metric_type,
                alarms.threshold,
                alarms.severity,
                users.email,
                servers.hostname,
                servers.os
            FROM alarms
            INNER JOIN users
                ON alarms.recipient_user_id = users.id
            INNER JOIN servers
                ON alarms.server_id = servers.id
            WHERE alarms.is_active = true
                AND alarms.server_id = $1`,
            [serverId]
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
            else if (alarm.metric_type === "ram") {
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

        const highestExceededAlarms = new Map();

        for (const alarm of exceededAlarms) {
            const selectedAlarm = highestExceededAlarms.get(alarm.metric_type);

            if (
                !selectedAlarm ||
                Number(alarm.threshold) > Number(selectedAlarm.threshold)
            ) {
                highestExceededAlarms.set(alarm.metric_type, alarm);
            }
        }

        for (const alarm of highestExceededAlarms.values()) {

            if (!triggeredAlarmIds.has(alarm.id)) {

                console.log("Alarm tetiklendi:", alarm);

                let currentValue;

                if (alarm.metric_type === "cpu") {
                    currentValue = systemMetrics.cpuUsagePercentage;
                }
                else if (alarm.metric_type === "ram") {
                    currentValue = systemMetrics.memUsagePercentage;
                }
                else {
                    continue;
                }

                sendAlarmEmail(
                    alarm.email,
                    `Eşik Aşımı - ${alarm.hostname}`,
                    `Sunucu: ${alarm.hostname} (${alarm.os}) Metrik adı: ${alarm.metric_type} Anlık değer: ${currentValue} Eşik değeri: ${alarm.threshold}`
                );

                triggeredAlarmIds.add(alarm.id);
            }
        }

    }
    catch (error) {
        console.error("Aktif alarmlar getirilemedi:", error);
    }
}

module.exports = checkAlarms;
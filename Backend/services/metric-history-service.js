const pool = require("../db");

async function saveMetric(serverId, metrics) {
    await pool.query(
        `
        INSERT INTO metrics (
            server_id,
            cpu_usage,
            used_mem_gb,
            free_mem_gb,
            mem_usage,
            disk_read_mbps,
            disk_write_mbps,
            received_mbps,
            sent_mbps,
            network_usage
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10
        )
        `,
        [
            serverId,
            metrics.cpuUsagePercentage,
            metrics.usedMemGB,
            metrics.freeMemGB,
            metrics.memUsagePercentage,
            metrics.readMBPerSec,
            metrics.writeMBPerSec,
            metrics.receivedMbps,
            metrics.sentMbps,
            metrics.networkUsagePercentage
        ]
    );
}

async function getCpuHistory(serverId, limit = 60) {
    const result = await pool.query(
        `
        SELECT
            cpu_usage,
            recorded_at
        FROM metrics
        WHERE server_id = $1
        ORDER BY recorded_at DESC
        LIMIT $2
        `,
        [
            serverId,
            limit
        ]
    );

    return result.rows.reverse();
}

module.exports = {
    saveMetric,
    getCpuHistory
};
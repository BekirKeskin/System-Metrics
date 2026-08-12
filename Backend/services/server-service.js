const pool = require("../db");

async function upsertServer(serverData) {
    const result = await pool.query(
        `
        INSERT INTO servers (
            server_key,
            name,
            hostname,
            os,
            source_type,
            physical_core_count,
            logical_processor_count,
            total_mem_gb,
            interface_name,
            interface_speed_mbps,
            last_seen
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            NOW()
        )
        ON CONFLICT (server_key)
        DO UPDATE SET
            name = EXCLUDED.name,
            hostname = EXCLUDED.hostname,
            os = EXCLUDED.os,
            source_type = EXCLUDED.source_type,
            physical_core_count = EXCLUDED.physical_core_count,
            logical_processor_count = EXCLUDED.logical_processor_count,
            total_mem_gb = EXCLUDED.total_mem_gb,
            interface_name = EXCLUDED.interface_name,
            interface_speed_mbps = EXCLUDED.interface_speed_mbps,
            last_seen = NOW()

        RETURNING id
        `,
        [
            serverData.serverKey,
            serverData.name,
            serverData.hostname,
            serverData.os,
            serverData.sourceType,
            serverData.physicalCoreCount,
            serverData.logicalProcessorCount,
            serverData.totalMemGB,
            serverData.interfaceName,
            serverData.interfaceSpeedMbps
        ]
    );

    return result.rows[0];
}

async function touchServer(serverId) {
    await pool.query(
        `
        UPDATE servers
        SET last_seen = NOW()
        WHERE id = $1
        `,
        [serverId]
    );
}

async function getServerList() {
    const result = await pool.query(
        `
        SELECT
            id,
            name,
            hostname,
            os,
            source_type,
            physical_core_count,
            logical_processor_count,
            total_mem_gb,
            interface_name,
            interface_speed_mbps,
            last_seen,
        CASE
            WHEN last_seen IS NOT NULL
                AND NOW() - last_seen <= INTERVAL '15 seconds'
            THEN true
            ELSE false
        END AS is_online        
        FROM servers
        ORDER BY id
        `
    );

    return result.rows.map(
        (row) => ({
            id: row.id,
            name: row.name,
            hostname: row.hostname,
            os: row.os,
            sourceType: row.source_type,
            physicalCoreCount: row.physical_core_count,
            logicalProcessorCount: row.logical_processor_count,
            totalMemGB: Number(row.total_mem_gb),
            interfaceName: row.interface_name,
            interfaceSpeedMbps: Number(row.interface_speed_mbps),
            lastSeen: row.last_seen,
            isOnline: row.is_online
        })
    );
}

module.exports = {
    upsertServer,
    touchServer,
    getServerList
};
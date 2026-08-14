process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const pool = require("../db");


test("Testler system_metrics_test veritabanını kullanmalı", async () => {

    const result = await pool.query(
        "SELECT current_database() AS database_name"
    );

    assert.strictEqual(
        result.rows[0].database_name,
        "system_metrics_test"
    );
});


test("Gerekli tablolar test veritabanında bulunmalı", async () => {

    const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    `);

    const tableNames = result.rows.map(
        (row) => row.table_name
    );

    const requiredTables = [
        "users",
        "servers",
        "alarms",
        "metrics",
        "refresh_tokens"
    ];

    for (const tableName of requiredTables) {

        assert.ok(
            tableNames.includes(tableName),
            `${tableName} tablosu bulunamadı.`
        );
    }
});


test("Test veritabanına kullanıcı eklenebilmeli", async () => {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const uniqueValue = crypto.randomUUID();

        const result = await client.query(
            `
            INSERT INTO users (
                username,
                name,
                surname,
                email,
                password_hash,
                role
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, username, email, role
            `,
            [
                `test-user-${uniqueValue}`,
                "Test",
                "User",
                `test-${uniqueValue}@example.com`,
                "test-password-hash",
                "user"
            ]
        );

        const createdUser = result.rows[0];

        assert.ok(createdUser.id);

        assert.strictEqual(
            createdUser.role,
            "user"
        );
    }
    finally {

        await client.query("ROLLBACK");
        client.release();
    }
});


test("Server silinince ona ait metric kayıtları CASCADE ile silinmeli", async () => {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const uniqueValue = crypto.randomUUID();

        const serverResult = await client.query(
            `
            INSERT INTO servers (
                server_key,
                name,
                hostname,
                os,
                source_type
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            `,
            [
                `test-server-${uniqueValue}`,
                "Test Server",
                `test-host-${uniqueValue}`,
                "linux",
                "agent"
            ]
        );

        const serverId = serverResult.rows[0].id;

        await client.query(
            `
            INSERT INTO metrics (
                server_id,
                cpu_usage,
                mem_usage
            )
            VALUES ($1, $2, $3)
            `,
            [
                serverId,
                25.50,
                40.25
            ]
        );

        await client.query(
            `
            DELETE FROM servers
            WHERE id = $1
            `,
            [serverId]
        );

        const metricResult = await client.query(
            `
            SELECT COUNT(*)::INTEGER AS count
            FROM metrics
            WHERE server_id = $1
            `,
            [serverId]
        );

        assert.strictEqual(
            metricResult.rows[0].count,
            0
        );
    }
    finally {

        await client.query("ROLLBACK");
        client.release();
    }
});


test.after(async () => {
    await pool.end();
});
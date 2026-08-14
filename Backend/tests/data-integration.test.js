process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

const pool = require("../db");
const handleHttpRoute = require("../routes/http-router");


const TEST_JWT_SECRET = "test-secret";


async function createTestServer() {

    const server = http.createServer(async (req, res) => {

        if (
            await handleHttpRoute(
                req,
                res,
                TEST_JWT_SECRET
            )
        ) {
            return;
        }

        res.writeHead(404, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Endpoint bulunamadı."
        }));
    });

    await new Promise((resolve) => {
        server.listen(0, resolve);
    });

    return server;
}


async function closeTestServer(server) {

    await new Promise((resolve) => {
        server.close(resolve);
    });
}


async function createTestAdmin() {

    const uniqueValue = crypto.randomUUID();

    const username =
        `test-admin-${uniqueValue}`;

    const password =
        "TestPassword123!";

    const passwordHash =
        await bcrypt.hash(password, 10);

    const result = await pool.query(
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
        RETURNING id, username
        `,
        [
            username,
            "Test",
            "Admin",
            `test-${uniqueValue}@example.com`,
            passwordHash,
            "admin"
        ]
    );

    return {
        id: result.rows[0].id,
        username,
        password
    };
}


async function loginAdmin(
    port,
    username,
    password
) {

    const response = await fetch(
        `http://127.0.0.1:${port}/login`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                username,
                password
            })
        }
    );

    assert.strictEqual(
        response.status,
        200
    );

    const body = await response.json();

    assert.ok(body.token);

    return body.token;
}


async function createMonitoredServer() {

    const uniqueValue = crypto.randomUUID();

    const result = await pool.query(
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

    return result.rows[0].id;
}


/*          CPU HISTORY          */

test(
    "CPU history endpointi kayıtlı metric verilerini getirmeli",
    async () => {

        const httpServer =
            await createTestServer();

        let testUser = null;
        let monitoredServerId = null;

        try {

            testUser =
                await createTestAdmin();

            monitoredServerId =
                await createMonitoredServer();

            await pool.query(
                `
                INSERT INTO metrics (
                    server_id,
                    cpu_usage,
                    mem_usage
                )
                VALUES
                    ($1, $2, $3),
                    ($1, $4, $5),
                    ($1, $6, $7)
                `,
                [
                    monitoredServerId,
                    10.25,
                    30.00,
                    20.50,
                    40.00,
                    30.75,
                    50.00
                ]
            );

            const port =
                httpServer.address().port;

            const token =
                await loginAdmin(
                    port,
                    testUser.username,
                    testUser.password
                );

            const response =
                await fetch(
                    `http://127.0.0.1:${port}/metrics/cpu-history?serverId=${monitoredServerId}&limit=60`,
                    {
                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                );

            const body =
                await response.json();

            assert.strictEqual(
                response.status,
                200
            );

            assert.strictEqual(
                body.success,
                true
            );

            assert.strictEqual(
                body.history.length,
                3
            );

            const cpuValues =
                body.history.map(
                    (item) => item.cpuUsage
                );

            assert.ok(
                cpuValues.includes(10.25)
            );

            assert.ok(
                cpuValues.includes(20.50)
            );

            assert.ok(
                cpuValues.includes(30.75)
            );
        }
        finally {

            if (monitoredServerId) {

                await pool.query(
                    `
                    DELETE FROM servers
                    WHERE id = $1
                    `,
                    [monitoredServerId]
                );
            }

            if (testUser) {

                await pool.query(
                    `
                    DELETE FROM users
                    WHERE id = $1
                    `,
                    [testUser.id]
                );
            }

            await closeTestServer(
                httpServer
            );
        }
    }
);


/*          USER LIST          */

test(
    "Admin kullanıcı GET /admin/users ile kullanıcı listesini görebilmeli",
    async () => {

        const httpServer =
            await createTestServer();

        let testUser = null;

        try {

            testUser =
                await createTestAdmin();

            const port =
                httpServer.address().port;

            const token =
                await loginAdmin(
                    port,
                    testUser.username,
                    testUser.password
                );

            const response =
                await fetch(
                    `http://127.0.0.1:${port}/admin/users`,
                    {
                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                );

            const body =
                await response.json();

            assert.strictEqual(
                response.status,
                200
            );

            assert.strictEqual(
                body.success,
                true
            );

            const bodyText =
                JSON.stringify(body);

            assert.ok(
                bodyText.includes(
                    testUser.username
                ),
                "Test kullanıcısı kullanıcı listesinde bulunamadı."
            );
        }
        finally {

            if (testUser) {

                await pool.query(
                    `
                    DELETE FROM users
                    WHERE id = $1
                    `,
                    [testUser.id]
                );
            }

            await closeTestServer(
                httpServer
            );
        }
    }
);


test.after(async () => {
    await pool.end();
});
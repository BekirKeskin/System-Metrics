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

    const email =
        `test-admin-${uniqueValue}@example.com`;

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
            email,
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
            "Test Monitoring Server",
            `test-host-${uniqueValue}`,
            "linux",
            "agent"
        ]
    );

    return result.rows[0].id;
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

    assert.ok(
        body.token,
        "Login cevabında token bulunamadı."
    );

    return body.token;
}


test(
    "Alarm CRUD işlemleri baştan sona çalışmalı",
    async () => {

        const httpServer =
            await createTestServer();

        let testUser = null;
        let monitoredServerId = null;
        let alarmId = null;

        try {

            testUser =
                await createTestAdmin();

            monitoredServerId =
                await createMonitoredServer();

            const address =
                httpServer.address();

            const token =
                await loginAdmin(
                    address.port,
                    testUser.username,
                    testUser.password
                );


            /*          CREATE          */

            const createResponse =
                await fetch(
                    `http://127.0.0.1:${address.port}/admin/alarms`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            serverId:
                                monitoredServerId,

                            recipientUserId:
                                testUser.id,

                            metricType:
                                "cpu",

                            threshold:
                                70,

                            severity:
                                "medium"
                        })
                    }
                );

            assert.strictEqual(
                createResponse.status,
                201
            );


            const createdAlarmResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        server_id,
                        recipient_user_id,
                        metric_type,
                        threshold,
                        severity,
                        is_active
                    FROM alarms
                    WHERE server_id = $1
                      AND recipient_user_id = $2
                    ORDER BY id DESC
                    LIMIT 1
                    `,
                    [
                        monitoredServerId,
                        testUser.id
                    ]
                );

            assert.strictEqual(
                createdAlarmResult.rows.length,
                1
            );

            const createdAlarm =
                createdAlarmResult.rows[0];

            alarmId = createdAlarm.id;

            assert.strictEqual(
                createdAlarm.metric_type,
                "cpu"
            );

            assert.strictEqual(
                Number(createdAlarm.threshold),
                70
            );

            assert.strictEqual(
                createdAlarm.severity,
                "medium"
            );


            /*          READ          */

            const getResponse =
                await fetch(
                    `http://127.0.0.1:${address.port}/admin/alarms`,
                    {
                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                );

            assert.strictEqual(
                getResponse.status,
                200
            );


            /*          UPDATE          */

            const updateResponse =
                await fetch(
                    `http://127.0.0.1:${address.port}/admin/alarms/${alarmId}`,
                    {
                        method: "PUT",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            serverId:
                                monitoredServerId,

                            recipientUserId:
                                testUser.id,

                            metricType:
                                "ram",

                            threshold:
                                80,

                            severity:
                                "high",

                            isActive:
                                false
                        })
                    }
                );

            assert.strictEqual(
                updateResponse.status,
                200
            );


            const updatedAlarmResult =
                await pool.query(
                    `
                    SELECT
                        metric_type,
                        threshold,
                        severity,
                        is_active
                    FROM alarms
                    WHERE id = $1
                    `,
                    [alarmId]
                );

            assert.strictEqual(
                updatedAlarmResult.rows.length,
                1
            );

            const updatedAlarm =
                updatedAlarmResult.rows[0];

            assert.strictEqual(
                updatedAlarm.metric_type,
                "ram"
            );

            assert.strictEqual(
                Number(updatedAlarm.threshold),
                80
            );

            assert.strictEqual(
                updatedAlarm.severity,
                "high"
            );

            assert.strictEqual(
                updatedAlarm.is_active,
                false
            );


            /*          DELETE          */

            const deleteResponse =
                await fetch(
                    `http://127.0.0.1:${address.port}/admin/alarms/${alarmId}`,
                    {
                        method: "DELETE",

                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                );

            assert.strictEqual(
                deleteResponse.status,
                200
            );


            const deletedAlarmResult =
                await pool.query(
                    `
                    SELECT id
                    FROM alarms
                    WHERE id = $1
                    `,
                    [alarmId]
                );

            assert.strictEqual(
                deletedAlarmResult.rows.length,
                0
            );

            alarmId = null;
        }
        finally {

            if (alarmId) {

                await pool.query(
                    `
                    DELETE FROM alarms
                    WHERE id = $1
                    `,
                    [alarmId]
                );
            }

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


test.after(async () => {
    await pool.end();
});
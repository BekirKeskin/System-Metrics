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


async function deleteTestUser(userId) {

    await pool.query(
        `
        DELETE FROM users
        WHERE id = $1
        `,
        [userId]
    );
}


test(
    "Gerçek login işlemi token üretmeli ve admin endpointine erişebilmeli",
    async () => {

        const server = await createTestServer();

        let testUser = null;

        try {

            testUser = await createTestAdmin();

            const address = server.address();

            const loginResponse = await fetch(
                `http://127.0.0.1:${address.port}/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        username: testUser.username,
                        password: testUser.password
                    })
                }
            );

            const loginBody =
                await loginResponse.json();

            assert.strictEqual(
                loginResponse.status,
                200
            );

            assert.strictEqual(
                loginBody.success,
                true
            );

            assert.ok(
                loginBody.token,
                "Login cevabında token bulunamadı."
            );


            const usersResponse = await fetch(
                `http://127.0.0.1:${address.port}/admin/users`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${loginBody.token}`
                    }
                }
            );

            const usersBody =
                await usersResponse.json();

            assert.strictEqual(
                usersResponse.status,
                200
            );

            assert.strictEqual(
                usersBody.success,
                true
            );
        }
        finally {

            if (testUser) {
                await deleteTestUser(
                    testUser.id
                );
            }

            await closeTestServer(server);
        }
    }
);


test(
    "Yanlış şifre ile login 401 dönmeli",
    async () => {

        const server = await createTestServer();

        let testUser = null;

        try {

            testUser = await createTestAdmin();

            const address = server.address();

            const response = await fetch(
                `http://127.0.0.1:${address.port}/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        username: testUser.username,
                        password: "YanlisPassword123!"
                    })
                }
            );

            assert.strictEqual(
                response.status,
                401
            );
        }
        finally {

            if (testUser) {
                await deleteTestUser(
                    testUser.id
                );
            }

            await closeTestServer(server);
        }
    }
);


test.after(async () => {
    await pool.end();
});
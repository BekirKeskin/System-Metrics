process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

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


function createToken(payload, options = {}) {

    return jwt.sign(
        payload,
        TEST_JWT_SECRET,
        options
    );
}


/*          ROOT VE 404 TESTLERİ          */

test("GET / isteği 200 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/`
        );

        const body = await response.text();

        assert.strictEqual(response.status, 200);
        assert.strictEqual(body, "Server Çalışıyor!");
    }
    finally {

        await closeTestServer(server);
    }
});


test("Bilinmeyen endpoint 404 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/olmayan-endpoint`
        );

        const body = await response.json();

        assert.strictEqual(response.status, 404);

        assert.strictEqual(
            body.message,
            "Endpoint bulunamadı."
        );
    }
    finally {

        await closeTestServer(server);
    }
});


test("Doğru path yanlış HTTP method ile çağrılırsa 404 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history`,
            {
                method: "POST"
            }
        );

        assert.strictEqual(response.status, 404);
    }
    finally {

        await closeTestServer(server);
    }
});


/*          AUTHENTICATION TESTLERİ          */

test("Token olmadan metrics endpointi 401 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history?serverId=1`
        );

        assert.strictEqual(response.status, 401);
    }
    finally {

        await closeTestServer(server);
    }
});


test("Geçersiz JWT ile metrics endpointi 401 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history?serverId=1`,
            {
                headers: {
                    Authorization: "Bearer gecersiz-token"
                }
            }
        );

        assert.strictEqual(response.status, 401);
    }
    finally {

        await closeTestServer(server);
    }
});


test("Yanlış secret ile imzalanmış JWT 401 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const token = jwt.sign(
            {
                userId: 999,
                username: "test-user",
                role: "user"
            },
            "yanlis-secret",
            {
                expiresIn: "5m"
            }
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history?serverId=1`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        assert.strictEqual(response.status, 401);
    }
    finally {

        await closeTestServer(server);
    }
});


test("Süresi dolmuş JWT 401 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const token = createToken(
            {
                userId: 999,
                username: "test-user",
                role: "user"
            },
            {
                expiresIn: -1
            }
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history?serverId=1`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        assert.strictEqual(response.status, 401);
    }
    finally {

        await closeTestServer(server);
    }
});


/*          AUTHORIZATION TESTLERİ          */

test("Admin olmayan kullanıcı admin endpointinde 403 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const token = createToken(
            {
                userId: 999,
                username: "test-user",
                role: "user"
            },
            {
                expiresIn: "5m"
            }
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/admin/users`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const body = await response.json();

        assert.strictEqual(response.status, 403);

        assert.strictEqual(
            body.message,
            "Bu işlem için admin yetkisi gerekiyor."
        );
    }
    finally {

        await closeTestServer(server);
    }
});


/*          METRIC ROUTE TESTLERİ          */

test("Geçerli JWT ile geçersiz serverId 400 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const token = createToken(
            {
                userId: 999,
                username: "test-user",
                role: "user"
            },
            {
                expiresIn: "5m"
            }
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history?serverId=abc`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const body = await response.json();

        assert.strictEqual(response.status, 400);

        assert.strictEqual(
            body.message,
            "Geçersiz serverId."
        );
    }
    finally {

        await closeTestServer(server);
    }
});


test("serverId verilmezse metrics endpointi 400 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const token = createToken(
            {
                userId: 999,
                username: "test-user",
                role: "user"
            },
            {
                expiresIn: "5m"
            }
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const body = await response.json();

        assert.strictEqual(response.status, 400);

        assert.strictEqual(
            body.message,
            "Geçersiz serverId."
        );
    }
    finally {

        await closeTestServer(server);
    }
});


test("Metric limit değeri 0 ise 400 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const token = createToken(
            {
                userId: 999,
                username: "test-user",
                role: "user"
            },
            {
                expiresIn: "5m"
            }
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history?serverId=1&limit=0`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const body = await response.json();

        assert.strictEqual(response.status, 400);

        assert.strictEqual(
            body.message,
            "Limit 1 ile 300 arasında olmalıdır."
        );
    }
    finally {

        await closeTestServer(server);
    }
});


test("Metric limit değeri 300'den büyük ise 400 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const token = createToken(
            {
                userId: 999,
                username: "test-user",
                role: "user"
            },
            {
                expiresIn: "5m"
            }
        );

        const response = await fetch(
            `http://127.0.0.1:${address.port}/metrics/cpu-history?serverId=1&limit=301`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const body = await response.json();

        assert.strictEqual(response.status, 400);

        assert.strictEqual(
            body.message,
            "Limit 1 ile 300 arasında olmalıdır."
        );
    }
    finally {

        await closeTestServer(server);
    }
});


/*          DYNAMIC ROUTE TESTLERİ          */

test("Alarm ID yerine yazı gönderilirse route eşleşmemeli ve 404 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/admin/alarms/abc`,
            {
                method: "PUT"
            }
        );

        assert.strictEqual(response.status, 404);
    }
    finally {

        await closeTestServer(server);
    }
});


test("Alarm dynamic route yanlış HTTP method ile çağrılırsa 404 dönmeli", async () => {

    const server = await createTestServer();

    try {

        const address = server.address();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/admin/alarms/12`,
            {
                method: "GET"
            }
        );

        assert.strictEqual(response.status, 404);
    }
    finally {

        await closeTestServer(server);
    }
});
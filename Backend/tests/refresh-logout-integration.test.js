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


function getRefreshTokenFromSetCookie(setCookie) {

    assert.ok(
        setCookie,
        "Set-Cookie header bulunamadı."
    );

    const match =
        setCookie.match(/refreshToken=([^;]+)/);

    assert.ok(
        match,
        "Refresh token cookie içinde bulunamadı."
    );

    return match[1];
}


function hashRefreshToken(refreshToken) {

    return crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
}


async function login(
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

    const body = await response.json();

    assert.strictEqual(
        response.status,
        200
    );

    assert.ok(
        body.token,
        "Access token bulunamadı."
    );

    const setCookie =
        response.headers.get("set-cookie");

    const refreshToken =
        getRefreshTokenFromSetCookie(setCookie);

    return {
        body,
        setCookie,
        refreshToken
    };
}


/*          REFRESH COOKIE          */

test(
    "Login refresh token cookie oluşturmalı",
    async () => {

        const server =
            await createTestServer();

        let testUser = null;

        try {

            testUser =
                await createTestAdmin();

            const port =
                server.address().port;

            const loginResult =
                await login(
                    port,
                    testUser.username,
                    testUser.password
                );

            assert.match(
                loginResult.setCookie,
                /HttpOnly/i
            );

            assert.match(
                loginResult.setCookie,
                /SameSite=Strict/i
            );

            assert.match(
                loginResult.setCookie,
                /Path=\//
            );

            const refreshHash =
                hashRefreshToken(
                    loginResult.refreshToken
                );

            const result = await pool.query(
                `
                SELECT
                    user_id,
                    token_hash,
                    revoked_at
                FROM refresh_tokens
                WHERE token_hash = $1
                `,
                [refreshHash]
            );

            assert.strictEqual(
                result.rows.length,
                1
            );

            assert.strictEqual(
                result.rows[0].user_id,
                testUser.id
            );

            assert.strictEqual(
                result.rows[0].revoked_at,
                null
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


/*          REFRESH TOKEN HATALARI          */

test(
    "Refresh token cookie olmadan /refresh 401 dönmeli",
    async () => {

        const server =
            await createTestServer();

        try {

            const port =
                server.address().port;

            const response = await fetch(
                `http://127.0.0.1:${port}/refresh`,
                {
                    method: "POST"
                }
            );

            const body =
                await response.json();

            assert.strictEqual(
                response.status,
                401
            );

            assert.strictEqual(
                body.message,
                "Refresh token bulunamadı."
            );
        }
        finally {

            await closeTestServer(server);
        }
    }
);


test(
    "Geçersiz refresh token 401 dönmeli",
    async () => {

        const server =
            await createTestServer();

        try {

            const port =
                server.address().port;

            const response = await fetch(
                `http://127.0.0.1:${port}/refresh`,
                {
                    method: "POST",

                    headers: {
                        Cookie:
                            "refreshToken=gecersiz-refresh-token"
                    }
                }
            );

            const body =
                await response.json();

            assert.strictEqual(
                response.status,
                401
            );

            assert.strictEqual(
                body.message,
                "Refresh token geçersiz."
            );
        }
        finally {

            await closeTestServer(server);
        }
    }
);


/*          TOKEN ROTATION          */

test(
    "Refresh Token Rotation eski tokenı revoke edip yeni token oluşturmalı",
    async () => {

        const server =
            await createTestServer();

        let testUser = null;

        try {

            testUser =
                await createTestAdmin();

            const port =
                server.address().port;

            const loginResult =
                await login(
                    port,
                    testUser.username,
                    testUser.password
                );

            const oldRefreshToken =
                loginResult.refreshToken;

            const oldTokenHash =
                hashRefreshToken(
                    oldRefreshToken
                );

            const oldTokenBefore =
                await pool.query(
                    `
                    SELECT
                        id,
                        session_id,
                        revoked_at
                    FROM refresh_tokens
                    WHERE token_hash = $1
                    `,
                    [oldTokenHash]
                );

            assert.strictEqual(
                oldTokenBefore.rows.length,
                1
            );

            const sessionId =
                oldTokenBefore.rows[0].session_id;


            const refreshResponse =
                await fetch(
                    `http://127.0.0.1:${port}/refresh`,
                    {
                        method: "POST",

                        headers: {
                            Cookie:
                                `refreshToken=${oldRefreshToken}`
                        }
                    }
                );

            const refreshBody =
                await refreshResponse.json();

            assert.strictEqual(
                refreshResponse.status,
                200
            );

            assert.ok(
                refreshBody.token,
                "Yeni access token bulunamadı."
            );


            const newSetCookie =
                refreshResponse.headers.get(
                    "set-cookie"
                );

            const newRefreshToken =
                getRefreshTokenFromSetCookie(
                    newSetCookie
                );

            assert.notStrictEqual(
                newRefreshToken,
                oldRefreshToken
            );


            const newTokenHash =
                hashRefreshToken(
                    newRefreshToken
                );


            const oldTokenAfter =
                await pool.query(
                    `
                    SELECT
                        revoked_at,
                        replaced_by_token_hash
                    FROM refresh_tokens
                    WHERE token_hash = $1
                    `,
                    [oldTokenHash]
                );

            assert.ok(
                oldTokenAfter.rows[0].revoked_at
            );

            assert.strictEqual(
                oldTokenAfter.rows[0]
                    .replaced_by_token_hash,
                newTokenHash
            );


            const newTokenResult =
                await pool.query(
                    `
                    SELECT
                        session_id,
                        revoked_at
                    FROM refresh_tokens
                    WHERE token_hash = $1
                    `,
                    [newTokenHash]
                );

            assert.strictEqual(
                newTokenResult.rows.length,
                1
            );

            assert.strictEqual(
                newTokenResult.rows[0].session_id,
                sessionId
            );

            assert.strictEqual(
                newTokenResult.rows[0].revoked_at,
                null
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


/*          REPLAY DETECTION          */

test(
    "Eski refresh token tekrar kullanılırsa session içindeki aktif tokenlar revoke edilmeli",
    async () => {

        const server =
            await createTestServer();

        let testUser = null;

        try {

            testUser =
                await createTestAdmin();

            const port =
                server.address().port;


            const loginResult =
                await login(
                    port,
                    testUser.username,
                    testUser.password
                );

            const oldRefreshToken =
                loginResult.refreshToken;

            const oldHash =
                hashRefreshToken(
                    oldRefreshToken
                );


            const firstRefreshResponse =
                await fetch(
                    `http://127.0.0.1:${port}/refresh`,
                    {
                        method: "POST",

                        headers: {
                            Cookie:
                                `refreshToken=${oldRefreshToken}`
                        }
                    }
                );

            assert.strictEqual(
                firstRefreshResponse.status,
                200
            );

            const firstRefreshCookie =
                firstRefreshResponse.headers.get(
                    "set-cookie"
                );

            const newRefreshToken =
                getRefreshTokenFromSetCookie(
                    firstRefreshCookie
                );

            const newHash =
                hashRefreshToken(
                    newRefreshToken
                );


            const oldTokenResult =
                await pool.query(
                    `
                    SELECT session_id
                    FROM refresh_tokens
                    WHERE token_hash = $1
                    `,
                    [oldHash]
                );

            const sessionId =
                oldTokenResult.rows[0].session_id;


            const replayResponse =
                await fetch(
                    `http://127.0.0.1:${port}/refresh`,
                    {
                        method: "POST",

                        headers: {
                            Cookie:
                                `refreshToken=${oldRefreshToken}`
                        }
                    }
                );

            const replayBody =
                await replayResponse.json();

            assert.strictEqual(
                replayResponse.status,
                401
            );

            assert.strictEqual(
                replayBody.message,
                "Refresh token tekrar kullanılmış veya iptal edilmiş."
            );


            const newTokenResult =
                await pool.query(
                    `
                    SELECT revoked_at
                    FROM refresh_tokens
                    WHERE token_hash = $1
                    `,
                    [newHash]
                );

            assert.ok(
                newTokenResult.rows[0].revoked_at
            );


            const activeTokens =
                await pool.query(
                    `
                    SELECT COUNT(*)::INTEGER AS count
                    FROM refresh_tokens
                    WHERE session_id = $1
                      AND revoked_at IS NULL
                    `,
                    [sessionId]
                );

            assert.strictEqual(
                activeTokens.rows[0].count,
                0
            );


            const clearedCookie =
                replayResponse.headers.get(
                    "set-cookie"
                );

            assert.match(
                clearedCookie,
                /Max-Age=0/i
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


/*          LOGOUT          */

test(
    "Logout refresh tokenı revoke edip cookieyi temizlemeli",
    async () => {

        const server =
            await createTestServer();

        let testUser = null;

        try {

            testUser =
                await createTestAdmin();

            const port =
                server.address().port;


            const loginResult =
                await login(
                    port,
                    testUser.username,
                    testUser.password
                );

            const refreshToken =
                loginResult.refreshToken;

            const refreshHash =
                hashRefreshToken(
                    refreshToken
                );


            const beforeLogout =
                await pool.query(
                    `
                    SELECT revoked_at
                    FROM refresh_tokens
                    WHERE token_hash = $1
                    `,
                    [refreshHash]
                );

            assert.strictEqual(
                beforeLogout.rows.length,
                1
            );

            assert.strictEqual(
                beforeLogout.rows[0].revoked_at,
                null
            );


            const logoutResponse =
                await fetch(
                    `http://127.0.0.1:${port}/logout`,
                    {
                        method: "POST",

                        headers: {
                            Cookie:
                                `refreshToken=${refreshToken}`
                        }
                    }
                );

            const logoutBody =
                await logoutResponse.json();

            assert.strictEqual(
                logoutResponse.status,
                200
            );

            assert.strictEqual(
                logoutBody.success,
                true
            );

            assert.strictEqual(
                logoutBody.message,
                "Çıkış başarılı."
            );


            const afterLogout =
                await pool.query(
                    `
                    SELECT revoked_at
                    FROM refresh_tokens
                    WHERE token_hash = $1
                    `,
                    [refreshHash]
                );

            assert.ok(
                afterLogout.rows[0].revoked_at
            );


            const logoutCookie =
                logoutResponse.headers.get(
                    "set-cookie"
                );

            assert.match(
                logoutCookie,
                /Max-Age=0/i
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
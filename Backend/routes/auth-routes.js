const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const loginAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_DURATION_MS = 10 * 60 * 1000;

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;


function registerFailedLogin(attemptKey) {

    const currentAttempt = loginAttempts.get(attemptKey);

    const failedAttempts = currentAttempt
        ? currentAttempt.failedAttempts + 1
        : 1;

    if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {

        loginAttempts.set(attemptKey, {
            failedAttempts,
            blockedUntil: Date.now() + LOGIN_BLOCK_DURATION_MS
        });

        return true;
    }

    loginAttempts.set(attemptKey, {
        failedAttempts,
        blockedUntil: null
    });

    return false;
}


function createRefreshToken() {

    return crypto
        .randomBytes(64)
        .toString("hex");
}


function hashRefreshToken(refreshToken) {

    return crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
}


function getCookie(req, cookieName) {

    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader.split(";");

    for (const cookie of cookies) {

        const separatorIndex =
            cookie.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const name =
            cookie
                .slice(0, separatorIndex)
                .trim();

        const value =
            cookie
                .slice(separatorIndex + 1)
                .trim();

        if (name === cookieName) {
            return value;
        }
    }

    return null;
}


function setRefreshTokenCookie(res, refreshToken) {

    const cookieParts = [
        `refreshToken=${refreshToken}`,
        "HttpOnly",
        "SameSite=Strict",
        "Path=/",
        `Max-Age=${Math.floor(
            REFRESH_TOKEN_DURATION_MS / 1000
        )}`
    ];

    if (process.env.NODE_ENV === "production") {
        cookieParts.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookieParts.join("; ")
    );
}


function clearRefreshTokenCookie(res) {

    const cookieParts = [
        "refreshToken=",
        "HttpOnly",
        "SameSite=Strict",
        "Path=/",
        "Max-Age=0"
    ];

    if (process.env.NODE_ENV === "production") {
        cookieParts.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookieParts.join("; ")
    );
}


function createAccessToken(user, jwtSecret) {

    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
            role: user.role
        },
        jwtSecret,
        {
            expiresIn:
                ACCESS_TOKEN_EXPIRES_IN
        }
    );
}


async function handleLoginRoutes(req, res, jwtSecret) {

    /*
        LOGIN
    */

    if (
        req.method === "POST" &&
        req.url === "/login"
    ) {

        console.log("Login isteği geldi.");

        let body = "";

        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {

            try {

                const loginData =
                    JSON.parse(body);

                const username =
                    loginData.username;

                const password =
                    loginData.password;

                const normalizedUsername =
                    typeof username === "string"
                        ? username.trim()
                        : "";

                const clientIp =
                    req.socket.remoteAddress;

                const attemptKey =
                    `${clientIp}:${normalizedUsername}`;

                const attemptInfo =
                    loginAttempts.get(attemptKey);


                if (
                    attemptInfo &&
                    attemptInfo.blockedUntil &&
                    attemptInfo.blockedUntil > Date.now()
                ) {

                    res.writeHead(429, {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message:
                            "Çok fazla hatalı giriş denemesi. Lütfen daha sonra tekrar deneyin."
                    }));

                    return;
                }


                if (
                    attemptInfo &&
                    attemptInfo.blockedUntil &&
                    attemptInfo.blockedUntil <= Date.now()
                ) {
                    loginAttempts.delete(attemptKey);
                }


                if (
                    !normalizedUsername ||
                    typeof password !== "string" ||
                    !password
                ) {

                    res.writeHead(400, {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message:
                            "Kullanıcı adı ve şifre geçerli olmalıdır."
                    }));

                    return;
                }


                const result =
                    await pool.query(
                        `
                        SELECT
                            id,
                            username,
                            password_hash,
                            role,
                            is_active
                        FROM users
                        WHERE username = $1
                        `,
                        [normalizedUsername]
                    );


                if (result.rows.length === 0) {

                    const isBlocked =
                        registerFailedLogin(
                            attemptKey
                        );

                    if (isBlocked) {

                        res.writeHead(429, {
                            "Content-Type":
                                "application/json; charset=utf-8"
                        });

                        res.end(JSON.stringify({
                            success: false,
                            message:
                                "Çok fazla hatalı giriş denemesi. 10 dakika boyunca giriş yapamazsınız."
                        }));

                        return;
                    }

                    res.writeHead(401, {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message:
                            "Kullanıcı adı veya şifre hatalı."
                    }));

                    return;
                }


                const user = result.rows[0];


                if (!user.is_active) {

                    res.writeHead(401, {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message:
                            "Kullanıcı hesabı pasif."
                    }));

                    return;
                }


                const isPasswordCorrect =
                    await bcrypt.compare(
                        password,
                        user.password_hash
                    );


                if (!isPasswordCorrect) {

                    const isBlocked =
                        registerFailedLogin(
                            attemptKey
                        );

                    if (isBlocked) {

                        res.writeHead(429, {
                            "Content-Type":
                                "application/json; charset=utf-8"
                        });

                        res.end(JSON.stringify({
                            success: false,
                            message:
                                "Çok fazla hatalı giriş denemesi. 10 dakika boyunca giriş yapamazsınız."
                        }));

                        return;
                    }

                    res.writeHead(401, {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message:
                            "Kullanıcı adı veya şifre hatalı."
                    }));

                    return;
                }


                loginAttempts.delete(attemptKey);


                const accessToken =
                    createAccessToken(
                        user,
                        jwtSecret
                    );


                const refreshToken =
                    createRefreshToken();

                const refreshTokenHash =
                    hashRefreshToken(
                        refreshToken
                    );

                const sessionId =
                    crypto.randomUUID();

                const expiresAt =
                    new Date(
                        Date.now() +
                        REFRESH_TOKEN_DURATION_MS
                    );


                await pool.query(
                    `
                    INSERT INTO refresh_tokens (
                        user_id,
                        session_id,
                        token_hash,
                        expires_at
                    )
                    VALUES ($1, $2, $3, $4)
                    `,
                    [
                        user.id,
                        sessionId,
                        refreshTokenHash,
                        expiresAt
                    ]
                );


                setRefreshTokenCookie(
                    res,
                    refreshToken
                );


                res.writeHead(200, {
                    "Content-Type":
                        "application/json; charset=utf-8"
                });


                res.end(JSON.stringify({
                    success: true,
                    message: "Giriş başarılı.",
                    token: accessToken,
                    userId: user.id,
                    username: user.username,
                    role: user.role
                }));
            }
            catch (error) {

                console.error(
                    "Login hatası:",
                    error
                );

                if (!res.headersSent) {
                    res.writeHead(500, {
                        "Content-Type":
                            "application/json; charset=utf-8"
                    });
                }

                res.end(JSON.stringify({
                    success: false,
                    message:
                        "Sunucu hatası oluştu."
                }));
            }
        });

        return true;
    }


    /*
        REFRESH TOKEN
    */

    if (
        req.method === "POST" &&
        req.url === "/refresh"
    ) {

        const refreshToken =
            getCookie(
                req,
                "refreshToken"
            );


        if (!refreshToken) {

            res.writeHead(401, {
                "Content-Type":
                    "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message:
                    "Refresh token bulunamadı."
            }));

            return true;
        }


        const refreshTokenHash =
            hashRefreshToken(
                refreshToken
            );


        const client =
            await pool.connect();


        try {

            await client.query("BEGIN");


            const tokenResult =
                await client.query(
                    `
                    SELECT
                        rt.id,
                        rt.user_id,
                        rt.session_id,
                        rt.token_hash,
                        rt.expires_at,
                        rt.revoked_at,
                        u.username,
                        u.role,
                        u.is_active
                    FROM refresh_tokens rt
                    INNER JOIN users u
                        ON rt.user_id = u.id
                    WHERE rt.token_hash = $1
                    FOR UPDATE
                    `,
                    [refreshTokenHash]
                );


            if (tokenResult.rows.length === 0) {

                await client.query(
                    "ROLLBACK"
                );

                clearRefreshTokenCookie(
                    res
                );

                res.writeHead(401, {
                    "Content-Type":
                        "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message:
                        "Refresh token geçersiz."
                }));

                return true;
            }


            const storedToken =
                tokenResult.rows[0];


            /*
                Eski / iptal edilmiş token
                tekrar kullanılmışsa:
                aynı session içindeki bütün
                aktif refresh tokenları iptal et.
            */

            if (storedToken.revoked_at) {

                await client.query(
                    `
                    UPDATE refresh_tokens
                    SET revoked_at =
                        COALESCE(
                            revoked_at,
                            CURRENT_TIMESTAMP
                        )
                    WHERE session_id = $1
                    AND revoked_at IS NULL
                    `,
                    [
                        storedToken.session_id
                    ]
                );


                await client.query(
                    "COMMIT"
                );


                clearRefreshTokenCookie(
                    res
                );


                res.writeHead(401, {
                    "Content-Type":
                        "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message:
                        "Refresh token tekrar kullanılmış veya iptal edilmiş."
                }));

                return true;
            }


            if (
                new Date(
                    storedToken.expires_at
                ).getTime() <= Date.now()
            ) {

                await client.query(
                    `
                    UPDATE refresh_tokens
                    SET revoked_at =
                        CURRENT_TIMESTAMP
                    WHERE id = $1
                    `,
                    [
                        storedToken.id
                    ]
                );


                await client.query(
                    "COMMIT"
                );


                clearRefreshTokenCookie(
                    res
                );


                res.writeHead(401, {
                    "Content-Type":
                        "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message:
                        "Refresh token süresi dolmuş."
                }));

                return true;
            }


            if (!storedToken.is_active) {

                await client.query(
                    `
                    UPDATE refresh_tokens
                    SET revoked_at =
                        COALESCE(
                            revoked_at,
                            CURRENT_TIMESTAMP
                        )
                    WHERE session_id = $1
                    AND revoked_at IS NULL
                    `,
                    [
                        storedToken.session_id
                    ]
                );


                await client.query(
                    "COMMIT"
                );


                clearRefreshTokenCookie(
                    res
                );


                res.writeHead(401, {
                    "Content-Type":
                        "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message:
                        "Kullanıcı hesabı pasif."
                }));

                return true;
            }


            const newRefreshToken =
                createRefreshToken();

            const newRefreshTokenHash =
                hashRefreshToken(
                    newRefreshToken
                );

            const newExpiresAt =
                new Date(
                    Date.now() +
                    REFRESH_TOKEN_DURATION_MS
                );


            await client.query(
                `
                UPDATE refresh_tokens
                SET
                    revoked_at =
                        CURRENT_TIMESTAMP,
                    replaced_by_token_hash =
                        $1
                WHERE id = $2
                `,
                [
                    newRefreshTokenHash,
                    storedToken.id
                ]
            );


            await client.query(
                `
                INSERT INTO refresh_tokens (
                    user_id,
                    session_id,
                    token_hash,
                    expires_at
                )
                VALUES ($1, $2, $3, $4)
                `,
                [
                    storedToken.user_id,
                    storedToken.session_id,
                    newRefreshTokenHash,
                    newExpiresAt
                ]
            );


            const accessToken =
                createAccessToken(
                    {
                        id:
                            storedToken.user_id,

                        username:
                            storedToken.username,

                        role:
                            storedToken.role
                    },
                    jwtSecret
                );


            await client.query(
                "COMMIT"
            );


            setRefreshTokenCookie(
                res,
                newRefreshToken
            );


            res.writeHead(200, {
                "Content-Type":
                    "application/json; charset=utf-8"
            });


            res.end(JSON.stringify({
                success: true,
                message:
                    "Access token yenilendi.",
                token:
                    accessToken
            }));


            return true;
        }
        catch (error) {

            await client.query(
                "ROLLBACK"
            );


            console.error(
                "Refresh token hatası:",
                error
            );


            if (!res.headersSent) {
                res.writeHead(500, {
                    "Content-Type":
                        "application/json; charset=utf-8"
                });
            }


            res.end(JSON.stringify({
                success: false,
                message:
                    "Sunucu hatası oluştu."
            }));


            return true;
        }
        finally {

            client.release();
        }
    }

    if (
        req.method === "POST" &&
        req.url === "/logout"
    ) {

        const refreshToken =
            getCookie(
                req,
                "refreshToken"
            );

        try {

            if (refreshToken) {

                const refreshTokenHash =
                    hashRefreshToken(
                        refreshToken
                    );

                await pool.query(
                    `
                    UPDATE refresh_tokens
                    SET revoked_at =
                        COALESCE(
                            revoked_at,
                            CURRENT_TIMESTAMP
                        )
                    WHERE token_hash = $1
                    `,
                    [
                        refreshTokenHash
                    ]
                );
            }

            clearRefreshTokenCookie(res);

            res.writeHead(200, {
                "Content-Type":
                    "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: true,
                message:
                    "Çıkış başarılı."
            }));

            return true;
        }
        catch (error) {

            console.error(
                "Logout hatası:",
                error
            );

            if (!res.headersSent) {
                res.writeHead(500, {
                    "Content-Type":
                        "application/json; charset=utf-8"
                });
            }

            res.end(JSON.stringify({
                success: false,
                message:
                    "Sunucu hatası oluştu."
            }));

            return true;
        }
    }


    return false;
}

module.exports = handleLoginRoutes;
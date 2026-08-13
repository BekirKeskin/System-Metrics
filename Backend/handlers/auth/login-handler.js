const pool = require("../../db");
const bcrypt = require("bcrypt");

const {
    createAccessToken,
    createRefreshToken,
    hashRefreshToken,
    createSessionId,
    createRefreshTokenExpirationDate,
    setRefreshTokenCookie
} = require("../../services/auth/auth-token-service");

const {
    isLoginBlocked,
    registerFailedLogin,
    clearLoginAttempts
} = require("../../services/auth/login-attempt-service");

async function handleLogin(req, res, jwtSecret) {

    console.log("Login isteği geldi.");

    let body = "";

    req.on("data", (chunk) => {
        body += chunk.toString();
    });

    req.on("end", async () => {

        try {

            const loginData = JSON.parse(body);
            const username = loginData.username;
            const password = loginData.password;
            
            const normalizedUsername = typeof username === "string" ? username.trim() : "";
            const clientIp = req.socket.remoteAddress;
            const attemptKey = `${clientIp}:${normalizedUsername}`;

            if (isLoginBlocked(attemptKey)) {

                res.writeHead(429, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Çok fazla hatalı giriş denemesi. Lütfen daha sonra tekrar deneyin."
                }));
                return;
            }

            if (!normalizedUsername || typeof password !== "string" || !password) {

                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Kullanıcı adı ve şifre geçerli olmalıdır."
                }));
                return;
            }

            const result = await pool.query(
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
                [
                    normalizedUsername
                ]
            );

            if (result.rows.length === 0) {

                const isBlocked = registerFailedLogin(attemptKey);

                if (isBlocked) {

                    res.writeHead(429, {
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message: "Çok fazla hatalı giriş denemesi. 10 dakika boyunca giriş yapamazsınız."
                    }));
                    return;
                }

                res.writeHead(401, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Kullanıcı adı veya şifre hatalı."
                }));
                return;
            }

            const user = result.rows[0];

            if (!user.is_active) {

                res.writeHead(401, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Kullanıcı hesabı pasif."
                }));
                return;
            }

            const isPasswordCorrect =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );

            if (!isPasswordCorrect) {

                const isBlocked = registerFailedLogin(attemptKey);

                if (isBlocked) {

                    res.writeHead(429, {
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message: "Çok fazla hatalı giriş denemesi. 10 dakika boyunca giriş yapamazsınız."
                    }));
                    return;
                }

                res.writeHead(401, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Kullanıcı adı veya şifre hatalı."
                }));
                return;
            }

            clearLoginAttempts(attemptKey);

            const accessToken = createAccessToken(user, jwtSecret);
            const refreshToken = createRefreshToken();
            const refreshTokenHash = hashRefreshToken(refreshToken);
            const sessionId = createSessionId();
            const expiresAt = createRefreshTokenExpirationDate();

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
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: true,
                message: "Giriş başarılı.",
                token:accessToken,
                userId: user.id,
                username: user.username,
                role: user.role
            }));
        }
        catch (error) {

            console.error("Login hatası:", error);

            if (!res.headersSent) {

                res.writeHead(500, {
                    "Content-Type": "application/json; charset=utf-8"
                });
            }

            res.end(JSON.stringify({
                success: false,
                message:
                    "Sunucu hatası oluştu."
            }));
        }
    });
}

module.exports = handleLogin;
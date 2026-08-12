const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const loginAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_DURATION_MS = 10 * 60 * 1000;

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

async function handleLoginRoutes(req, res, jwtSecret) {

    if(req.method === "POST" && req.url === "/login"){ // iki isteğinde doğruluğunu onaylıyoruz
        
        console.log("Login isteği geldi.");
        let body = "";

        req.on("data",(chunk)=>{ //chunk isteğin gelen bir parçası  ilk hali Buffer olabilir
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
                const attemptInfo = loginAttempts.get(attemptKey);

                if (
                    attemptInfo &&
                    attemptInfo.blockedUntil &&
                    attemptInfo.blockedUntil > Date.now()
                ) {
                    res.writeHead(429, {
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message: "Çok fazla hatalı giriş denemesi. Lütfen daha sonra tekrar deneyin."
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
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message: "Kullanıcı adı ve şifre geçerli olmalıdır."
                    }));

                    return;
                }

                // $1 kullanıcıdan gelen değeri SQL metnine doğrudan yapıştırmamızı engeller
                const result = await pool.query(
                    `SELECT id, username, password_hash, role, is_active
                    FROM users
                    WHERE username = $1`,
                    [normalizedUsername] // $1 yerine gönderilen değer
                );
                if (result.rows.length === 0) {

                    const isBlocked = registerFailedLogin(attemptKey);

                    if (isBlocked) {
                        res.writeHead(429, {
                            "Content-Type": "application/json; charset=utf-8"
                        });

                        res.end(JSON.stringify({
                            success: false,
                            message: "Çok fazla hatalı giriş denemesi. 1 dakika boyunca giriş yapamazsınız."
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

                if(!user.is_active) {
                
                    res.writeHead(401, {
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message: "Kullanıcı hesabı pasif."
                    }));

                    return;
                }

                const isPasswordCorrect = await bcrypt.compare(
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
                            message: "Çok fazla hatalı giriş denemesi. 1 dakika boyunca giriş yapamazsınız."
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

                loginAttempts.delete(attemptKey);

                const jwtToken = jwt.sign(
                    {
                        userId: user.id,
                        username: user.username,
                        role: user.role
                    },
                    jwtSecret,
                    {
                        expiresIn: "1h"
                    }
                );
                

                res.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: true,
                    message: "Giriş başarılı.",
                    token: jwtToken,
                    userId: user.id,
                    username: user.username,
                    role: user.role
                }));
            } 
            catch(error) {
                console.error("Login hatası:", error);

                if (!res.headersSent) {
                    res.writeHead(500, {
                        "Content-Type": "application/json; charset=utf-8"
                    });
                }

                res.end(JSON.stringify({
                    success: false,
                    message: "Sunucu hatası oluştu"
                }));
            }
        });
        return true;
    }
    return false;
}

module.exports = handleLoginRoutes;
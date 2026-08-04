const pool = require("../db");
const bcrypt = require("bcrypt");

async function handleLoginRoutes(req, res, loginToken) {

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

                // $1 kullanıcıdan gelen değeri SQL metnine doğrudan yapıştırmamızı engeller
                const result = await pool.query(
                    `SELECT id, username, password_hash, role, is_active
                    FROM users
                    WHERE username = $1`,
                    [username] // $1 yerine gönderilen değer
                );
                if (result.rows.length === 0) {

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

                if(!isPasswordCorrect) {

                    res.writeHead(401, {
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message: "Kullanıcı adı veya şifre hatalı."
                    }));

                    return;
                }

                res.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: true,
                    message: "Giriş başarılı.",
                    token: loginToken,
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
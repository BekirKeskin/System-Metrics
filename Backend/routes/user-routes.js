const pool = require("../db");
const bcrypt = require("bcrypt");

async function handleUserRoutes(req, res) {

    if(req.method === "POST" && req.url === "/admin/users") {
        
        console.log("Kullanıcı ekleme isteği geldi.");
        let body = "";

        req.on("data",(chunk)=>{ //chunk isteğin gelen bir parçası  ilk hali Buffer olabilir
            body += chunk.toString();
        });

        req.on("end", async ()=>{
            try {
                const addData = JSON.parse(body);
                const username = addData.username;
                const name = addData.name;
                const surname = addData.surname;
                const email = addData.email;
                const password = addData.password;

                if (!username || !name || !surname || !email || !password) {

                    res.writeHead(400,{
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    res.end(JSON.stringify({
                        success: false,
                        message: "Tüm alanları giriniz !!!"
                    }));
                    return;
                }

                const passwordHash = await bcrypt.hash(password,10);

                const result = await pool.query(
                    `INSERT INTO users (
                        username,
                        name,
                        surname,
                        email,
                        password_hash,
                        role
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id, username, name, surname, email, role, is_active, created_at`,
                    [
                        username,
                        name,
                        surname,
                        email,
                        passwordHash,
                        "user"
                    ]
                );
                console.log(result.rows[0]);

                res.writeHead(201, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: true,
                    message: "Kullanıcı başarıyla oluşturuldu.",
                    user: result.rows[0]
                }));
            }
            catch (error){
                console.error("Ekleme hatası:", error);

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

    if(req.method === "GET" && req.url === "/admin/users") {

        try {

            const result = await pool.query(
                `SELECT id, username, name, surname, email, role, is_active FROM users`
            );

            res.writeHead(200,{
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: true,
                message: "Değerler getirildi.",
                users: result.rows
            }));
        }
        catch (error) {
            console.error("Değerler getirilemedi !!!", error);

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
        return true;
    }
    return false;
}

module.exports = handleUserRoutes;
const pool = require("../../db");
const bcrypt = require("bcrypt");


async function handleCreateUser(req, res) {

    console.log("Kullanıcı ekleme isteği geldi.");

    let body = "";

    req.on("data", (chunk) => {
        body += chunk.toString();
    });

    req.on("end", async () => {

        try {

            const addData = JSON.parse(body);

            const username = addData.username;
            const name = addData.name;
            const surname = addData.surname;
            const email = addData.email;
            const password = addData.password;

            const normalizedUsername = typeof username === "string" ? username.trim() : "";
            const normalizedName = typeof name === "string" ? name.trim() : "";
            const normalizedSurname = typeof surname === "string" ? surname.trim() : "";
            const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (
                !normalizedUsername ||
                normalizedUsername.length < 2 ||
                normalizedUsername.length > 30 ||
                !normalizedName ||
                normalizedName.length < 2 ||
                normalizedName.length > 50 ||
                !normalizedSurname ||
                normalizedSurname.length < 2 ||
                normalizedSurname.length > 50 ||
                !normalizedEmail ||
                normalizedEmail.length > 254 ||
                !emailPattern.test(normalizedEmail) ||
                typeof password !== "string" ||
                password.length < 8 ||
                password.length > 72
            ) {

                res.writeHead(400, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Tüm alanları giriniz !!!"
                }));

                return;
            }

            const existingUserResult = await pool.query(
                `SELECT username, email
                FROM users
                WHERE username = $1 OR email = $2`,
                [
                    normalizedUsername,
                    normalizedEmail
                ]
            );

            if (existingUserResult.rows.some((user) => user.username === normalizedUsername)) {

                res.writeHead(409, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Bu kullanıcı adı zaten kullanılıyor."
                }));

                return;
            }

            if (existingUserResult.rows.some((user) => user.email === normalizedEmail)) {

                res.writeHead(409, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "Bu e-posta adresi zaten kullanılıyor."
                }));

                return;
            }

            const passwordHash = await bcrypt.hash(password, 10);

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
                RETURNING
                    id,
                    username,
                    name,
                    surname,
                    email,
                    role,
                    is_active,
                    created_at`,
                [
                    normalizedUsername,
                    normalizedName,
                    normalizedSurname,
                    normalizedEmail,
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
        catch (error) {

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
}

module.exports = handleCreateUser;
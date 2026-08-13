const pool = require("../../db");


async function handleGetUsers(req, res) {

    try {

        const result = await pool.query(
            `SELECT
                id,
                username,
                name,
                surname,
                email,
                role,
                is_active
            FROM users`
        );

        res.writeHead(200, {
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
}

module.exports = handleGetUsers;
const bcrypt = require("bcrypt");
const pool = require("./db");

async function createAdmin() {

    try {
        const username = process.env.ADMIN_USERNAME;
        const name = process.env.ADMIN_NAME;
        const surname = process.env.ADMIN_SURNAME;
        const email = process.env.ADMIN_EMAIL;
        const password = process.env.ADMIN_PASSWORD;

        if(!username || !name || !surname || !email || !password) {
            throw new Error("Admin verilerinden biri eksik !!!");
        }

        const passwordHash = await bcrypt.hash(password,10);

        // $1 $2 parametreli sorguymuş
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
            RETURNING id, username, role, created_at`,
            [
                username,
                name,
                surname,
                email,
                passwordHash,
                "admin",
            ]
        );
        console.log(result.rows[0]);
    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}
createAdmin();
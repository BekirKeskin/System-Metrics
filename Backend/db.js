const dotenv = require("dotenv");
dotenv.config();
const { Pool } = require("pg");

const databaseName =
    process.env.NODE_ENV === "test"
        ? process.env.DB_TEST_NAME
        : process.env.DB_NAME;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: databaseName,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

module.exports = pool;
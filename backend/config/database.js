
"use strict";

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cheri_fashion",

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    charset: "utf8mb4",
    timezone: "+07:00"
});

async function verifyDatabaseConnection() {
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.query("SELECT 1");

        console.log("MySQL connection: SUCCESS");
        return true;
    } catch (error) {
        console.error("MySQL connection: FAILED");
        console.error("Error:", error.message);
        return false;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    pool,
    verifyDatabaseConnection
};


"use strict";

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    // Ưu tiên IPv4 loopback để tránh cấu hình localhost bị phân giải khác nhau trên Windows.\n    host: process.env.DB_HOST || "127.0.0.1",
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
        console.error("Error code:", error.code || "UNKNOWN");\n        console.error("Error:", error.message);\n        if (error.code === "ER_HOST_NOT_PRIVILEGED") {\n            console.error("MariaDB đã nhận kết nối nhưng từ chối host. Cần sửa quyền User@Host trong MariaDB; đổi DB_HOST đơn thuần không cấp quyền.");\n        }
        return false;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    pool,
    verifyDatabaseConnection
};

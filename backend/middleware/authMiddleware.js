
"use strict";

const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization || "";
        const parts = authHeader.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để thực hiện thao tác này."
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error("Thiếu JWT_SECRET trong file .env");

            return res.status(500).json({
                success: false,
                message: "Máy chủ chưa được cấu hình xác thực."
            });
        }

        const decoded = jwt.verify(parts[1], process.env.JWT_SECRET);
        const userId = decoded.sub;

        if (!userId || !/^[1-9]\d*$/.test(String(userId))) {
            return res.status(401).json({
                success: false,
                message: "Token đăng nhập không hợp lệ."
            });
        }

        const [rows] = await pool.execute(
            `SELECT id, full_name, email, phone, role, status
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );

        if (rows.length === 0 || rows[0].status !== "active") {
            return res.status(401).json({
                success: false,
                message: "Tài khoản không tồn tại hoặc đã bị khóa."
            });
        }

        const account = rows[0];

        req.user = {
            id: String(account.id),
            fullName: account.full_name,
            email: account.email,
            phone: account.phone,
            role: account.role
        };

        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError") {
            return res.status(401).json({
                success: false,
                message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại."
            });
        }

        console.error("Lỗi xác thực người dùng:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể xác thực tài khoản lúc này."
        });
    }
}

// Cho phép đặt hàng khi chưa đăng nhập.
// Nếu có gửi token, token phải hợp lệ.
function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        req.user = null;
        return next();
    }

    return authMiddleware(req, res, next);
}

module.exports = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
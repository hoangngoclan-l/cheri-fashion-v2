
"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

const router = express.Router();

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function createToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error("Chưa cấu hình JWT_SECRET trong file .env");
    }

    return jwt.sign(
        {
            role: user.role
        },
        process.env.JWT_SECRET,
        {
            subject: String(user.id),
            expiresIn: process.env.JWT_EXPIRES_IN || "1d"
        }
    );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
    try {
        const fullName = String(req.body.fullName || "").trim();
        const email = normalizeEmail(req.body.email);
        const phone = String(req.body.phone || "").trim();
        const password = String(req.body.password || "");

        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập họ tên, email và mật khẩu."
            });
        }

        if (fullName.length > 150 || email.length > 190 ||
            phone.length > 30) {
            return res.status(400).json({
                success: false,
                message: "Thông tin nhập vào vượt quá độ dài cho phép."
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Email không hợp lệ."
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({
                success: false,
                message: "Mật khẩu phải có từ 8 đến 72 ký tự."
            });
        }

        const [existing] = await pool.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [email]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email này đã được đăng ký."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await pool.execute(
            `INSERT INTO users
                (full_name, email, phone, password_hash, role, status)
             VALUES (?, ?, ?, ?, 'customer', 'active')`,
            [fullName, email, phone || null, passwordHash]
        );

        const user = {
            id: result.insertId,
            fullName,
            email,
            phone,
            role: "customer"
        };

        return res.status(201).json({
            success: true,
            message: "Đăng ký tài khoản thành công.",
            token: createToken(user),
            user
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "Email này đã được đăng ký."
            });
        }

        console.error("Lỗi đăng ký:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể đăng ký lúc này. Vui lòng thử lại."
        });
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập email và mật khẩu."
            });
        }

        const [rows] = await pool.execute(
            `SELECT id, full_name, email, phone,
                    password_hash, role, status
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Email hoặc mật khẩu không chính xác."
            });
        }

        const account = rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            account.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Email hoặc mật khẩu không chính xác."
            });
        }

        if (account.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ."
            });
        }

        const user = {
            id: account.id,
            fullName: account.full_name,
            email: account.email,
            phone: account.phone,
            role: account.role
        };

        return res.json({
            success: true,
            message: "Đăng nhập thành công.",
            token: createToken(user),
            user
        });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể đăng nhập lúc này. Vui lòng thử lại."
        });
    }
});

module.exports = router;


"use strict";

const express = require("express");
const { pool } = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

function validText(value, maxLength) {
    return typeof value === "string" &&
        value.trim().length > 0 &&
        value.trim().length <= maxLength;
}

// GET /api/profile: Lấy hồ sơ của khách hàng đang đăng nhập.
router.get("/", async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT id, full_name, email, phone, role, created_at
             FROM users WHERE id = ? LIMIT 1`,
            [req.user.id]
        );

        if (!users.length) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy tài khoản."
            });
        }

        const [addresses] = await pool.execute(
            `SELECT id, recipient_name, phone, province, district,
                    ward, street_address, is_default, created_at
             FROM addresses
             WHERE user_id = ?
             ORDER BY is_default DESC, id DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            user: users[0],
            addresses
        });
    } catch (error) {
        console.error("Lỗi lấy hồ sơ:", error);
        res.status(500).json({
            success: false,
            message: "Không thể tải hồ sơ khách hàng."
        });
    }
});

// PUT /api/profile: Cập nhật họ tên và số điện thoại.
router.put("/", async (req, res) => {
    try {
        const fullName = String(req.body.fullName || "").trim();
        const phone = String(req.body.phone || "").trim();

        if (!validText(fullName, 150)) {
            return res.status(400).json({
                success: false,
                message: "Họ tên không được để trống và tối đa 150 ký tự."
            });
        }

        if (phone.length > 30) {
            return res.status(400).json({
                success: false,
                message: "Số điện thoại tối đa 30 ký tự."
            });
        }

        await pool.execute(
            `UPDATE users
             SET full_name = ?, phone = ?
             WHERE id = ?`,
            [fullName, phone || null, req.user.id]
        );

        const [rows] = await pool.execute(
            `SELECT id, full_name, email, phone, role, created_at
             FROM users WHERE id = ? LIMIT 1`,
            [req.user.id]
        );

        res.json({
            success: true,
            message: "Cập nhật thông tin thành công.",
            user: rows[0]
        });
    } catch (error) {
        console.error("Lỗi cập nhật hồ sơ:", error);
        res.status(500).json({
            success: false,
            message: "Không thể cập nhật thông tin."
        });
    }
});

// POST /api/profile/addresses: Thêm địa chỉ giao hàng.
router.post("/addresses", async (req, res) => {
    const recipientName = String(req.body.recipientName || "").trim();
    const phone = String(req.body.phone || "").trim();
    const province = String(req.body.province || "").trim();
    const district = String(req.body.district || "").trim();
    const ward = String(req.body.ward || "").trim();
    const streetAddress = String(req.body.streetAddress || "").trim();
    const isDefault = req.body.isDefault === true ||
        req.body.isDefault === 1 ||
        req.body.isDefault === "1";

    if (
        !validText(recipientName, 150) ||
        !validText(phone, 30) ||
        !validText(province, 120) ||
        !validText(district, 120) ||
        !validText(ward, 120) ||
        !validText(streetAddress, 255)
    ) {
        return res.status(400).json({
            success: false,
            message: "Vui lòng nhập đầy đủ và đúng độ dài thông tin địa chỉ."
        });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            "SELECT id FROM addresses WHERE user_id = ? LIMIT 1",
            [req.user.id]
        );

        // Địa chỉ đầu tiên tự động là địa chỉ mặc định.
        const makeDefault = isDefault || existing.length === 0;

        if (makeDefault) {
            await connection.execute(
                "UPDATE addresses SET is_default = 0 WHERE user_id = ?",
                [req.user.id]
            );
        }

        const [result] = await connection.execute(
            `INSERT INTO addresses
             (user_id, recipient_name, phone, province, district,
              ward, street_address, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                recipientName,
                phone,
                province,
                district,
                ward,
                streetAddress,
                makeDefault ? 1 : 0
            ]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: "Đã thêm địa chỉ giao hàng.",
            addressId: result.insertId
        });
    } catch (error) {
        await connection.rollback();
        console.error("Lỗi thêm địa chỉ:", error);
        res.status(500).json({
            success: false,
            message: "Không thể thêm địa chỉ."
        });
    } finally {
        connection.release();
    }
});

// PUT /api/profile/addresses/:id: Cập nhật địa chỉ thuộc tài khoản.
router.put("/addresses/:id", async (req, res) => {
    const id = req.params.id;

    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({
            success: false,
            message: "Mã địa chỉ không hợp lệ."
        });
    }

    const recipientName = String(req.body.recipientName || "").trim();
    const phone = String(req.body.phone || "").trim();
    const province = String(req.body.province || "").trim();
    const district = String(req.body.district || "").trim();
    const ward = String(req.body.ward || "").trim();
    const streetAddress = String(req.body.streetAddress || "").trim();
    const isDefault = req.body.isDefault === true ||
        req.body.isDefault === 1 ||
        req.body.isDefault === "1";

    if (
        !validText(recipientName, 150) ||
        !validText(phone, 30) ||
        !validText(province, 120) ||
        !validText(district, 120) ||
        !validText(ward, 120) ||
        !validText(streetAddress, 255)
    ) {
        return res.status(400).json({
            success: false,
            message: "Vui lòng nhập đầy đủ và đúng độ dài thông tin địa chỉ."
        });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [owned] = await connection.execute(
            "SELECT id FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE",
            [id, req.user.id]
        );

        if (!owned.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy địa chỉ trong tài khoản của bạn."
            });
        }

        if (isDefault) {
            await connection.execute(
                "UPDATE addresses SET is_default = 0 WHERE user_id = ?",
                [req.user.id]
            );
        }

        await connection.execute(
            `UPDATE addresses
             SET recipient_name = ?, phone = ?, province = ?,
                 district = ?, ward = ?, street_address = ?, is_default = ?
             WHERE id = ? AND user_id = ?`,
            [
                recipientName, phone, province, district, ward,
                streetAddress, isDefault ? 1 : 0, id, req.user.id
            ]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Đã cập nhật địa chỉ."
        });
    } catch (error) {
        await connection.rollback();
        console.error("Lỗi cập nhật địa chỉ:", error);
        res.status(500).json({
            success: false,
            message: "Không thể cập nhật địa chỉ."
        });
    } finally {
        connection.release();
    }
});

// PATCH /api/profile/addresses/:id/default: Chọn địa chỉ mặc định.
router.patch("/addresses/:id/default", async (req, res) => {
    const id = req.params.id;

    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({
            success: false,
            message: "Mã địa chỉ không hợp lệ."
        });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [owned] = await connection.execute(
            "SELECT id FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE",
            [id, req.user.id]
        );

        if (!owned.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy địa chỉ trong tài khoản của bạn."
            });
        }

        await connection.execute(
            "UPDATE addresses SET is_default = 0 WHERE user_id = ?",
            [req.user.id]
        );

        await connection.execute(
            "UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?",
            [id, req.user.id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Đã chọn địa chỉ mặc định."
        });
    } catch (error) {
        await connection.rollback();
        console.error("Lỗi chọn địa chỉ mặc định:", error);
        res.status(500).json({
            success: false,
            message: "Không thể chọn địa chỉ mặc định."
        });
    } finally {
        connection.release();
    }
});

// DELETE /api/profile/addresses/:id: Xóa địa chỉ thuộc tài khoản.
router.delete("/addresses/:id", async (req, res) => {
    const id = req.params.id;

    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({
            success: false,
            message: "Mã địa chỉ không hợp lệ."
        });
    }

    try {
        const [result] = await pool.execute(
            "DELETE FROM addresses WHERE id = ? AND user_id = ?",
            [id, req.user.id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy địa chỉ trong tài khoản của bạn."
            });
        }

        res.json({
            success: true,
            message: "Đã xóa địa chỉ."
        });
    } catch (error) {
        console.error("Lỗi xóa địa chỉ:", error);
        res.status(500).json({
            success: false,
            message: "Không thể xóa địa chỉ."
        });
    }
});

module.exports = router;

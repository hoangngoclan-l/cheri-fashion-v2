
"use strict";

const express = require("express");
const { pool } = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Mọi thao tác yêu cầu đăng nhập.
router.use(authMiddleware);

router.get("/", async (req, res) => {
    try {
        const [items] = await pool.execute(
            `SELECT
                wi.id AS wishlist_item_id,
                wi.product_id,
                wi.created_at,
                p.product_code,
                p.name,
                p.price,
                p.image,
                p.stock
             FROM wishlist_items wi
             INNER JOIN products p ON p.id = wi.product_id
             WHERE wi.user_id = ?
             ORDER BY wi.created_at DESC`,
            [req.user.id]
        );

        return res.json({
            success: true,
            items
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách yêu thích:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể tải danh sách yêu thích."
        });
    }
});

// POST /api/wishlist
// Thêm sản phẩm vào danh sách yêu thích.
router.post("/", async (req, res) => {
    try {
        const productId = Number(
            req.body.productId ?? req.body.product_id
        );

        if (!Number.isSafeInteger(productId) || productId < 1) {
            return res.status(400).json({
                success: false,
                message: "Mã sản phẩm không hợp lệ."
            });
        }

        const [products] = await pool.execute(
            `SELECT id
             FROM products
             WHERE id = ? AND status = 'active'
             LIMIT 1`,
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Sản phẩm không tồn tại hoặc đã ngừng bán."
            });
        }

        // INSERT IGNORE tránh lỗi khi sản phẩm đã được yêu thích.
        await pool.execute(
            `INSERT IGNORE INTO wishlist_items (user_id, product_id)
             VALUES (?, ?)`,
            [req.user.id, productId]
        );

        return res.json({
            success: true,
            message: "Đã cập nhật danh sách yêu thích."
        });
    } catch (error) {
        console.error("Lỗi thêm sản phẩm yêu thích:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể thêm sản phẩm yêu thích."
        });
    }
});

// DELETE /api/wishlist/:productId
// Xóa một sản phẩm khỏi danh sách yêu thích.
router.delete("/:productId", async (req, res) => {
    try {
        const productId = Number(req.params.productId);

        if (!Number.isSafeInteger(productId) || productId < 1) {
            return res.status(400).json({
                success: false,
                message: "Mã sản phẩm không hợp lệ."
            });
        }

        const [result] = await pool.execute(
            `DELETE FROM wishlist_items
             WHERE user_id = ? AND product_id = ?`,
            [req.user.id, productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Sản phẩm không có trong danh sách yêu thích."
            });
        }

        return res.json({
            success: true,
            message: "Đã xóa sản phẩm khỏi danh sách yêu thích."
        });
    } catch (error) {
        console.error("Lỗi xóa sản phẩm yêu thích:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể xóa sản phẩm yêu thích."
        });
    }
});

// DELETE /api/wishlist
// Xóa toàn bộ danh sách yêu thích của tài khoản hiện tại.
router.delete("/", async (req, res) => {
    try {
        await pool.execute(
            "DELETE FROM wishlist_items WHERE user_id = ?",
            [req.user.id]
        );

        return res.json({
            success: true,
            message: "Đã xóa danh sách yêu thích."
        });
    } catch (error) {
        console.error("Lỗi xóa danh sách yêu thích:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể xóa danh sách yêu thích."
        });
    }
});

module.exports = router;

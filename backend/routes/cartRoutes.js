
"use strict";

const express = require("express");
const { pool } = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


// Tất cả API giỏ hàng đều yêu cầu đăng nhập.
router.use(authMiddleware);

// GET /api/cart
// Lấy giỏ hàng của tài khoản hiện tại.
router.get("/", async (req, res) => {
    try {
        const [items] = await pool.execute(
            `SELECT
                ci.id AS cart_item_id,
                ci.product_id,
                ci.size,
                ci.color,
                ci.quantity,
                p.product_code,
                p.name,
                p.price,
                p.image,
                p.stock
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             WHERE ci.user_id = ?
             ORDER BY ci.updated_at DESC`,
            [req.user.id]
        );

        return res.json({
            success: true,
            items
        });
    } catch (error) {
        console.error("Lỗi lấy giỏ hàng:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể tải giỏ hàng."
        });
    }
});

// POST /api/cart
// Thêm sản phẩm hoặc cộng số lượng nếu cùng sản phẩm, size, màu.
router.post("/", async (req, res) => {
    try {
        const productId = Number(req.body.productId ?? req.body.product_id);
        const size = String(req.body.size || "").trim();
        const color = String(req.body.color || "").trim();
        const quantity = Number(req.body.quantity ?? 1);

        if (
            !Number.isSafeInteger(productId) ||
            productId < 1 ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 99 ||
            size.length > 50 ||
            color.length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Thông tin sản phẩm hoặc số lượng không hợp lệ."
            });
        }

        const [products] = await pool.execute(
            `SELECT id, stock, status
             FROM products
             WHERE id = ?
             LIMIT 1`,
            [productId]
        );

        if (products.length === 0 || products[0].status !== "active") {
            return res.status(404).json({
                success: false,
                message: "Sản phẩm không tồn tại hoặc đã ngừng bán."
            });
        }

        const [existing] = await pool.execute(
            `SELECT id, quantity
             FROM cart_items
             WHERE user_id = ?
               AND product_id = ?
               AND size = ?
               AND color = ?
             LIMIT 1`,
            [req.user.id, productId, size, color]
        );

        const newQuantity =
            (existing.length ? Number(existing[0].quantity) : 0) + quantity;

        if (newQuantity > 99 || newQuantity > Number(products[0].stock)) {
            return res.status(400).json({
                success: false,
                message: "Số lượng vượt quá tồn kho hoặc giới hạn 99 sản phẩm."
            });
        }

        if (existing.length > 0) {
            await pool.execute(
                `UPDATE cart_items
                 SET quantity = ?
                 WHERE id = ? AND user_id = ?`,
                [newQuantity, existing[0].id, req.user.id]
            );
        } else {
            await pool.execute(
                `INSERT INTO cart_items
                    (user_id, product_id, size, color, quantity)
                 VALUES (?, ?, ?, ?, ?)`,
                [req.user.id, productId, size, color, quantity]
            );
        }

        return res.status(200).json({
            success: true,
            message: "Đã cập nhật giỏ hàng."
        });
    } catch (error) {
        console.error("Lỗi thêm giỏ hàng:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể cập nhật giỏ hàng."
        });
    }
});

// PATCH /api/cart/:id
// Cập nhật số lượng của một dòng giỏ hàng thuộc tài khoản hiện tại.
router.patch("/:id", async (req, res) => {
    try {
        const cartItemId = Number(req.params.id);
        const quantity = Number(req.body.quantity);

        if (
            !Number.isSafeInteger(cartItemId) ||
            cartItemId < 1 ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 99
        ) {
            return res.status(400).json({
                success: false,
                message: "Mã giỏ hàng hoặc số lượng không hợp lệ."
            });
        }

        const [items] = await pool.execute(
            `SELECT ci.id, p.stock
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             WHERE ci.id = ? AND ci.user_id = ?
             LIMIT 1`,
            [cartItemId, req.user.id]
        );

        if (items.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sản phẩm trong giỏ hàng."
            });
        }

        if (quantity > Number(items[0].stock)) {
            return res.status(400).json({
                success: false,
                message: "Số lượng vượt quá tồn kho."
            });
        }

        await pool.execute(
            `UPDATE cart_items
             SET quantity = ?
             WHERE id = ? AND user_id = ?`,
            [quantity, cartItemId, req.user.id]
        );

        return res.json({
            success: true,
            message: "Đã cập nhật số lượng."
        });
    } catch (error) {
        console.error("Lỗi cập nhật giỏ hàng:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể cập nhật số lượng."
        });
    }
});

// DELETE /api/cart/:id
// Xóa một dòng giỏ hàng của tài khoản hiện tại.
router.delete("/:id", async (req, res) => {
    try {
        const cartItemId = Number(req.params.id);

        if (!Number.isSafeInteger(cartItemId) || cartItemId < 1) {
            return res.status(400).json({
                success: false,
                message: "Mã sản phẩm trong giỏ hàng không hợp lệ."
            });
        }

        const [result] = await pool.execute(
            `DELETE FROM cart_items
             WHERE id = ? AND user_id = ?`,
            [cartItemId, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sản phẩm trong giỏ hàng."
            });
        }

        return res.json({
            success: true,
            message: "Đã xóa sản phẩm khỏi giỏ hàng."
        });
    } catch (error) {
        console.error("Lỗi xóa sản phẩm giỏ hàng:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể xóa sản phẩm."
        });
    }
});

// DELETE /api/cart
// Xóa toàn bộ giỏ hàng của tài khoản hiện tại.
router.delete("/", async (req, res) => {
    try {
        await pool.execute(
            "DELETE FROM cart_items WHERE user_id = ?",
            [req.user.id]
        );

        return res.json({
            success: true,
            message: "Đã xóa giỏ hàng."
        });
    } catch (error) {
        console.error("Lỗi xóa giỏ hàng:", error);
        return res.status(500).json({
            success: false,
            message: "Không thể xóa giỏ hàng."
        });
    }
});

module.exports = router;

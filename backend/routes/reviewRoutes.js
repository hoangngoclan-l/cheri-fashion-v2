"use strict";

const express = require("express");
const { pool } = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Public: chỉ hiển thị đánh giá đã được Admin duyệt.
router.get("/products/:productId", async (req, res) => {
    const productId = Number(req.params.productId);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({ success: false, message: "Mã sản phẩm không hợp lệ." });
    }
    try {
        const [[summary]] = await pool.execute(
            `SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0) AS average_rating,
                    SUM(rating = 5) AS five_star, SUM(rating = 4) AS four_star,
                    SUM(rating = 3) AS three_star, SUM(rating = 2) AS two_star,
                    SUM(rating = 1) AS one_star
             FROM product_reviews WHERE product_id = ? AND status = 'approved'`,
            [productId]
        );
        const [reviews] = await pool.execute(
            `SELECT r.id, r.rating, r.content, r.created_at, u.full_name AS reviewer_name
             FROM product_reviews r
             INNER JOIN users u ON u.id = r.user_id
             WHERE r.product_id = ? AND r.status = 'approved'
             ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
            [productId, limit, (page - 1) * limit]
        );
        return res.json({
            success: true,
            summary: {
                total: Number(summary.total || 0),
                averageRating: Number(Number(summary.average_rating || 0).toFixed(1)),
                distribution: {
                    5: Number(summary.five_star || 0), 4: Number(summary.four_star || 0),
                    3: Number(summary.three_star || 0), 2: Number(summary.two_star || 0),
                    1: Number(summary.one_star || 0)
                }
            },
            reviews,
            pagination: { page, limit, total: Number(summary.total || 0), totalPages: Math.ceil(Number(summary.total || 0) / limit) }
        });
    } catch (error) {
        console.error("Lỗi tải đánh giá sản phẩm:", error);
        return res.status(500).json({ success: false, message: "Không thể tải đánh giá sản phẩm." });
    }
});

// Customer: lấy các dòng hàng đủ điều kiện đánh giá trên trang sản phẩm.
router.get("/eligible/:productId", authMiddleware, async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({ success: false, message: "Mã sản phẩm không hợp lệ." });
    }
    try {
        const [items] = await pool.execute(
            `SELECT oi.id AS order_item_id, oi.order_id, o.order_code,
                    oi.product_name, oi.size, oi.color_name, oi.quantity, o.created_at
             FROM order_items oi
             INNER JOIN orders o ON o.id = oi.order_id
             LEFT JOIN product_reviews r ON r.order_item_id = oi.id
             WHERE oi.product_id = ? AND o.user_id = ?
               AND o.order_status = 'completed' AND o.payment_status = 'paid'
               AND r.id IS NULL
             ORDER BY o.created_at DESC, oi.id DESC`,
            [productId, req.user.id]
        );
        return res.json({ success: true, items });
    } catch (error) {
        console.error("Lỗi tải sản phẩm đủ điều kiện đánh giá:", error);
        return res.status(500).json({ success: false, message: "Không thể tải quyền đánh giá sản phẩm." });
    }
});

// Customer: chỉ tài khoản có đơn đã hoàn thành và thanh toán mới được đánh giá đúng dòng hàng đã mua.
router.post("/", authMiddleware, async (req, res) => {
    const orderId = Number(req.body.order_id);
    const orderItemId = Number(req.body.order_item_id);
    const rating = Number(req.body.rating);
    const content = String(req.body.content || "").trim();

    if (!Number.isSafeInteger(orderId) || orderId <= 0 ||
        !Number.isSafeInteger(orderItemId) || orderItemId <= 0 ||
        !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        content.length < 10 || content.length > 2000) {
        return res.status(400).json({
            success: false,
            message: "Vui lòng chọn số sao và nhập nội dung đánh giá từ 10 đến 2.000 ký tự."
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [orders] = await connection.execute(
            `SELECT id FROM orders
             WHERE id = ? AND user_id = ? AND order_status = 'completed' AND payment_status = 'paid'
             FOR UPDATE`,
            [orderId, req.user.id]
        );
        if (!orders.length) {
            await connection.rollback();
            return res.status(403).json({
                success: false,
                message: "Chỉ có thể đánh giá sản phẩm thuộc đơn hàng đã hoàn thành và thanh toán."
            });
        }

        const [items] = await connection.execute(
            `SELECT id, product_id FROM order_items
             WHERE id = ? AND order_id = ? AND product_id IS NOT NULL
             FOR UPDATE`,
            [orderItemId, orderId]
        );
        if (!items.length) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Sản phẩm không thuộc đơn hàng này hoặc không còn hợp lệ." });
        }

        const [existing] = await connection.execute(
            "SELECT id FROM product_reviews WHERE order_item_id = ? LIMIT 1",
            [orderItemId]
        );
        if (existing.length) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Sản phẩm trong đơn hàng này đã được đánh giá." });
        }

        const [result] = await connection.execute(
            `INSERT INTO product_reviews (user_id, product_id, order_id, order_item_id, rating, content, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [req.user.id, items[0].product_id, orderId, orderItemId, rating, content]
        );
        await connection.commit();
        return res.status(201).json({
            success: true,
            message: "Đánh giá đã được gửi và đang chờ CHERI kiểm duyệt.",
            reviewId: result.insertId
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => {});
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "Sản phẩm trong đơn hàng này đã được đánh giá." });
        }
        console.error("Lỗi gửi đánh giá:", error);
        return res.status(500).json({ success: false, message: "Không thể gửi đánh giá lúc này." });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;

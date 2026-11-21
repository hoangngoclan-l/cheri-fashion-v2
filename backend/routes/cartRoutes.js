"use strict";

const express = require("express");
const { pool } = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authMiddleware);

// GET /api/cart
router.get("/", async (req, res) => {
    try {
        const [items] = await pool.execute(
            `SELECT
                ci.id AS cart_item_id,
                ci.product_id,
                ci.variant_id,
                COALESCE(pv.size, ci.size) AS size,
                COALESCE(pv.color_name, ci.color) AS color,
                pv.color_code,
                pv.sku,
                ci.quantity,
                p.product_code,
                p.name,
                COALESCE(pv.price, p.price) AS price,
                p.image,
                CASE WHEN ci.variant_id IS NOT NULL THEN pv.stock ELSE p.stock END AS stock
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             LEFT JOIN product_variants pv ON pv.id = ci.variant_id
             WHERE ci.user_id = ?
             ORDER BY ci.updated_at DESC`,
            [req.user.id]
        );

        return res.json({ success: true, items });
    } catch (error) {
        console.error("Lỗi lấy giỏ hàng:", error);
        return res.status(500).json({ success: false, message: "Không thể tải giỏ hàng." });
    }
});

// POST /api/cart
router.post("/", async (req, res) => {
    try {
        const productId = Number(req.body.productId ?? req.body.product_id);
        const rawVariantId = req.body.variantId ?? req.body.variant_id;
        const variantId = rawVariantId === undefined || rawVariantId === null || rawVariantId === ""
            ? null : Number(rawVariantId);
        const size = String(req.body.size || "").trim();
        const color = String(req.body.color || "").trim();
        const quantity = Number(req.body.quantity ?? 1);

        if (
            !Number.isSafeInteger(productId) || productId < 1 ||
            (variantId !== null && (!Number.isSafeInteger(variantId) || variantId < 1)) ||
            !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99 ||
            size.length > 50 || color.length > 100
        ) {
            return res.status(400).json({ success: false, message: "Thông tin sản phẩm hoặc số lượng không hợp lệ." });
        }

        const [products] = await pool.execute(
            "SELECT id, stock, status FROM products WHERE id = ? LIMIT 1",
            [productId]
        );
        if (!products.length || products[0].status !== "active") {
            return res.status(404).json({ success: false, message: "Sản phẩm không tồn tại hoặc đã ngừng bán." });
        }

        const [variants] = await pool.execute(
            "SELECT id, size, color_name, price, stock, status FROM product_variants WHERE product_id = ? AND status = 'active'",
            [productId]
        );

        let stock = Number(products[0].stock);
        let resolvedSize = size;
        let resolvedColor = color;
        if (variants.length > 0 && variantId === null) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn màu sắc và kích thước cụ thể." });
        }
        if (variantId !== null) {
            const selected = variants.find(item => Number(item.id) === variantId);
            if (!selected) {
                return res.status(400).json({ success: false, message: "Biến thể không hợp lệ hoặc đã ngừng bán." });
            }
            stock = Number(selected.stock);
            resolvedSize = selected.size || "";
            resolvedColor = selected.color_name || "";
            if (stock < 1) {
                return res.status(400).json({ success: false, message: "Biến thể này hiện đã hết hàng." });
            }
        }

        const [existing] = await pool.execute(
            `SELECT id, quantity FROM cart_items
             WHERE user_id = ? AND product_id = ?
               AND ((variant_id IS NULL AND ? IS NULL) OR variant_id = ?)
             LIMIT 1`,
            [req.user.id, productId, variantId, variantId]
        );
        const newQuantity = (existing.length ? Number(existing[0].quantity) : 0) + quantity;
        if (newQuantity > 99 || newQuantity > stock) {
            return res.status(400).json({ success: false, message: "Số lượng vượt quá tồn kho hoặc giới hạn 99 sản phẩm." });
        }

        if (existing.length) {
            await pool.execute(
                "UPDATE cart_items SET quantity = ?, size = ?, color = ? WHERE id = ? AND user_id = ?",
                [newQuantity, resolvedSize, resolvedColor, existing[0].id, req.user.id]
            );
        } else {
            await pool.execute(
                `INSERT INTO cart_items (user_id, product_id, variant_id, size, color, quantity)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.id, productId, variantId, resolvedSize, resolvedColor, quantity]
            );
        }

        return res.status(200).json({ success: true, message: "Đã cập nhật giỏ hàng." });
    } catch (error) {
        console.error("Lỗi thêm giỏ hàng:", error);
        return res.status(500).json({ success: false, message: "Không thể cập nhật giỏ hàng." });
    }
});

// PATCH /api/cart/:id
router.patch("/:id", async (req, res) => {
    try {
        const cartItemId = Number(req.params.id);
        const quantity = Number(req.body.quantity);
        if (!Number.isSafeInteger(cartItemId) || cartItemId < 1 ||
            !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
            return res.status(400).json({ success: false, message: "Mã giỏ hàng hoặc số lượng không hợp lệ." });
        }

        const [items] = await pool.execute(
            `SELECT ci.id, ci.variant_id,
                    CASE WHEN ci.variant_id IS NOT NULL THEN pv.stock ELSE p.stock END AS stock,
                    pv.status AS variant_status, p.status AS product_status
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             LEFT JOIN product_variants pv ON pv.id = ci.variant_id
             WHERE ci.id = ? AND ci.user_id = ? LIMIT 1`,
            [cartItemId, req.user.id]
        );
        if (!items.length) {
            return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm trong giỏ hàng." });
        }
        const item = items[0];
        if (item.product_status !== "active" ||
            (item.variant_id !== null && item.variant_status !== "active") ||
            quantity > Number(item.stock)) {
            return res.status(400).json({ success: false, message: "Sản phẩm/biến thể đã ngừng bán hoặc số lượng vượt tồn kho." });
        }

        await pool.execute(
            "UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?",
            [quantity, cartItemId, req.user.id]
        );
        return res.json({ success: true, message: "Đã cập nhật số lượng." });
    } catch (error) {
        console.error("Lỗi cập nhật giỏ hàng:", error);
        return res.status(500).json({ success: false, message: "Không thể cập nhật số lượng." });
    }
});

// DELETE /api/cart/:id
router.delete("/:id", async (req, res) => {
    try {
        const cartItemId = Number(req.params.id);
        if (!Number.isSafeInteger(cartItemId) || cartItemId < 1) {
            return res.status(400).json({ success: false, message: "Mã sản phẩm trong giỏ hàng không hợp lệ." });
        }
        const [result] = await pool.execute(
            "DELETE FROM cart_items WHERE id = ? AND user_id = ?",
            [cartItemId, req.user.id]
        );
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm trong giỏ hàng." });
        }
        return res.json({ success: true, message: "Đã xóa sản phẩm khỏi giỏ hàng." });
    } catch (error) {
        console.error("Lỗi xóa sản phẩm giỏ hàng:", error);
        return res.status(500).json({ success: false, message: "Không thể xóa sản phẩm." });
    }
});

// DELETE /api/cart
router.delete("/", async (req, res) => {
    try {
        await pool.execute("DELETE FROM cart_items WHERE user_id = ?", [req.user.id]);
        return res.json({ success: true, message: "Đã xóa giỏ hàng." });
    } catch (error) {
        console.error("Lỗi xóa giỏ hàng:", error);
        return res.status(500).json({ success: false, message: "Không thể xóa giỏ hàng." });
    }
});

module.exports = router;

"use strict";

const express = require("express");
const { pool } = require("../config/database");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();
router.use(adminMiddleware);

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipping", "delivered", "cancelled", "returned"];
const PRODUCT_STATUSES = ["active", "inactive", "out_of_stock"];

function positiveId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sendError(res, error, message) {
    console.error(message, error);
    return res.status(500).json({ success: false, message });
}

// GET /api/admin/dashboard
router.get("/dashboard", async (req, res) => {
    try {
        const [[sales]] = await pool.execute(`
            SELECT
                COUNT(*) AS total_orders,
                COALESCE(SUM(CASE WHEN order_status <> 'cancelled' THEN total_amount ELSE 0 END), 0) AS gross_revenue,
                SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_orders
            FROM orders
        `);
        const [[counts]] = await pool.execute(`
            SELECT
                (SELECT COUNT(*) FROM products) AS total_products,
                (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
                (SELECT COUNT(*) FROM products WHERE stock <= 5 AND status = 'active') AS low_stock
        `);
        const [recentOrders] = await pool.execute(`
            SELECT id, order_code, recipient_name, total_amount, order_status, payment_status, created_at
            FROM orders ORDER BY created_at DESC, id DESC LIMIT 8
        `);
        const [topProducts] = await pool.execute(`
            SELECT product_name, SUM(quantity) AS units_sold, SUM(line_total) AS revenue
            FROM order_items GROUP BY product_name
            ORDER BY units_sold DESC LIMIT 5
        `);
        return res.json({ success: true, metrics: { ...sales, ...counts }, recentOrders, topProducts });
    } catch (error) {
        return sendError(res, error, "Không thể tải dữ liệu tổng quan.");
    }
});

// GET /api/admin/products
router.get("/products", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim().slice(0, 100);
        const status = String(req.query.status || "").trim();
        const params = [];
        let where = "WHERE 1=1";
        if (q) {
            where += " AND (name LIKE ? OR product_code LIKE ? OR category LIKE ?)";
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (PRODUCT_STATUSES.includes(status)) {
            where += " AND status = ?";
            params.push(status);
        }
        const [products] = await pool.execute(
            `SELECT id, product_code, name, category, category_slug, price, old_price, image, description, is_new, is_sale, stock, status, created_at FROM products ${where} ORDER BY id DESC LIMIT 250`,
            params
        );
        return res.json({ success: true, products });
    } catch (error) {
        return sendError(res, error, "Không thể tải danh sách sản phẩm.");
    }
});

// POST /api/admin/products
router.post("/products", async (req, res) => {
    const body = req.body || {};
    const productCode = String(body.product_code || "").trim();
    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const categorySlug = String(body.category_slug || "").trim();
    const price = Number(body.price);
    const oldPrice = Number(body.old_price || 0);
    const stock = Number(body.stock || 0);
    if (!productCode || !name || !category || !categorySlug ||
        productCode.length > 60 || name.length > 220 ||
        !Number.isFinite(price) || price < 0 ||
        !Number.isFinite(oldPrice) || oldPrice < 0 ||
        !Number.isSafeInteger(stock) || stock < 0) {
        return res.status(400).json({ success: false, message: "Dữ liệu sản phẩm không hợp lệ." });
    }
    try {
        const [result] = await pool.execute(`
            INSERT INTO products (product_code, name, category, category_slug, price, old_price, image, description, is_new, is_sale, stock, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            productCode, name, category, categorySlug, price, oldPrice,
            String(body.image || "").trim() || null,
            String(body.description || "").trim() || null,
            body.is_new ? 1 : 0, body.is_sale ? 1 : 0, stock,
            PRODUCT_STATUSES.includes(body.status) ? body.status : "active"
        ]);
        return res.status(201).json({ success: true, productId: result.insertId, message: "Đã tạo sản phẩm." });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "Mã sản phẩm đã tồn tại." });
        }
        return sendError(res, error, "Không thể tạo sản phẩm.");
    }
});

// PUT /api/admin/products/:id
router.put("/products/:id", async (req, res) => {
    const id = positiveId(req.params.id);
    const body = req.body || {};
    if (!id) return res.status(400).json({ success: false, message: "ID sản phẩm không hợp lệ." });
    const productCode = String(body.product_code || "").trim();
    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const categorySlug = String(body.category_slug || "").trim();
    const price = Number(body.price);
    const oldPrice = Number(body.old_price || 0);
    const stock = Number(body.stock);
    const status = String(body.status || "active");
    if (!productCode || !name || !category || !categorySlug ||
        !Number.isFinite(price) || price < 0 || !Number.isFinite(oldPrice) || oldPrice < 0 ||
        !Number.isSafeInteger(stock) || stock < 0 || !PRODUCT_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: "Dữ liệu cập nhật sản phẩm không hợp lệ." });
    }
    try {
        const [result] = await pool.execute(`
            UPDATE products SET product_code=?, name=?, category=?, category_slug=?, price=?, old_price=?,
                image=?, description=?, is_new=?, is_sale=?, stock=?, status=? WHERE id=?
        `, [
            productCode, name, category, categorySlug, price, oldPrice,
            String(body.image || "").trim() || null,
            String(body.description || "").trim() || null,
            body.is_new ? 1 : 0, body.is_sale ? 1 : 0, stock, status, id
        ]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm." });
        return res.json({ success: true, message: "Đã cập nhật sản phẩm." });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Mã sản phẩm đã được sử dụng." });
        return sendError(res, error, "Không thể cập nhật sản phẩm.");
    }
});

// DELETE /api/admin/products/:id - lưu trữ mềm để không phá đơn hàng cũ.
router.delete("/products/:id", async (req, res) => {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID sản phẩm không hợp lệ." });
    try {
        const [result] = await pool.execute("UPDATE products SET status='inactive' WHERE id=?", [id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm." });
        return res.json({ success: true, message: "Đã ngừng kinh doanh sản phẩm." });
    } catch (error) {
        return sendError(res, error, "Không thể ngừng kinh doanh sản phẩm.");
    }
});

// GET /api/admin/orders
router.get("/orders", async (req, res) => {
    try {
        const status = String(req.query.status || "").trim();
        const q = String(req.query.q || "").trim().slice(0, 100);
        const clauses = [];
        const params = [];
        if (ORDER_STATUSES.includes(status)) { clauses.push("o.order_status = ?"); params.push(status); }
        if (q) {
            clauses.push("(o.order_code LIKE ? OR o.recipient_name LIKE ? OR o.phone LIKE ?)");
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
        const [orders] = await pool.execute(`
            SELECT o.id, o.order_code, o.recipient_name, o.phone, o.total_amount,
                o.payment_method, o.payment_status, o.order_status, o.created_at,
                u.email AS customer_email
            FROM orders o LEFT JOIN users u ON u.id = o.user_id
            ${where} ORDER BY o.created_at DESC LIMIT 300
        `, params);
        return res.json({ success: true, orders });
    } catch (error) {
        return sendError(res, error, "Không thể tải đơn hàng.");
    }
});

// PATCH /api/admin/orders/:id/status
router.patch("/orders/:id/status", async (req, res) => {
    const id = positiveId(req.params.id);
    const status = String(req.body.status || "").trim();
    if (!id || !ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: "Đơn hàng hoặc trạng thái không hợp lệ." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.execute(
            "SELECT id, order_status FROM orders WHERE id = ? FOR UPDATE", [id]
        );
        if (!orders.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
        }

        const current = orders[0].order_status;
        if (current === status) {
            await connection.commit();
            return res.json({ success: true, message: "Đơn hàng đã ở trạng thái này." });
        }

        const transitions = {
            pending: ["confirmed", "cancelled"],
            confirmed: ["processing", "cancelled"],
            processing: ["shipping", "cancelled"],
            shipping: ["delivered"],
            delivered: ["returned"],
            cancelled: [],
            returned: []
        };
        if (!transitions[current]?.includes(status)) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: `Không thể chuyển đơn từ "${current}" sang "${status}".`
            });
        }

        if (status === "cancelled") {
            const [items] = await connection.execute(
                "SELECT product_id, quantity FROM order_items WHERE order_id = ?",
                [id]
            );
            if (!items.length || items.some(item => item.product_id == null)) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: "Đơn hàng cũ thiếu liên kết sản phẩm để hoàn kho an toàn. Cần đối soát tồn kho thủ công trước khi hủy."
                });
            }
            for (const item of items) {
                await connection.execute(
                    "UPDATE products SET stock = stock + ? WHERE id = ?",
                    [item.quantity, item.product_id]
                );
            }
        }

        await connection.execute("UPDATE orders SET order_status = ? WHERE id = ?", [status, id]);
        await connection.commit();
        return res.json({
            success: true,
            message: status === "cancelled"
                ? "Đã hủy đơn và hoàn lại tồn kho."
                : "Đã cập nhật trạng thái đơn hàng."
        });
    } catch (error) {
        await connection.rollback();
        return sendError(res, error, "Không thể cập nhật trạng thái đơn hàng.");
    } finally {
        connection.release();
    }
});

// GET /api/admin/customers
router.get("/customers", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim().slice(0, 100);
        const params = [];
        let where = "WHERE role = 'customer'";
        if (q) {
            where += " AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)";
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        const [customers] = await pool.execute(`
            SELECT id, full_name, email, phone, status, created_at
            FROM users ${where} ORDER BY created_at DESC LIMIT 300
        `, params);
        return res.json({ success: true, customers });
    } catch (error) {
        return sendError(res, error, "Không thể tải danh sách khách hàng.");
    }
});

// PATCH /api/admin/customers/:id/status
router.patch("/customers/:id/status", async (req, res) => {
    const id = positiveId(req.params.id);
    const status = String(req.body.status || "").trim();
    if (!id || !["active", "inactive", "blocked"].includes(status)) {
        return res.status(400).json({ success: false, message: "Khách hàng hoặc trạng thái không hợp lệ." });
    }
    try {
        const [result] = await pool.execute(
            "UPDATE users SET status=? WHERE id=? AND role='customer'",
            [status, id]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy khách hàng." });
        return res.json({ success: true, message: "Đã cập nhật trạng thái khách hàng." });
    } catch (error) {
        return sendError(res, error, "Không thể cập nhật khách hàng.");
    }
});

module.exports = router;

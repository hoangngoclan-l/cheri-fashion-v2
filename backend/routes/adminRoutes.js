"use strict";

const express = require("express");
const { pool } = require("../config/database");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();
router.use(adminMiddleware);

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipping", "completed", "cancelled"];
const PRODUCT_STATUSES = ["active", "inactive"];

function positiveId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function syncProductStock(productId, executor = pool) {
    await executor.execute(`
        UPDATE products
        SET stock = (
            SELECT COALESCE(SUM(stock), 0)
            FROM product_variants
            WHERE product_id = ? AND status = 'active'
        )
        WHERE id = ?
    `, [productId, productId]);
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
            SELECT oi.product_name, SUM(oi.quantity) AS units_sold, SUM(oi.line_total) AS revenue
            FROM order_items oi
            INNER JOIN orders o ON o.id = oi.order_id
            WHERE o.order_status <> 'cancelled'
            GROUP BY oi.product_name
            ORDER BY units_sold DESC LIMIT 5
        `);
        return res.json({ success: true, metrics: { ...sales, ...counts }, recentOrders, topProducts });
    } catch (error) {
        return sendError(res, error, "Không thể tải dữ liệu tổng quan.");
    }
});

// GET /api/admin/categories
router.get("/categories", async (req, res) => {
    try {
        const [categories] = await pool.execute(
            "SELECT id, name, slug FROM categories WHERE is_active = 1 ORDER BY name ASC"
        );
        return res.json({ success: true, categories });
    } catch (error) {
        return sendError(res, error, "Không thể tải danh sách danh mục.");
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
    const categoryId = positiveId(body.category_id);
    const price = Number(body.price);
    const oldPrice = Number(body.old_price || 0);
    const stock = Number(body.stock || 0);
    const status = String(body.status || "active");
    if (!productCode || !name || !categoryId ||
        productCode.length > 50 || name.length > 220 ||
        !Number.isFinite(price) || price < 0 ||
        !Number.isFinite(oldPrice) || oldPrice < 0 ||
        !Number.isSafeInteger(stock) || stock < 0 || !PRODUCT_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: "Dữ liệu sản phẩm không hợp lệ." });
    }
    try {
        const [[categoryRow]] = await pool.execute(
            "SELECT id, name, slug FROM categories WHERE id = ? AND is_active = 1 LIMIT 1",
            [categoryId]
        );

        if (!categoryRow) {
            return res.status(400).json({
                success: false,
                message: "Danh mục không tồn tại hoặc đã ngừng hoạt động."
            });
        }

        const [result] = await pool.execute(`
            INSERT INTO products (product_code, name, category, category_slug, price, old_price, image, description, is_new, is_sale, stock, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            productCode, name, categoryRow.name, categoryRow.slug, price, oldPrice,
            String(body.image || "").trim() || null,
            String(body.description || "").trim() || null,
            body.is_new ? 1 : 0, body.is_sale ? 1 : 0, stock,
            status
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
    const categoryId = positiveId(body.category_id);
    const price = Number(body.price);
    const oldPrice = Number(body.old_price || 0);
    const stock = Number(body.stock);
    const status = String(body.status || "active");
    if (!productCode || !name || !categoryId ||
        productCode.length > 50 || name.length > 220 ||
        !Number.isFinite(price) || price < 0 || !Number.isFinite(oldPrice) || oldPrice < 0 ||
        !Number.isSafeInteger(stock) || stock < 0 || !PRODUCT_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: "Dữ liệu cập nhật sản phẩm không hợp lệ." });
    }
    try {
        const [[categoryRow]] = await pool.execute(
            "SELECT id, name, slug FROM categories WHERE id = ? AND is_active = 1 LIMIT 1",
            [categoryId]
        );

        if (!categoryRow) {
            return res.status(400).json({
                success: false,
                message: "Danh mục không tồn tại hoặc đã ngừng hoạt động."
            });
        }

        const [result] = await pool.execute(`
            UPDATE products SET product_code=?, name=?, category=?, category_slug=?, price=?, old_price=?,
                image=?, description=?, is_new=?, is_sale=?, stock=?, status=? WHERE id=?
        `, [
            productCode, name, categoryRow.name, categoryRow.slug, price, oldPrice,
            String(body.image || "").trim() || null,
            String(body.description || "").trim() || null,
            body.is_new ? 1 : 0, body.is_sale ? 1 : 0, stock, status, id
        ]);
        if (!result.affectedRows) {
            const [existing] = await pool.execute("SELECT id FROM products WHERE id = ? LIMIT 1", [id]);
            if (!existing.length) {
                return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm." });
            }
        }

        // Với sản phẩm đã quản lý tồn kho bằng biến thể, stock tổng luôn
        // phải được tính từ các biến thể đang hoạt động, không lấy từ form sản phẩm.
        const [[variantSummary]] = await pool.execute(
            "SELECT COUNT(*) AS total FROM product_variants WHERE product_id = ?",
            [id]
        );
        if (Number(variantSummary.total) > 0) {
            await syncProductStock(id);
        }

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
        if (!result.affectedRows) {
            const [existing] = await pool.execute("SELECT id FROM products WHERE id = ? LIMIT 1", [id]);
            if (!existing.length) {
                return res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm." });
            }
        }
        return res.json({ success: true, message: "Đã ngừng kinh doanh sản phẩm." });
    } catch (error) {
        return sendError(res, error, "Không thể ngừng kinh doanh sản phẩm.");
    }
});

// GET /api/admin/products/:id/variants - danh sách biến thể của sản phẩm.
router.get('/products/:id/variants', async (req, res) => {
    const productId = positiveId(req.params.id);
    if (!productId) return res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ.' });
    try {
        const [products] = await pool.execute('SELECT id FROM products WHERE id = ? LIMIT 1', [productId]);
        if (!products.length) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
        const [variants] = await pool.execute('SELECT id, product_id, sku, size, color_name, color_code, price, stock, status, created_at FROM product_variants WHERE product_id = ? ORDER BY id ASC', [productId]);
        return res.json({ success: true, variants });
    } catch (error) { return sendError(res, error, 'Không thể tải biến thể sản phẩm.'); }
});

// POST /api/admin/products/:id/variants - tạo biến thể, không tự sinh size/màu.
router.post('/products/:id/variants', async (req, res) => {
    const productId = positiveId(req.params.id);
    const body = req.body || {};
    const sku = String(body.sku || '').trim();
    const size = String(body.size || '').trim() || null;
    const colorName = String(body.color_name || '').trim() || null;
    const colorCode = String(body.color_code || '').trim() || null;
    const price = body.price === '' || body.price === null || body.price === undefined ? null : Number(body.price);
    const stock = Number(body.stock);
    const status = String(body.status || 'active');
    if (!productId || !sku || !size || !colorName || sku.length > 80 || size.length > 40 || colorName.length > 80 || (colorCode && colorCode.length > 20) || (price !== null && (!Number.isFinite(price) || price < 0)) || !Number.isSafeInteger(stock) || stock < 0 || !['active','inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Thông tin biến thể không hợp lệ.' });
    }
    try {
        const [products] = await pool.execute('SELECT id FROM products WHERE id = ? LIMIT 1', [productId]);
        if (!products.length) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
        const [result] = await pool.execute('INSERT INTO product_variants (product_id, sku, size, color_name, color_code, price, stock, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [productId, sku, size, colorName, colorCode, price, stock, status]);
        await syncProductStock(productId);
        return res.status(201).json({ success: true, variantId: result.insertId, message: 'Đã tạo biến thể.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'SKU đã tồn tại.' });
        return sendError(res, error, 'Không thể tạo biến thể.');
    }
});

// PUT /api/admin/products/:id/variants/:variantId - cập nhật biến thể.
router.put('/products/:id/variants/:variantId', async (req, res) => {
    const productId = positiveId(req.params.id);
    const variantId = positiveId(req.params.variantId);
    const body = req.body || {};
    const sku = String(body.sku || '').trim();
    const size = String(body.size || '').trim() || null;
    const colorName = String(body.color_name || '').trim() || null;
    const colorCode = String(body.color_code || '').trim() || null;
    const price = body.price === '' || body.price === null || body.price === undefined ? null : Number(body.price);
    const stock = Number(body.stock);
    const status = String(body.status || 'active');
    if (!productId || !variantId || !sku || !size || !colorName || sku.length > 80 || size.length > 40 || colorName.length > 80 || (colorCode && colorCode.length > 20) || (price !== null && (!Number.isFinite(price) || price < 0)) || !Number.isSafeInteger(stock) || stock < 0 || !['active','inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Thông tin biến thể không hợp lệ.' });
    }
    try {
        const [result] = await pool.execute('UPDATE product_variants SET sku=?, size=?, color_name=?, color_code=?, price=?, stock=?, status=? WHERE id=? AND product_id=?', [sku, size, colorName, colorCode, price, stock, status, variantId, productId]);
        if (!result.affectedRows) {
            const [existing] = await pool.execute('SELECT id FROM product_variants WHERE id=? AND product_id=? LIMIT 1', [variantId, productId]);
            if (!existing.length) return res.status(404).json({ success: false, message: 'Không tìm thấy biến thể.' });
        }
        await syncProductStock(productId);
        return res.json({ success: true, message: 'Đã cập nhật biến thể.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'SKU đã tồn tại.' });
        return sendError(res, error, 'Không thể cập nhật biến thể.');
    }
});

// PATCH /api/admin/products/:id/variants/:variantId/status - ngừng bán mềm.
router.patch('/products/:id/variants/:variantId/status', async (req, res) => {
    const productId = positiveId(req.params.id);
    const variantId = positiveId(req.params.variantId);
    const status = String(req.body.status || '').trim();
    if (!productId || !variantId || !PRODUCT_STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Biến thể hoặc trạng thái không hợp lệ.' });
    try {
        const [result] = await pool.execute('UPDATE product_variants SET status=? WHERE id=? AND product_id=?', [status, variantId, productId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Không tìm thấy biến thể.' });
        await syncProductStock(productId);
        return res.json({ success: true, message: 'Đã cập nhật trạng thái biến thể.' });
    } catch (error) { return sendError(res, error, 'Không thể cập nhật trạng thái biến thể.'); }
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

// GET /api/admin/orders/:id — chi tiết đơn hàng và các dòng sản phẩm
router.get("/orders/:id", async (req, res) => {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Mã đơn hàng không hợp lệ." });

    try {
        const [[order]] = await pool.execute(`
            SELECT id, order_code, user_id, recipient_name, phone, email,
                shipping_address, subtotal, shipping_fee, discount_amount,
                total_amount, payment_method, payment_status, order_status,
                customer_note, created_at, updated_at
            FROM orders
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (!order) return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });

        const [items] = await pool.execute(`
            SELECT oi.id, oi.product_id, oi.variant_id, oi.product_name,
                oi.size, oi.color_name, oi.unit_price, oi.quantity, oi.line_total,
                pv.sku
            FROM order_items oi
            LEFT JOIN product_variants pv ON pv.id = oi.variant_id
            WHERE oi.order_id = ?
            ORDER BY oi.id ASC
        `, [id]);

        return res.json({ success: true, order, items });
    } catch (error) {
        return sendError(res, error, "Không thể tải chi tiết đơn hàng.");
    }
});

// GET /api/admin/orders/:id/history — lịch sử thay đổi trạng thái.
router.get("/orders/:id/history", async (req, res) => {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Mã đơn hàng không hợp lệ." });
    try {
        const [[order]] = await pool.execute("SELECT id FROM orders WHERE id = ? LIMIT 1", [id]);
        if (!order) return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
        const [history] = await pool.execute(`
            SELECT h.id, h.from_status, h.to_status, h.created_at,
                   u.full_name AS changed_by_name
            FROM order_status_history h
            LEFT JOIN users u ON u.id = h.changed_by
            WHERE h.order_id = ?
            ORDER BY h.created_at DESC, h.id DESC
            LIMIT 100
        `, [id]);
        return res.json({ success: true, history });
    } catch (error) {
        return sendError(res, error, "Không thể tải lịch sử đơn hàng. Hãy kiểm tra migration lịch sử trạng thái đã được áp dụng.");
    }
});

// PATCH /api/admin/orders/:id/status
router.patch("/orders/:id/status", async (req, res) => {
    const id = positiveId(req.params.id);
    const status = String(req.body.status || "").trim();

    if (!id || !ORDER_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            message: "Đơn hàng hoặc trạng thái không hợp lệ."
        });
    }

    let connection = null;
    let beginAttempted = false;
    let transactionStarted = false;
    let commitAttempted = false;

    const destroyConnection = () => {
        if (!connection) return;

        const failedConnection = connection;
        connection = null;

        try {
            failedConnection.destroy();
        } catch (destroyError) {
            console.error(
                "Không thể hủy connection đơn hàng:",
                destroyError
            );
        }
    };

    const rollbackTransaction = async () => {
        if (!connection || !transactionStarted) return;

        try {
            await connection.rollback();
            transactionStarted = false;
        } catch (rollbackError) {
            console.error(
                "Rollback đơn hàng thất bại:",
                rollbackError
            );

            destroyConnection();
            throw rollbackError;
        }
    };

    const commitTransaction = async () => {
        commitAttempted = true;
        await connection.commit();
        transactionStarted = false;
    };

    try {
        connection = await pool.getConnection();

        beginAttempted = true;
        await connection.beginTransaction();
        transactionStarted = true;

        const [orders] = await connection.execute(
            "SELECT id, order_status, payment_status FROM orders WHERE id = ? FOR UPDATE",
            [id]
        );

        if (!orders.length) {
            await rollbackTransaction();

            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng."
            });
        }

        const current = orders[0].order_status;

        if (current === status) {
            await commitTransaction();

            return res.json({
                success: true,
                message: "Đơn hàng đã ở trạng thái này."
            });
        }

        const transitions = {
            pending: ["confirmed", "cancelled"],
            confirmed: ["processing", "cancelled"],
            processing: ["shipping", "cancelled"],
            shipping: ["completed"],
            completed: [],
            cancelled: []
        };

        if (!transitions[current]?.includes(status)) {
            await rollbackTransaction();

            return res.status(409).json({
                success: false,
                message: `Không thể chuyển đơn từ "${current}" sang "${status}".`
            });
        }

        // Không hủy đơn đã thanh toán nếu hệ thống chưa có quy trình hoàn tiền.
        // Việc hoàn kho không đồng nghĩa với việc hoàn tiền cho khách hàng.
        if (status === "cancelled" && orders[0].payment_status !== "unpaid") {
            await rollbackTransaction();

            return res.status(409).json({
                success: false,
                message: "Đơn hàng không còn ở trạng thái chưa thanh toán. Cần đối soát và xử lý hoàn tiền trước khi hủy."
            });
        }

        if (status === "cancelled") {
            const [items] = await connection.execute(
                "SELECT variant_id, product_id, quantity FROM order_items WHERE order_id = ?",
                [id]
            );

            if (!items.length || items.some(item => item.product_id == null)) {
                await rollbackTransaction();
                return res.status(409).json({
                    success: false,
                    message: "Đơn hàng cũ thiếu liên kết sản phẩm để hoàn kho an toàn. Cần đối soát tồn kho thủ công trước khi hủy."
                });
            }

            for (const item of items) {
                // Khóa sản phẩm trước biến thể, cùng thứ tự với luồng tạo đơn để giảm deadlock.
                const [productRows] = await connection.execute(
                    "SELECT id FROM products WHERE id = ? FOR UPDATE",
                    [item.product_id]
                );

                if (!productRows.length) {
                    throw new Error("Không tìm thấy sản phẩm của đơn hàng; đã rollback để tránh hoàn kho sai.");
                }

                if (item.variant_id !== null && item.variant_id !== undefined) {
                    const [variantRows] = await connection.execute(
                        "SELECT id FROM product_variants WHERE id = ? AND product_id = ? FOR UPDATE",
                        [item.variant_id, item.product_id]
                    );

                    if (!variantRows.length) {
                        throw new Error("Không tìm thấy biến thể của đơn hàng; đã rollback để tránh hoàn kho sai.");
                    }

                    const [restockResult] = await connection.execute(
                        "UPDATE product_variants SET stock = stock + ? WHERE id = ? AND product_id = ?",
                        [item.quantity, item.variant_id, item.product_id]
                    );

                    if (restockResult.affectedRows !== 1) {
                        throw new Error("Không thể hoàn kho biến thể. Giao dịch đã bị hủy để bảo toàn dữ liệu.");
                    }

                    await connection.execute(
                        `UPDATE products
                         SET stock = (
                           SELECT COALESCE(SUM(stock), 0)
                           FROM product_variants
                           WHERE product_id = ? AND status = 'active'
                         )
                         WHERE id = ?`,
                        [item.product_id, item.product_id]
                    );
                } else {
                    const [restockResult] = await connection.execute(
                        "UPDATE products SET stock = stock + ? WHERE id = ?",
                        [item.quantity, item.product_id]
                    );

                    if (restockResult.affectedRows !== 1) {
                        throw new Error("Không thể hoàn kho sản phẩm. Giao dịch đã bị hủy để bảo toàn dữ liệu.");
                    }
                }
            }
        }

        const [updateResult] = await connection.execute(
            "UPDATE orders SET order_status = ? WHERE id = ?",
            [status, id]
        );

        if (updateResult.affectedRows !== 1) {
            throw new Error(
                "Không cập nhật được đúng một đơn hàng. Giao dịch đã bị hủy."
            );
        }

        await connection.execute(
            `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
             VALUES (?, ?, ?, ?)`,
            [id, current, status, req.user?.id || null]
        );

        await commitTransaction();

        return res.json({
            success: true,
            message: status === "cancelled"
                ? "Đã hủy đơn và hoàn lại tồn kho."
                : "Đã cập nhật trạng thái đơn hàng."
        });
    } catch (error) {
        if (connection) {
            if (commitAttempted || (beginAttempted && !transactionStarted)) {
                // Kết quả COMMIT hoặc BEGIN không xác định:
                // không đưa connection này trở lại pool.
                destroyConnection();
            } else if (transactionStarted) {
                try {
                    await rollbackTransaction();
                } catch (rollbackError) {
                    // rollbackTransaction đã hủy connection.
                    console.error(
                        "Không thể khôi phục transaction đơn hàng:",
                        rollbackError
                    );
                }
            }
        }

        return sendError(
            res,
            error,
            "Không thể cập nhật trạng thái đơn hàng."
        );
    } finally {
        if (connection) {
            connection.release();
            connection = null;
        }
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
        if (!result.affectedRows) {
            const [existing] = await pool.execute(
                "SELECT id FROM users WHERE id = ? AND role = 'customer' LIMIT 1",
                [id]
            );
            if (!existing.length) {
                return res.status(404).json({ success: false, message: "Không tìm thấy khách hàng." });
            }
        }
        return res.json({ success: true, message: "Đã cập nhật trạng thái khách hàng." });
    } catch (error) {
        return sendError(res, error, "Không thể cập nhật khách hàng.");
    }
});

module.exports = router;

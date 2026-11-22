"use strict";

require("dotenv").config();
const {
    pool,
    verifyDatabaseConnection
} = require("./config/database");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const profileRoutes = require("./routes/profileRoutes");

const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Phục vụ giao diện website.
const frontendPath = path.join(__dirname, "..", "frontend");

app.use(
    "/frontend",
    express.static(frontendPath, {
        extensions: ["html"]
    })
);

// Trang chủ mặc định.
app.get("/", (req, res) => {
    res.redirect("/frontend/pages/index.html");
});

// API kiểm tra trạng thái backend (không phụ thuộc database).
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "CHERI Fashion API is running",
        status: "OK",
        timestamp: new Date().toISOString()
    });
});

// API kiểm tra riêng kết nối database.
app.get("/api/health/db", async (req, res) => {
    const connected = await verifyDatabaseConnection();
    return res.status(connected ? 200 : 503).json({
        success: connected,
        database: connected ? "connected" : "unavailable",
        message: connected ? "Database connection is healthy." : "Không thể kết nối MySQL. Kiểm tra dịch vụ và cấu hình DB.",
        timestamp: new Date().toISOString()
    });
});

/* =========================================
   API SẢN PHẨM - LẤY DỮ LIỆU TỪ MYSQL
   ========================================= */

// Chuẩn hóa biến thể từ DB thành dữ liệu dùng chung cho Shop và trang chi tiết.
async function attachProductVariants(products) {
    if (!products.length) return products;
    const ids = products.map(product => Number(product.id));
    const placeholders = ids.map(() => '?').join(',');
    const [variants] = await pool.execute(
        'SELECT id, product_id, sku, size, color_name, color_code, price, stock, status FROM product_variants WHERE product_id IN (' + placeholders + ') ORDER BY product_id ASC, id ASC',
        ids
    );
    const grouped = new Map(ids.map(id => [id, []]));
    for (const variant of variants) {
        const list = grouped.get(Number(variant.product_id));
        if (list) list.push(variant);
    }
    return products.map(product => ({ ...product, variants: grouped.get(Number(product.id)) || [] }));
}

// Danh sách sản phẩm đang hoạt động kèm biến thể thật.
app.get('/api/products', async (req, res) => {
    try {
        const [products] = await pool.execute("SELECT id, product_code, name, category, category_slug, price, old_price, image, description, is_new, is_sale, stock, status FROM products WHERE status = 'active' ORDER BY id ASC");
        return res.status(200).json({ success: true, products: await attachProductVariants(products) });
    } catch (error) {
        console.error('Lỗi lấy danh sách sản phẩm:', error.message);
        return res.status(500).json({ success: false, message: 'Không thể tải danh sách sản phẩm.' });
    }
});

// Chi tiết sản phẩm kèm biến thể.
app.get('/api/products/:id', async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) return res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ.' });
    try {
        const [products] = await pool.execute("SELECT id, product_code, name, category, category_slug, price, old_price, image, description, is_new, is_sale, stock, status FROM products WHERE id = ? AND status = 'active' LIMIT 1", [productId]);
        if (!products.length) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
        const [product] = await attachProductVariants(products);
        return res.status(200).json({ success: true, product });
    } catch (error) {
        console.error('Lỗi lấy chi tiết sản phẩm:', error.message);
        return res.status(500).json({ success: false, message: 'Không thể tải chi tiết sản phẩm.' });
    }
});
// API đặt hàng mới
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/profile", profileRoutes);

app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);

// Xử lý những API chưa được khai báo.
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint không tồn tại."
    });
});

// Khởi động HTTP server kể cả khi database tạm thời chưa sẵn sàng.
// Các API cần MySQL sẽ trả lỗi phù hợp; /api/health/db cho biết trạng thái database.
async function startServer() {
    const databaseReady = await verifyDatabaseConnection();

    app.listen(PORT, () => {
        console.log("------------------------------------");
        console.log("CHERI Fashion server is running");
        console.log(`Website:   http://localhost:${PORT}`);
        console.log(`Health:    http://localhost:${PORT}/api/health`);
        console.log(`Database:  http://localhost:${PORT}/api/health/db`);
        console.log(`Products:  http://localhost:${PORT}/api/products`);
        if (!databaseReady) {
            console.warn("MySQL is unavailable. Database-backed features are not ready.");
        }
        console.log("------------------------------------");
    });
}

startServer().catch(error => {
    console.error("Không thể khởi động CHERI Fashion server:", error);
    process.exitCode = 1;
});
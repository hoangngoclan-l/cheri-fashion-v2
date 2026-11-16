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

// API kiểm tra riêng kết nối cơ sở dữ liệu, không nhầm backend đang chạy với DB đã sẵn sàng.
app.get("/api/health/db", async (req, res) => {
    try {
        await pool.query("SELECT 1 AS database_ready");
        return res.status(200).json({
            success: true,
            status: "READY",
            database: process.env.DB_NAME || "cheri_fashion",
            message: "Kết nối MariaDB thành công."
        });
    } catch (error) {
        console.error("Database health check failed:", error.code || "UNKNOWN", error.message);
        const hostDenied = error.code === "ER_HOST_NOT_PRIVILEGED";
        return res.status(503).json({
            success: false,
            status: "UNAVAILABLE",
            code: error.code || "DATABASE_ERROR",
            message: hostDenied
                ? "MariaDB từ chối host kết nối. Cần kiểm tra quyền tài khoản User@Host trong MariaDB."
                : "Không thể kết nối MariaDB. Kiểm tra dịch vụ, DB_HOST, DB_USER và DB_PASSWORD."
        });
    }
});

// API kiểm tra trạng thái backend.
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "CHERI Fashion API is running",
        status: "OK",
        timestamp: new Date().toISOString()
    });
});

/* =========================================
   API SẢN PHẨM - LẤY DỮ LIỆU TỪ MYSQL
   ========================================= */

// Lấy danh sách sản phẩm đang hoạt động.
app.get("/api/products", async (req, res) => {
    try {
        const [products] = await pool.execute(`
            SELECT
                id,
                product_code,
                name,
                category,
                category_slug,
                price,
                old_price,
                image,
                description,
                is_new,
                is_sale,
                stock,
                status
            FROM products
            WHERE status = 'active'
            ORDER BY id ASC
        `);

        return res.status(200).json({
            success: true,
            products
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách sản phẩm:", error.code || "UNKNOWN", error.message);

        return res.status(503).json({
            success: false,
            code: error.code || "DATABASE_ERROR",
            message: error.code === "ER_HOST_NOT_PRIVILEGED"
                ? "MariaDB từ chối quyền kết nối từ máy chủ. Kiểm tra quyền User@Host trong MariaDB."
                : "Không thể tải sản phẩm vì cơ sở dữ liệu chưa sẵn sàng."
        });
    }
});

// Lấy chi tiết một sản phẩm theo ID MySQL.
app.get("/api/products/:id", async (req, res) => {
    const productId = Number(req.params.id);

    if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({
            success: false,
            message: "ID sản phẩm không hợp lệ."
        });
    }

    try {
        const [products] = await pool.execute(
            `
                SELECT
                    id,
                    product_code,
                    name,
                    category,
                    category_slug,
                    price,
                    old_price,
                    image,
                    description,
                    is_new,
                    is_sale,
                    stock,
                    status
                FROM products
                WHERE id = ?
                  AND status = 'active'
                LIMIT 1
            `,
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sản phẩm."
            });
        }

        return res.status(200).json({
            success: true,
            product: products[0]
        });
    } catch (error) {
        console.error("Lỗi lấy chi tiết sản phẩm:", error.code || "UNKNOWN", error.message);

        return res.status(503).json({
            success: false,
            code: error.code || "DATABASE_ERROR",
            message: error.code === "ER_HOST_NOT_PRIVILEGED"
                ? "MariaDB từ chối quyền kết nối từ máy chủ. Kiểm tra quyền User@Host trong MariaDB."
                : "Không thể tải chi tiết sản phẩm vì cơ sở dữ liệu chưa sẵn sàng."
        });
    }
});


// API đặt hàng mới
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/profile", profileRoutes);

app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);

// Xử lý những API chưa được khai báo.
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint không tồn tại."
    });
});

// Khởi động máy chủ.
async function startServer() {
    await verifyDatabaseConnection();

    app.listen(PORT, () => {
        console.log("------------------------------------");
        console.log("CHERI Fashion server is running");
        console.log(`Website: http://localhost:${PORT}`);
        console.log(`Health:  http://localhost:${PORT}/api/health`);
        console.log(`Products: http://localhost:${PORT}/api/products`);
        console.log("------------------------------------");
    });
}

startServer();
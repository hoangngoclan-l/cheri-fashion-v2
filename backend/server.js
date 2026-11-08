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
        console.error("Lỗi lấy danh sách sản phẩm:", error.message);

        return res.status(500).json({
            success: false,
            message: "Không thể tải danh sách sản phẩm."
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
        console.error("Lỗi lấy chi tiết sản phẩm:", error.message);

        return res.status(500).json({
            success: false,
            message: "Không thể tải chi tiết sản phẩm."
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
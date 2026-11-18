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

const frontendPath = path.join(__dirname, "..", "frontend");

app.use(
    "/frontend",
    express.static(frontendPath, {
        extensions: ["html"]
    })
);

app.get("/", (req, res) => {
    res.redirect("/frontend/pages/index.html");
});

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "CHERI Fashion API is running",
        status: "OK",
        timestamp: new Date().toISOString()
    });
});

// Health check riêng cho database, không làm lộ thông tin kết nối.
app.get("/api/health/db", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS database_connected");

        return res.status(200).json({
            success: true,
            databaseConnected: rows[0].database_connected === 1,
            database: process.env.DB_NAME || "cheri_fashion"
        });
    } catch (error) {
        console.error("Database health check failed:", error.message);

        return res.status(503).json({
            success: false,
            databaseConnected: false,
            message: "Không thể kết nối cơ sở dữ liệu."
        });
    }
});

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

app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint không tồn tại."
    });
});

async function startServer() {
    // Vẫn khởi động HTTP để health endpoint có thể báo DB đang lỗi.
    await verifyDatabaseConnection();

    const server = app.listen(PORT, () => {
        console.log("------------------------------------");
        console.log("CHERI Fashion server is running");
        console.log(`Website:  http://localhost:${PORT}`);
        console.log(`Health:   http://localhost:${PORT}/api/health`);
        console.log(`Database: http://localhost:${PORT}/api/health/db`);
        console.log(`Products: http://localhost:${PORT}/api/products`);
        console.log("------------------------------------");
    });

    server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            console.error(`Port ${PORT} is already in use. Change PORT in .env or stop the conflicting process.`);
        } else {
            console.error("Server startup error:", error.message);
        }

        process.exitCode = 1;
    });
}

startServer();

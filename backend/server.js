
"use strict";

require("dotenv").config();
const {
    pool,
    testDatabaseConnection
} = require("./config/database");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const authRoutes = require("./routes/authRoutes");

const orderRoutes = require("./routes/orderRoutes");

const profileRoutes = require("./routes/profileRoutes");

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

// DỮ LIỆU SẢN PHẨM MẪU.
const products = [
    {
        id: 1,
        name: "Áo kiểu tối giản",
        category: "Áo nữ",
        price: 320000,
        old_price: 390000,
        image: "../assets/images/products/ao-kieu.webp",
        description:
            "Thiết kế tối giản, dễ phối cùng quần jeans, chân váy hoặc quần âu.",
        sizes: ["S", "M", "L", "XL"],
        colors: [
            { name: "Trắng", code: "#f5f0e8" },
            { name: "Đen", code: "#292629" },
            { name: "Hồng nhạt", code: "#e8c6ce" }
        ],
        stock: 20
    },
    {
        id: 2,
        name: "Váy nữ thanh lịch",
        category: "Váy",
        price: 490000,
        old_price: 0,
        image: "../assets/images/products/vay-thanh-lich.webp",
        description:
            "Thiết kế nữ tính, thanh lịch, phù hợp đi học, đi làm và dạo phố.",
        sizes: ["S", "M", "L"],
        colors: [
            { name: "Kem", code: "#e8ddca" },
            { name: "Đen", code: "#292629" }
        ],
        stock: 15
    },
    {
        id: 3,
        name: "Quần ống rộng hiện đại",
        category: "Quần",
        price: 420000,
        old_price: 0,
        image: "../assets/images/products/quan-ong-rong.webp",
        description:
            "Phom quần ống rộng hiện đại, dễ phối với nhiều kiểu áo.",
        sizes: ["S", "M", "L", "XL"],
        colors: [
            { name: "Đen", code: "#292629" },
            { name: "Be", code: "#c8b69f" }
        ],
        stock: 18
    },
    {
        id: 4,
        name: "Chân váy hiện đại",
        category: "Váy",
        price: 380000,
        old_price: 0,
        image: "../assets/images/products/chan-vay.webp",
        description:
            "Chân váy dễ phối đồ, phù hợp với nhiều phong cách.",
        sizes: ["S", "M", "L"],
        colors: [
            { name: "Đen", code: "#292629" },
            { name: "Kem", code: "#e8ddca" }
        ],
        stock: 12
    },
    {
        id: 5,
        name: "Áo khoác thanh lịch",
        category: "Áo khoác",
        price: 550000,
        old_price: 0,
        image: "../assets/images/products/ao-khoac.webp",
        description:
            "Áo khoác nữ hiện đại, dễ kết hợp cùng trang phục thường ngày.",
        sizes: ["S", "M", "L", "XL"],
        colors: [
            { name: "Be", code: "#c8b69f" },
            { name: "Đen", code: "#292629" }
        ],
        stock: 10
    },
    {
        id: 6,
        name: "Set đồ nữ hiện đại",
        category: "Set đồ nữ",
        price: 620000,
        old_price: 0,
        image: "../assets/images/products/set-do-nu.webp",
        description:
            "Set đồ đồng bộ giúp bạn có vẻ ngoài chỉn chu.",
        sizes: ["S", "M", "L"],
        colors: [
            { name: "Kem", code: "#e8ddca" },
            { name: "Hồng nhạt", code: "#e8c6ce" }
        ],
        stock: 8
    }
];

// API lấy danh sách sản phẩm.
// Đặt route này TRƯỚC phần xử lý API 404.
app.get("/api/products", (req, res) => {
    res.status(200).json({
        success: true,
        products
    });
});

// API lấy chi tiết một sản phẩm theo ID.
app.get("/api/products/:id", (req, res) => {
    const product = products.find(
        item => String(item.id) === String(req.params.id)
    );

    if (!product) {
        return res.status(404).json({
            success: false,
            message: "Không tìm thấy sản phẩm."
        });
    }

    res.status(200).json({
        success: true,
        product
    });
});

// API đặt hàng mới
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/profile", profileRoutes);

// Xử lý những API chưa được khai báo.
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint không tồn tại."
    });
});

// Khởi động máy chủ.
async function startServer() {
    await testDatabaseConnection();

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
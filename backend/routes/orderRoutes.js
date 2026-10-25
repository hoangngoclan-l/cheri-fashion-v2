
"use strict";

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const { optionalAuthMiddleware } = require("../middleware/authMiddleware");

const { pool } = require("../config/database");

// POST /api/orders
// Tạo đơn hàng và lưu chi tiết vào MySQL.
router.post("/", optionalAuthMiddleware, async (req, res) => {
  const {
    recipientName,
    phone,
    email,
    shippingAddress,
    province,
    ward,
    note,
    paymentMethod,
    items,
  } = req.body;

  // 1. Kiểm tra thông tin bắt buộc
  if (
    !recipientName?.trim() ||
    !phone?.trim() ||
    !shippingAddress?.trim() ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập đầy đủ thông tin nhận hàng và sản phẩm.",
    });
  }

  const allowedPaymentMethods = ["cod", "bank_transfer", "online"];
  const payment = paymentMethod || "cod";

  if (!allowedPaymentMethods.includes(payment)) {
    return res.status(400).json({
      success: false,
      message: "Phương thức thanh toán không hợp lệ.",
    });
  }

  // 2. Kiểm tra từng sản phẩm
  const normalizedItems = [];
  const seen = new Set();

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const size = String(item.size || "").trim();
    const colorName = String(item.colorName || item.color || "").trim();

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      !size ||
      !colorName
    ) {
      return res.status(400).json({
        success: false,
        message: "Thông tin sản phẩm, kích thước, màu sắc hoặc số lượng không hợp lệ.",
      });
    }

    // Không cho phép gửi trùng một lựa chọn sản phẩm trong cùng yêu cầu.
    const key = `${productId}|${size}|${colorName}`;

    if (seen.has(key)) {
      return res.status(400).json({
        success: false,
        message: "Có sản phẩm bị lặp trong danh sách đặt hàng.",
      });
    }

    seen.add(key);
    normalizedItems.push({
      productId,
      quantity,
      size,
      colorName,
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let subtotal = 0;
    const orderItems = [];

    // 3. Đọc giá và tồn kho từ database, không tin giá do trình duyệt gửi.
    for (const item of normalizedItems) {
      const [products] = await connection.execute(
        `SELECT id, name, price, image, stock, status
         FROM products
         WHERE id = ?
         FOR UPDATE`,
        [item.productId]
      );

      if (products.length === 0 || products[0].status !== "active") {
        throw new Error(`Sản phẩm ID ${item.productId} không tồn tại hoặc đã ngừng bán.`);
      }

      const product = products[0];
      const unitPrice = Number(product.price);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Giá sản phẩm "${product.name}" không hợp lệ.`);
      }

      if (Number(product.stock) < item.quantity) {
        throw new Error(`Sản phẩm "${product.name}" không đủ số lượng trong kho.`);
      }

      const lineTotal = Math.round(unitPrice * 100 * item.quantity) / 100;
      subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        size: item.size,
        colorName: item.colorName,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      });
    }

    // 4. Tính phí vận chuyển ở phía server.
    // Mức 0 đồng chỉ là giá trị mặc định; có thể đổi theo chính sách shop.
    const shippingFee = normalizedItems.length > 0 ? 30000 : 0;
    const discountAmount = 0;
    const totalAmount = Math.round(
      (subtotal + shippingFee - discountAmount) * 100
    ) / 100;

    const orderCode =
      "CH" +
      Date.now().toString(36).toUpperCase() +
      crypto.randomBytes(3).toString("hex").toUpperCase();

    const fullAddress = [
      shippingAddress.trim(),
      ward?.trim(),
      province?.trim(),
    ]
      .filter(Boolean)
      .join(", ");

    // 5. Lưu đơn hàng
    const [orderResult] = await connection.execute(
      `INSERT INTO orders(
      order_code, 
      user_id, 
      recipient_name, 
      phone, 
      email, 
      shipping_address,
      subtotal, 
      shipping_fee, 
      discount_amount, 
      total_amount,
      payment_method, 
      payment_status, 
      order_status, 
      customer_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'pending', ?)`,
      [
        orderCode,
        req.user ? req.user.id : null,
        recipientName,
        phone,
        email || null,
        fullAddress,
        subtotal,
        shippingFee,
        discountAmount,
        totalAmount,
        payment,
        note || null
    ]
    );

    const orderId = orderResult.insertId;

    // 6. Lưu từng sản phẩm và cập nhật tồn kho
    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items (
          order_id,
          variant_id,
          product_name,
          size,
          color_name,
          unit_price,
          quantity,
          line_total
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productName,
          item.size,
          item.colorName,
          item.unitPrice,
          item.quantity,
          item.lineTotal,
        ]
      );

      const [stockResult] = await connection.execute(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ? AND stock >= ?`,
        [item.quantity, item.productId, item.quantity]
      );

      if (stockResult.affectedRows !== 1) {
        throw new Error(`Không thể cập nhật tồn kho sản phẩm "${item.productName}".`);
      }
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Đặt hàng thành công.",
      order: {
        id: orderId,
        orderCode,
        subtotal,
        shippingFee,
        discountAmount,
        totalAmount,
        paymentMethod: payment,
        paymentStatus: "unpaid",
        orderStatus: "pending",
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Create order error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "Không thể tạo đơn hàng.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});



/**
 * GET /api/orders/my-orders
 * Lấy danh sách đơn hàng của tài khoản đang đăng nhập.
 */
router.get("/my-orders", authMiddleware, async (req, res) => {
    try {
        const [orders] = await pool.execute(
            `SELECT
                o.id,
                o.order_code,
                o.created_at,
                o.subtotal,
                o.shipping_fee,
                o.discount_amount,
                o.total_amount,
                o.payment_method,
                o.payment_status,
                o.order_status,
                (
                    SELECT COALESCE(SUM(oi.quantity), 0)
                    FROM order_items oi
                    WHERE oi.order_id = o.id
                ) AS total_items
             FROM orders o
             WHERE o.user_id = ?
             ORDER BY o.created_at DESC, o.id DESC`,
            [req.user.id]
        );

        return res.json({
            success: true,
            orders
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách đơn hàng:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể tải danh sách đơn hàng."
        });
    }
});

/**
 * GET /api/orders/my-orders/:orderId
 * Chỉ trả về chi tiết nếu đơn thuộc tài khoản đang đăng nhập.
 */
router.get("/my-orders/:orderId", authMiddleware, async (req, res) => {
    try {
        const orderId = String(req.params.orderId);

        if (!/^[1-9]\d*$/.test(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Mã đơn hàng không hợp lệ."
            });
        }

        const [orders] = await pool.execute(
            `SELECT
                id,
                order_code,
                recipient_name,
                phone,
                email,
                shipping_address,
                subtotal,
                shipping_fee,
                discount_amount,
                total_amount,
                payment_method,
                payment_status,
                order_status,
                customer_note,
                created_at
             FROM orders
             WHERE id = ? AND user_id = ?
             LIMIT 1`,
            [orderId, req.user.id]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng."
            });
        }

        const order = orders[0];

        const [items] = await pool.execute(
            `SELECT
                product_name,
                size,
                color_name,
                unit_price,
                quantity,
                line_total
             FROM order_items
             WHERE order_id = ?
             ORDER BY id ASC`,
            [order.id]
        );

        return res.json({
            success: true,
            order: {
                ...order,
                items
            }
        });
    } catch (error) {
        console.error("Lỗi lấy chi tiết đơn hàng:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể tải chi tiết đơn hàng."
        });
    }
});

module.exports = router;

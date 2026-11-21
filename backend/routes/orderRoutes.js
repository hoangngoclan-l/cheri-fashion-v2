
"use strict";

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const { optionalAuthMiddleware } = require("../middleware/authMiddleware");

const { pool } = require("../config/database");
function createRequestHash(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function createGuestOrderToken(idempotencyKey, requestHash) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Máy chủ chưa cấu hình JWT_SECRET.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`cheri-guest-order:${idempotencyKey}:${requestHash}`)
    .digest("hex");
}

function hashGuestOrderToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function setGuestOrderCookie(res, orderId, token) {
  res.cookie(`cheri_order_access_${orderId}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/orders",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function getRequestCookie(req, cookieName) {
  const cookieHeader = req.headers.cookie || "";

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();

    if (name !== cookieName) continue;

    return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return null;
}


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
    checkoutSource,
    cartItems,
  } = req.body;

  if (!["cart", "buy-now"].includes(checkoutSource)) {
    return res.status(400).json({
      success: false,
      message: "Nguồn thanh toán không hợp lệ."
    });
  }
  const idempotencyKey = String(
    req.get("Idempotency-Key") || ""
  ).trim();

  if (!/^[A-Za-z0-9_-]{32,100}$/.test(idempotencyKey)) {
    return res.status(400).json({
      success: false,
      safeToRetry: true,
      message: "Thiếu hoặc sai khóa xác nhận yêu cầu đặt hàng. Vui lòng tải lại trang thanh toán."
    });
  }

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
      safeToRetry: true,
      message: "Vui lòng nhập đầy đủ thông tin nhận hàng và sản phẩm.",
    });
  }

  const allowedPaymentMethods = ["cod", "bank_transfer", "online"];
  const payment = paymentMethod || "cod";

  if (!allowedPaymentMethods.includes(payment)) {
    return res.status(400).json({
      success: false,
      safeToRetry: true,
      message: "Phương thức thanh toán không hợp lệ.",
    });
  }

  // 2. Kiểm tra từng sản phẩm
  const normalizedItems = [];
  const seen = new Set();

  for (const item of items) {
    const productId = Number(item.productId);
    const variantId = item.variantId === null || item.variantId === undefined || item.variantId === "" ? null : Number(item.variantId);
    const quantity = Number(item.quantity);
    const size = String(item.size || "").trim();
    const colorName = String(item.colorName || item.color || "").trim();

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0)) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      !size ||
      !colorName
    ) {
      return res.status(400).json({
        success: false,
        safeToRetry: true,
        message: "Thông tin sản phẩm, kích thước, màu sắc hoặc số lượng không hợp lệ.",
      });
    }

    // Không cho phép gửi trùng một lựa chọn sản phẩm trong cùng yêu cầu.
    const key = String(productId) + "|" + String(variantId || "legacy") + "|" + size + "|" + colorName;

    if (seen.has(key)) {
      return res.status(400).json({
        success: false,
        safeToRetry: true,
        message: "Có sản phẩm bị lặp trong danh sách đặt hàng.",
      });
    }

    seen.add(key);
    normalizedItems.push({
      productId,
      variantId,
      quantity,
      size,
      colorName,
    });
  }

  // Chỉ đồng bộ giỏ MySQL khi khách đã đăng nhập và checkout từ giỏ hàng.
  const isAuthenticatedCartCheckout =
    Boolean(req.user) && checkoutSource === "cart";

  const normalizedCartItems = [];

  if (isAuthenticatedCartCheckout) {
    if (
      !Array.isArray(cartItems) ||
      cartItems.length !== normalizedItems.length
    ) {
      return res.status(400).json({
        success: false,
        safeToRetry: true,
        message: "Thông tin giỏ hàng không hợp lệ. Vui lòng tải lại giỏ hàng.",
      });
    }

    const seenCartIds = new Set();
    const matchedOrderItemIndexes = new Set();

    for (const cartItem of cartItems) {
      const cartItemId = Number(cartItem.cartItemId);
      const productId = Number(cartItem.productId);
      const quantity = Number(cartItem.quantity);
      const variantId = cartItem.variantId === null || cartItem.variantId === undefined || cartItem.variantId === "" ? null : Number(cartItem.variantId);
      const size = String(cartItem.size || "").trim();
      const colorName = String(cartItem.colorName || "").trim();

      if (
        !Number.isSafeInteger(cartItemId) ||
        cartItemId <= 0 ||
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0)) ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        !size ||
        !colorName ||
        seenCartIds.has(cartItemId)
      ) {
        return res.status(400).json({
          success: false,
          safeToRetry: true,
          message: "Thông tin sản phẩm trong giỏ hàng không hợp lệ.",
        });
      }

      const matchingOrderItemIndex = normalizedItems.findIndex(
        item =>
          item.productId === productId &&
          item.variantId === variantId &&
          item.size === size &&
          item.colorName === colorName &&
          item.quantity === quantity
      );

      if (
        matchingOrderItemIndex < 0 ||
        matchedOrderItemIndexes.has(matchingOrderItemIndex)
      ) {
        return res.status(400).json({
          success: false,
          safeToRetry: true,
          message: "Sản phẩm trong giỏ hàng không khớp với đơn đặt hàng.",
        });
      }

      matchedOrderItemIndexes.add(matchingOrderItemIndex);
      seenCartIds.add(cartItemId);
      normalizedCartItems.push({
        cartItemId,
        productId,
        variantId,
        quantity,
        size,
        colorName,
      });
    }
  }

  // Dấu vân tay của yêu cầu đã chuẩn hóa; giá được lấy từ database.
  const idempotencyPayload = {
    userId: req.user ? String(req.user.id) : null,
    recipientName: recipientName.trim(),
    phone: phone.trim(),
    email: email?.trim() || null,
    shippingAddress: shippingAddress.trim(),
    province: province?.trim() || "",
    ward: ward?.trim() || "",
    note: note?.trim() || "",
    paymentMethod: payment,
    checkoutSource: checkoutSource || "cart",
    items: normalizedItems,
    cartItems: normalizedCartItems
  };

  const requestHash = createRequestHash(idempotencyPayload);

  const guestOrderToken = req.user
    ? null
    : createGuestOrderToken(idempotencyKey, requestHash);

  const guestTokenHash = guestOrderToken
    ? hashGuestOrderToken(guestOrderToken)
    : null;

  let connection;
  let idempotencyInsertInProgress = false;
  let idempotencyInsertAttempted = false;
  let transactionCommitted = false;
  let commitAttempted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Chỉ đánh dấu trong lúc thực thi INSERT khóa idempotency.
    idempotencyInsertAttempted = true;
    idempotencyInsertInProgress = true;
    await connection.execute(
      `INSERT INTO order_idempotency (
        idempotency_key, user_id, request_hash, guest_token_hash
      ) VALUES (?, ?, ?, ?)`,
      [idempotencyKey, req.user ? req.user.id : null, requestHash, guestTokenHash]
    );
    idempotencyInsertInProgress = false;


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

    const [idempotencyUpdate] = await connection.execute(
      `UPDATE order_idempotency
       SET order_id = ?
       WHERE idempotency_key = ? AND request_hash = ?`,
      [orderId, idempotencyKey, requestHash]
    );

    if (idempotencyUpdate.affectedRows !== 1) {
      throw new Error("Không thể xác nhận khóa đặt hàng.");
    }


    // 6. Lưu từng sản phẩm và cập nhật tồn kho
    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items (
          order_id,
          variant_id,
          product_id,
          product_name,
          size,
          color_name,
          unit_price,
          quantity,
          line_total
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productId,
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

    // 7. Đồng bộ giỏ MySQL trong cùng transaction với đơn hàng.
    // Mỗi dòng phải thuộc đúng tài khoản và khớp đúng biến thể sản phẩm.
    if (isAuthenticatedCartCheckout) {
      for (const item of normalizedCartItems) {
        const [cartRows] = await connection.execute(
          `SELECT id, product_id, variant_id, size, color, quantity
           FROM cart_items
           WHERE id = ? AND user_id = ?
           FOR UPDATE`,
          [item.cartItemId, req.user.id]
        );

        if (cartRows.length !== 1) {
          throw new Error(
            "Một sản phẩm trong giỏ hàng không còn tồn tại. Vui lòng tải lại giỏ hàng."
          );
        }

        const cartRow = cartRows[0];

        if (
          Number(cartRow.product_id) !== item.productId ||
          (cartRow.variant_id == null ? null : Number(cartRow.variant_id)) !== item.variantId ||
          String(cartRow.size) !== item.size ||
          String(cartRow.color) !== item.colorName ||
          Number(cartRow.quantity) < item.quantity
        ) {
          throw new Error(
            "Giỏ hàng đã thay đổi hoặc số lượng không còn khớp. Vui lòng tải lại giỏ hàng."
          );
        }

        const remainingQuantity =
          Number(cartRow.quantity) - item.quantity;

        if (remainingQuantity === 0) {
          const [deleteResult] = await connection.execute(
            `DELETE FROM cart_items
             WHERE id = ? AND user_id = ?`,
            [item.cartItemId, req.user.id]
          );

          if (deleteResult.affectedRows !== 1) {
            throw new Error("Không thể cập nhật giỏ hàng sau khi đặt hàng.");
          }
        } else {
          const [updateResult] = await connection.execute(
            `UPDATE cart_items
             SET quantity = ?
             WHERE id = ? AND user_id = ?`,
            [remainingQuantity, item.cartItemId, req.user.id]
          );

          if (updateResult.affectedRows !== 1) {
            throw new Error("Không thể cập nhật số lượng giỏ hàng.");
          }
        }
      }
    }

    commitAttempted = true;
    await connection.commit();
    transactionCommitted = true;

    if (!req.user) {
      setGuestOrderCookie(res, orderId, guestOrderToken);
    }
    return res.status(201).json({
      success: true,
      message: "Đặt hàng thành công.",
      order: {
        id: orderId,
        orderCode,
        idempotencyKey,
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
    let rollbackSucceeded = true;

    if (connection) {
      const failedConnection = connection;
      connection = null;

      if (commitAttempted && !transactionCommitted) {
        try {
          failedConnection.destroy();
        } catch (destroyError) {
          console.error("Order connection destroy error:", destroyError.message);
        }
      } else if (transactionCommitted) {
        failedConnection.release();
      } else {

        try {
          await failedConnection.rollback();
        } catch (rollbackError) {
          rollbackSucceeded = false;
          console.error("Order rollback error:", rollbackError.message);
        }

        if (rollbackSucceeded) {
          failedConnection.release();
        } else {
          try {
            failedConnection.destroy();
          } catch (destroyError) {
            console.error("Order connection destroy error:", destroyError.message);
          }
        }
      }
    }

    // Chỉ replay nếu chính INSERT idempotency thất bại do khóa trùng.
    if (commitAttempted || transactionCommitted || (idempotencyInsertInProgress && error.code === "ER_DUP_ENTRY")) {
      try {
        const [existingRows] = await pool.execute(
          `SELECT idempotency_key, user_id, request_hash, order_id, guest_token_hash
           FROM order_idempotency
           WHERE idempotency_key = ?
           LIMIT 1`,
          [idempotencyKey]
        );

        if (existingRows.length === 1) {
          const existing = existingRows[0];
          const currentUserId = req.user ? String(req.user.id) : null;
          const existingUserId = existing.user_id === null
            ? null
            : String(existing.user_id);

          if (
            existingUserId !== currentUserId ||
            existing.request_hash !== requestHash
          ) {
            return res.status(409).json({
              success: false,
              message: "Khóa đặt hàng đã được sử dụng cho yêu cầu khác."
            });
          }

          if (!existing.order_id) {
            return res.status(409).json({
              success: false,
              message: "Yêu cầu đặt hàng đang được xử lý. Vui lòng thử lại."
            });
          }

          if (!req.user && existing.guest_token_hash !== guestTokenHash) {
            return res.status(409).json({
              success: false,
              message: "Không thể xác thực quyền truy cập đơn hàng khách."
            });
          }

          const [existingOrders] = await pool.execute(
            `SELECT id, order_code, subtotal, shipping_fee,
                    discount_amount, total_amount, payment_method,
                    payment_status, order_status
             FROM orders
             WHERE id = ? AND user_id <=> ?
             LIMIT 1`,
            [existing.order_id, currentUserId]
          );

          if (existingOrders.length !== 1) {
            return res.status(404).json({
              success: false,
              message: "Không tìm thấy đơn hàng đã xác nhận."
            });
          }

          if (!req.user) {
            setGuestOrderCookie(res, existing.order_id, guestOrderToken);
          }

          const oldOrder = existingOrders[0];

          return res.status(200).json({
            success: true,
            message: "Đơn hàng đã được ghi nhận trước đó.",
            idempotentReplay: true,
            order: {
              id: oldOrder.id,
              orderCode: oldOrder.order_code,
              idempotencyKey: existing.idempotency_key,
              subtotal: Number(oldOrder.subtotal),
              shippingFee: Number(oldOrder.shipping_fee),
              discountAmount: Number(oldOrder.discount_amount),
              totalAmount: Number(oldOrder.total_amount),
              paymentMethod: oldOrder.payment_method,
              paymentStatus: oldOrder.payment_status,
              orderStatus: oldOrder.order_status
            }
          });
        }
      } catch (replayError) {
        console.error("Idempotency replay error:", replayError.message);

        return res.status(500).json({
          success: false,
          message: "Chưa thể xác nhận kết quả đơn hàng. Vui lòng thử lại cùng yêu cầu trước đó."
        });
      }
    }

    console.error("Create order error:", error.message);

    return res.status((transactionCommitted || commitAttempted || !rollbackSucceeded) ? 500 : 400).json({
      success: false,
      safeToRetry:
        !idempotencyInsertInProgress &&
        !commitAttempted &&
        !transactionCommitted &&
        rollbackSucceeded,
      message: error.message || "Không thể tạo đơn hàng."
    });
  } finally {
    if (connection) {
      if (commitAttempted && !transactionCommitted) {
        try {
          connection.destroy();
        } catch (destroyError) {
          console.error("Order connection destroy error:", destroyError.message);
        }
      } else {
        connection.release();
      }
    }
  }
});



/**
 * GET /api/orders/guest/:orderId
 * Tra cứu đơn khách bằng cookie HttpOnly riêng của đơn hàng.
 */
router.get("/guest/:orderId", async (req, res) => {
    try {
        const orderId = String(req.params.orderId);

        if (!/^[1-9]\d*$/.test(orderId)) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng."
            });
        }

        const cookieName = `cheri_order_access_${orderId}`;
        let guestToken = null;

        try {
            guestToken = getRequestCookie(req, cookieName);
        } catch (cookieError) {
            guestToken = null;
        }

        if (
            typeof guestToken !== "string" ||
            !/^[a-f0-9]{64}$/i.test(guestToken)
        ) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng hoặc thông tin xác thực không hợp lệ."
            });
        }

        const suppliedHash = hashGuestOrderToken(guestToken);

        const [accessRows] = await pool.execute(
            `SELECT guest_token_hash
             FROM order_idempotency
             WHERE order_id = ?
               AND user_id IS NULL
             LIMIT 1`,
            [orderId]
        );

        if (accessRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng."
            });
        }

        const storedHash = String(accessRows[0].guest_token_hash || "");

        if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng."
            });
        }

        const suppliedBuffer = Buffer.from(suppliedHash, "hex");
        const storedBuffer = Buffer.from(storedHash, "hex");

        if (
            suppliedBuffer.length !== storedBuffer.length ||
            !crypto.timingSafeEqual(suppliedBuffer, storedBuffer)
        ) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng hoặc thông tin xác thực không hợp lệ."
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
                (SELECT oi.idempotency_key
                 FROM order_idempotency oi
                 WHERE oi.order_id = orders.id
                 LIMIT 1) AS idempotency_key,
                created_at
             FROM orders
             WHERE id = ?
               AND user_id IS NULL
             LIMIT 1`,
            [orderId]
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
        console.error("Lỗi tra cứu đơn khách:", error);

        return res.status(500).json({
            success: false,
            message: "Không thể tải thông tin đơn hàng."
        });
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
                (SELECT oi.idempotency_key
                 FROM order_idempotency oi
                 WHERE oi.order_id = orders.id
                 LIMIT 1) AS idempotency_key,
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

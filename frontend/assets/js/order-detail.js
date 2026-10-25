
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const token = localStorage.getItem("cheri_auth_token");
    const message = document.getElementById("detail-message");
    const content = document.getElementById("detail-content");

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("id");

    const money = value =>
        new Intl.NumberFormat("vi-VN").format(Number(value) || 0) + "đ";

    const statusLabels = {
        pending: "Chờ xác nhận",
        confirmed: "Đã xác nhận",
        processing: "Đang xử lý",
        shipping: "Đang giao hàng",
        completed: "Hoàn thành",
        cancelled: "Đã hủy"
    };

    const paymentLabels = {
        cod: "Thanh toán khi nhận hàng",
        bank_transfer: "Chuyển khoản ngân hàng",
        online: "Thanh toán trực tuyến"
    };

    const paymentStatusLabels = {
        unpaid: "Chưa thanh toán",
        paid: "Đã thanh toán",
        refunded: "Đã hoàn tiền"
    };

    function showError(text) {
        message.textContent = text;
        message.dataset.type = "error";
        message.hidden = false;
        content.hidden = true;
    }

    function setText(id, value) {
        document.getElementById(id).textContent =
            value === null || value === undefined || value === ""
                ? "—"
                : String(value);
    }

    function renderItems(items) {
        const container = document.getElementById("detail-items");

        if (!Array.isArray(items) || items.length === 0) {
            container.textContent = "Không có thông tin sản phẩm.";
            return;
        }

        container.replaceChildren();

        for (const item of items) {
            const row = document.createElement("article");
            row.className = "detail-item";

            const info = document.createElement("div");
            const name = document.createElement("div");
            name.className = "detail-item-name";
            name.textContent = item.product_name || "Sản phẩm";

            const meta = document.createElement("div");
            meta.className = "detail-item-meta";
            meta.textContent =
                `Kích thước: ${item.size || "—"} · ` +
                `Màu sắc: ${item.color_name || "—"} · ` +
                `Số lượng: ${Number(item.quantity) || 0}`;

            info.append(name, meta);

            const price = document.createElement("div");
            price.className = "detail-item-price";
            price.textContent = money(item.line_total);

            row.append(info, price);
            container.append(row);
        }
    }

    if (!token) {
        window.location.href =
            "account.html?next=" +
            encodeURIComponent("order-detail.html?id=" + (orderId || ""));
        return;
    }

    if (!orderId || !/^[1-9]\d*$/.test(orderId)) {
        showError("Đường dẫn đơn hàng không hợp lệ.");
        return;
    }

    try {
        const response = await fetch(
            `/api/orders/my-orders/${encodeURIComponent(orderId)}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const result = await response.json().catch(() => ({}));

        if (response.status === 401) {
            localStorage.removeItem("cheri_auth_token");
            localStorage.removeItem("cheri_auth_user");

            window.location.href =
                "account.html?next=" +
                encodeURIComponent("order-detail.html?id=" + orderId);
            return;
        }

        if (response.status === 404) {
            showError("Không tìm thấy đơn hàng hoặc đơn hàng không thuộc tài khoản của bạn.");
            return;
        }

        if (!response.ok || !result.success || !result.order) {
            throw new Error(result.message || "Không thể tải chi tiết đơn hàng.");
        }

        const order = result.order;

        setText("detail-code", order.order_code);
        setText(
            "detail-date",
            order.created_at
                ? new Date(order.created_at).toLocaleString("vi-VN")
                : "—"
        );
        setText(
            "detail-status",
            statusLabels[order.order_status] || order.order_status
        );

        setText("detail-recipient", order.recipient_name);
        setText("detail-phone", order.phone);
        setText("detail-email", order.email);
        setText("detail-address", order.shipping_address);
        setText("detail-note", order.customer_note);

        setText("detail-subtotal", money(order.subtotal));
        setText("detail-shipping", money(order.shipping_fee));
        setText("detail-discount", money(order.discount_amount));
        setText("detail-total", money(order.total_amount));

        setText(
            "detail-payment-method",
            paymentLabels[order.payment_method] || order.payment_method
        );
        setText(
            "detail-payment-status",
            paymentStatusLabels[order.payment_status] || order.payment_status
        );

        renderItems(order.items);

        message.hidden = true;
        content.hidden = false;
    } catch (error) {
        console.error("Lỗi tải chi tiết đơn hàng:", error);
        showError(error.message || "Không thể tải chi tiết đơn hàng.");
    }
});

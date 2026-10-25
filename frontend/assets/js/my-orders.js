
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("cheri_auth_token");
    const user = JSON.parse(
        localStorage.getItem("cheri_auth_user") || "null"
    );

    const list = document.getElementById("orders-list");
    const message = document.getElementById("orders-message");
    const filter = document.getElementById("orders-filter");
    const userName = document.getElementById("orders-user-name");
    const logoutButton = document.getElementById("orders-logout");

    let allOrders = [];

    const money = value =>
        new Intl.NumberFormat("vi-VN").format(Number(value) || 0) + "đ";

    const date = value => {
        if (!value) return "—";
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime())
            ? String(value)
            : parsed.toLocaleDateString("vi-VN");
    };

    const statusInfo = {
        pending: { label: "Chờ xác nhận", className: "pending" },
        confirmed: { label: "Đã xác nhận", className: "confirmed" },
        processing: { label: "Đang xử lý", className: "processing" },
        shipping: { label: "Đang giao hàng", className: "shipping" },
        completed: { label: "Hoàn thành", className: "completed" },
        cancelled: { label: "Đã hủy", className: "cancelled" }
    };

    function showMessage(text, type = "info") {
        message.textContent = text;
        message.dataset.type = type;
        message.hidden = !text;
    }

    function renderOrders() {
        const selectedStatus = filter.value;

        const orders = allOrders.filter(order =>
            selectedStatus === "all" ||
            order.order_status === selectedStatus
        );

        if (orders.length === 0) {
            list.innerHTML = `
                <div class="orders-empty">
                    <div class="orders-empty-icon">♡</div>
                    <h2>Chưa có đơn hàng</h2>
                    <p>Đơn hàng phù hợp sẽ xuất hiện tại đây.</p>
                    <a class="orders-button" href="shop.html">
                        Khám phá sản phẩm
                    </a>
                </div>
            `;
            return;
        }

        list.innerHTML = orders.map(order => {
            const status = statusInfo[order.order_status] ||
                { label: order.order_status || "Không xác định",
                  className: "unknown" };

            return `
                <article class="order-card">
                    <div class="order-card-top">
                        <div>
                            <span class="order-muted">Mã đơn hàng</span>
                            <strong class="order-code">${escapeHTML(order.order_code)}</strong>
                        </div>
                        <span class="order-status ${status.className}">
                            ${escapeHTML(status.label)}
                        </span>
                    </div>

                    <div class="order-card-info">
                        <span>Ngày đặt: ${escapeHTML(date(order.created_at))}</span>
                        <span>${Number(order.total_items) || 0} sản phẩm</span>
                    </div>

                    <div class="order-card-bottom">
                        <div>
                            <span class="order-muted">Tổng thanh toán</span>
                            <strong class="order-price">${money(order.total_amount)}</strong>
                        </div>
                        <a class="order-detail-button"
                           href="order-detail.html?id=${encodeURIComponent(order.id)}">
                            Xem chi tiết
                        </a>
                    </div>
                </article>
            `;
        }).join("");
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    async function loadOrders() {
        if (!token || !user) {
            window.location.href = "account.html?next=my-orders.html";
            return;
        }

        userName.textContent = user.fullName || user.email || "Khách hàng";
        showMessage("Đang tải đơn hàng...");

        try {
            const response = await fetch("/api/orders/my-orders", {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const result = await response.json().catch(() => ({}));

            if (response.status === 401) {
                localStorage.removeItem("cheri_auth_token");
                localStorage.removeItem("cheri_auth_user");
               window.location.href = "account.html?next=my-orders.html";
                return;
            }

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Không thể tải đơn hàng.");
            }

            allOrders = Array.isArray(result.orders) ? result.orders : [];
            showMessage("");
            renderOrders();
        } catch (error) {
            showMessage(
                error.message || "Không thể kết nối máy chủ.",
                "error"
            );
            list.innerHTML = "";
        }
    }

    filter.addEventListener("change", renderOrders);

    logoutButton.addEventListener("click", () => {
        localStorage.removeItem("cheri_auth_token");
        localStorage.removeItem("cheri_auth_user");
        window.location.href = "account.html";
    });

    loadOrders();
});

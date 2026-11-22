"use strict";

(() => {
    const token = () => window.CHERI_AUTH?.getToken();
    const user = () => window.CHERI_AUTH?.getUser();
    const $ = (id) => document.getElementById(id);
    const money = value => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
    const date = value => value ? new Date(value).toLocaleDateString("vi-VN") : "—";
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
    const statusText = value => ({created:"Tạo đơn hàng",pending:"Chờ xác nhận",confirmed:"Đã xác nhận",processing:"Đang xử lý",shipping:"Đang giao",completed:"Đã hoàn thành",cancelled:"Đã hủy",active:"Đang hoạt động",inactive:"Ngừng hoạt động",blocked:"Đã khóa",out_of_stock:"Hết hàng"})[value] || value || "—";
    const statusClass = value => ["completed","active"].includes(value) ? "success" : ["pending","confirmed","processing","shipping"].includes(value) ? "warn" : ["cancelled","blocked","inactive","out_of_stock"].includes(value) ? "danger" : "";
    const paymentStatusText = value => ({unpaid:"Chưa thanh toán",paid:"Đã thanh toán",pending:"Đang xử lý",failed:"Thanh toán thất bại",refunded:"Đã hoàn tiền",partially_refunded:"Hoàn tiền một phần"})[value] || value || "Chưa rõ";
    const paymentStatusClass = value => value === "paid" ? "success" : value === "unpaid" ? "warn" : ["failed","refunded"].includes(value) ? "danger" : "";
    const paymentMethodText = value => ({cod:"COD · Khi nhận hàng",bank_transfer:"Chuyển khoản",online:"Thanh toán trực tuyến"})[value] || value || "Chưa xác định";
    const ORDER_TRANSITIONS = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["processing", "cancelled"],
        processing: ["shipping", "cancelled"],
        shipping: ["completed"],
        completed: [],
        cancelled: []
    };
    let products = [];
    let categories = [];
    let activeVariantProduct = null;
    let activeVariants = [];

    function alertMessage(message, error = false) {
        const box = $("admin-alert");
        box.textContent = message;
        box.classList.toggle("error", error);
        box.hidden = false;
        window.clearTimeout(alertMessage.timer);
        alertMessage.timer = window.setTimeout(() => { box.hidden = true; }, 4500);
    }

    async function api(path, options = {}) {
        const response = await fetch("/api/admin" + path, {
            ...options,
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token(), ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "Không thể thực hiện yêu cầu.");
        return data;
    }

    function requireAdmin() {
        const account = user();
        if (!token() || !account) {
            location.replace("../account.html?next=admin%2Findex.html");
            return false;
        }
        if (account.role !== "admin") {
            document.body.innerHTML = '<main style="max-width:560px;margin:12vh auto;padding:28px;text-align:center;font-family:Arial"><h1>Không có quyền truy cập</h1><p>Tài khoản hiện tại không có quyền quản trị CHERI.</p><a href="../index.html">Quay lại cửa hàng</a></main>';
            return false;
        }
        $("admin-name").textContent = account.fullName || account.email || "Quản trị viên";
        return true;
    }

    function setView(view) {
        document.querySelectorAll(".admin-view").forEach(el => el.classList.toggle("active", el.id === "view-" + view));
        document.querySelectorAll(".admin-nav a").forEach(el => el.classList.toggle("active", el.dataset.view === view));
        $("page-title").textContent = ({dashboard:"Tổng quan",products:"Quản lý sản phẩm",orders:"Quản lý đơn hàng",customers:"Quản lý khách hàng",inventory:"Quản lý kho hàng"})[view] || "Quản trị";
        if (view === "dashboard") loadDashboard();
        if (view === "products") { loadProducts(); loadCategoryManagement(); }
        if (view === "orders") { loadPaymentSummary(); loadOrders(); }
        if (view === "customers") loadCustomers();
        if (view === "inventory") { loadInventoryProducts(); loadInventory(); }
    }

    async function loadDashboard() {
        try {
            const data = await api("/dashboard");
            const m = data.metrics || {};
            $("metric-revenue").textContent = money(m.collected_revenue);
            $("metric-unpaid").textContent = "Chưa thu: " + money(m.unpaid_amount) + " (" + Number(m.unpaid_orders || 0).toLocaleString("vi-VN") + " đơn)";
            $("metric-orders").textContent = Number(m.total_orders || 0).toLocaleString("vi-VN");
            $("metric-pending").textContent = (m.pending_orders || 0) + " đơn chờ xử lý";
            $("metric-customers").textContent = Number(m.total_customers || 0).toLocaleString("vi-VN");
            $("metric-products").textContent = Number(m.total_products || 0).toLocaleString("vi-VN");
            $("metric-low-stock").textContent = (m.low_stock || 0) + " sản phẩm sắp hết";
            $("recent-orders").innerHTML = data.recentOrders.length ? data.recentOrders.map(o => `<tr><td><strong>${escapeHtml(o.order_code)}</strong></td><td>${escapeHtml(o.recipient_name)}</td><td>${date(o.created_at)}</td><td>${money(o.total_amount)}</td><td><span class="pill ${statusClass(o.order_status)}">${statusText(o.order_status)}</span></td></tr>`).join("") : '<tr><td colspan="5" class="empty-row">Chưa có đơn hàng.</td></tr>';
            $("top-products").innerHTML = data.topProducts.length ? data.topProducts.map(p => `<div class="top-product"><span>${escapeHtml(p.product_name)}</span><strong>${Number(p.units_sold || 0)} sản phẩm · ${money(p.revenue)}</strong></div>`).join("") : '<p class="empty-row">Chưa có dữ liệu bán hàng.</p>';
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadCategories() {
        const data = await api("/categories");
        categories = data.categories || [];

        const select = $("product-category");
        select.innerHTML =
            '<option value="">Chọn danh mục</option>' +
            categories.map(category =>
                `<option value="${category.id}">${escapeHtml(category.name)}</option>`
            ).join("");

        if (!categories.length) {
            throw new Error("Chưa có danh mục đang hoạt động.");
        }
    }

    async function loadCategoryManagement() {
        try {
            const data = await api("/categories/manage");
            const rows = data.categories || [];
            $("categories-table").innerHTML = rows.length ? rows.map(c => `
                <tr>
                    <td><strong>${escapeHtml(c.name)}</strong></td>
                    <td><code>${escapeHtml(c.slug)}</code></td>
                    <td>${Number(c.product_count || 0)}</td>
                    <td><span class="pill ${Number(c.is_active) === 1 ? "success" : "muted"}">${Number(c.is_active) === 1 ? "Đang hoạt động" : "Ngừng hoạt động"}</span></td>
                    <td><button type="button" class="table-action" data-edit-category="${c.id}">Sửa</button> <button type="button" class="table-action" data-toggle-category="${c.id}" data-next-status="${Number(c.is_active) === 1 ? "inactive" : "active"}">${Number(c.is_active) === 1 ? "Ngừng hoạt động" : "Kích hoạt"}</button></td>
                </tr>`).join("") : '<tr><td colspan="5" class="empty-row">Chưa có danh mục.</td></tr>';
        } catch (error) { alertMessage(error.message, true); }
    }

    function resetCategoryForm() {
        const form = $("category-form");
        form.reset();
        form.elements.id.value = "";
        $("category-save").textContent = "Thêm danh mục";
        $("category-cancel").hidden = true;
    }

    async function saveCategory(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const id = form.elements.id.value;
        const payload = { name: form.elements.name.value.trim(), slug: form.elements.slug.value.trim().toLowerCase() };
        try {
            await api(id ? "/categories/" + id : "/categories", {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });
            alertMessage(id ? "Đã cập nhật danh mục và các sản phẩm liên quan." : "Đã thêm danh mục.");
            resetCategoryForm();
            await Promise.all([loadCategoryManagement(), loadCategories(), loadProducts()]);
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadProducts() {
        try {
            const q = encodeURIComponent($("product-search").value.trim());
            const data = await api("/products?q=" + q);
            products = data.products || [];
            $("products-table").innerHTML = products.length ? products.map(p => `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.product_code)}</td><td>${escapeHtml(p.category)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><span class="pill ${statusClass(p.status === "active" && Number(p.stock) <= 0 ? "out_of_stock" : p.status)}">${statusText(p.status === "active" && Number(p.stock) <= 0 ? "out_of_stock" : p.status)}</span></td><td><button class="table-action" data-edit-product="${p.id}">Sửa</button><button class="table-action" data-variant-product="${p.id}">Biến thể</button><button class="table-action" data-delete-product="${p.id}">Ngừng bán</button></td></tr>`).join("") : '<tr><td colspan="7" class="empty-row">Không tìm thấy sản phẩm.</td></tr>';
        } catch (error) { alertMessage(error.message, true); }
    }

    async function openProduct(product = null) {
        const form = $("product-form");

        try {
            await loadCategories();
        } catch (error) {
            alertMessage(error.message, true);
            return;
        }

        form.reset();
        form.elements.id.value = product?.id || "";
        $("product-dialog-title").textContent = product ? "Cập nhật sản phẩm" : "Thêm sản phẩm";

        ["product_code","name","price","old_price","stock","status","image","description"].forEach(key => {
            form.elements[key].value =
                product?.[key] ??
                (key === "status" ? "active" :
                key === "old_price" || key === "stock" ? 0 : "");
        });

        let selectedCategory = categories.find(
            category => category.slug === product?.category_slug
        );
        if (product?.category_slug && !selectedCategory) {
            try {
                const data = await api("/categories/manage");
                selectedCategory = (data.categories || []).find(category => category.slug === product.category_slug);
                if (selectedCategory) {
                    categories.push(selectedCategory);
                    $("product-category").insertAdjacentHTML(
                        "beforeend",
                        `<option value="${selectedCategory.id}">${escapeHtml(selectedCategory.name)} · Ngừng hoạt động</option>`
                    );
                }
            } catch (error) {
                alertMessage(error.message, true);
            }
        }

        form.elements.category_id.value = selectedCategory ? String(selectedCategory.id) : "";
        form.elements.is_new.checked = Boolean(product?.is_new);
        form.elements.is_sale.checked = Boolean(product?.is_sale);

        $("product-dialog").showModal();
    }

    async function saveProduct(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        const body = Object.fromEntries(fd.entries());
        body.price = Number(body.price); body.old_price = Number(body.old_price || 0); body.stock = Number(body.stock);
        body.is_new = form.elements.is_new.checked; body.is_sale = form.elements.is_sale.checked;
        const id = body.id; delete body.id;
        try {
            await api(id ? "/products/" + id : "/products", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
            $("product-dialog").close(); alertMessage(id ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm."); loadProducts();
        } catch (error) { alertMessage(error.message, true); }
    }


    async function loadVariants(productId) {
        const product = products.find(item => String(item.id) === String(productId));
        if (!product) throw new Error("Không tìm thấy sản phẩm trong danh sách hiện tại.");
        activeVariantProduct = product;
        $("variant-dialog-title").textContent = "Biến thể · " + product.name;
        $("variant-product-summary").textContent = product.product_code + " · Giá gốc " + money(product.price);
        $("variant-form").reset();
        $("variant-form").elements.product_id.value = product.id;
        $("variant-form").elements.variant_id.value = "";
        $("variant-form").elements.status.value = "active";
        $("variant-form").elements.stock.value = "0";
        $("variant-form").elements.price.value = "";
        $("variant-form").elements.sku.value = "";
        $("variant-form").elements.size.value = "";
        $("variant-form").elements.color_name.value = "";
        $("variant-form").elements.color_code.value = "";
        $("variant-save-label").textContent = "Thêm biến thể";
        await renderVariants();
        $("variant-dialog").showModal();
    }

    async function renderVariants() {
        if (!activeVariantProduct) return;
        const data = await api("/products/" + activeVariantProduct.id + "/variants");
        activeVariants = data.variants || [];
        const variants = activeVariants;
        $("variants-table").innerHTML = variants.length ? variants.map(v => `
            <tr>
                <td><strong>${escapeHtml(v.sku)}</strong></td>
                <td>${escapeHtml(v.size || "—")}</td>
                <td>${escapeHtml(v.color_name || "—")}${v.color_code ? '<br><small>' + escapeHtml(v.color_code) + '</small>' : ''}</td>
                <td>${v.price === null ? "Theo giá sản phẩm" : money(v.price)}</td>
                <td>${Number(v.stock || 0)}</td>
                <td><span class="pill ${statusClass(v.status)}">${statusText(v.status)}</span></td>
                <td><button type="button" class="table-action" data-edit-variant="${v.id}">Sửa</button><button type="button" class="table-action" data-toggle-variant="${v.id}" data-next-status="${v.status === "active" ? "inactive" : "active"}">${v.status === "active" ? "Ngừng bán" : "Kích hoạt"}</button></td>
            </tr>`).join("") : '<tr><td colspan="7" class="empty-row">Sản phẩm chưa có biến thể. Chỉ thêm size, màu và SKU đã được xác định thực tế.</td></tr>';
        $("variant-count").textContent = variants.length + " biến thể";
    }

    function editVariant(variantId) {
        const variant = activeVariants.find(item => String(item.id) === String(variantId));
        if (!variant) return;

        const form = $("variant-form");
        form.elements.variant_id.value = variant.id;
        form.elements.sku.value = variant.sku || "";
        form.elements.size.value = variant.size || "";
        form.elements.color_name.value = variant.color_name || "";
        form.elements.color_code.value = variant.color_code || "";
        form.elements.price.value = variant.price === null ? "" : String(variant.price);
        form.elements.stock.value = String(Number(variant.stock || 0));
        form.elements.status.value = variant.status === "active" ? "active" : "inactive";
        $("variant-save-label").textContent = "Lưu thay đổi";
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function saveVariant(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const body = {
            sku: form.elements.sku.value.trim(),
            size: form.elements.size.value.trim() || null,
            color_name: form.elements.color_name.value.trim() || null,
            color_code: form.elements.color_code.value.trim() || null,
            price: form.elements.price.value === "" ? null : Number(form.elements.price.value),
            stock: Number(form.elements.stock.value),
            status: form.elements.status.value
        };
        const variantId = form.elements.variant_id.value;
        try {
            await api("/products/" + activeVariantProduct.id + "/variants" + (variantId ? "/" + variantId : ""), {
                method: variantId ? "PUT" : "POST",
                body: JSON.stringify(body)
            });
            alertMessage(variantId ? "Đã cập nhật biến thể." : "Đã thêm biến thể.");
            form.reset();
            form.elements.product_id.value = activeVariantProduct.id;
            form.elements.variant_id.value = "";
            form.elements.status.value = "active";
            form.elements.stock.value = "0";
            $("variant-save-label").textContent = "Thêm biến thể";
            await renderVariants();
            await loadProducts();
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadPaymentSummary() {
        try {
            const data = await api("/payments/summary");
            const totals = data.totals || {};
            $("payment-summary").innerHTML = `
                <article class="payment-summary-card"><span>Đã thu</span><strong>${money(totals.collected_amount)}</strong><small>${Number(totals.paid_orders || 0).toLocaleString("vi-VN")} đơn</small></article>
                <article class="payment-summary-card"><span>Chưa thu</span><strong>${money(totals.outstanding_amount)}</strong><small>${Number(totals.unpaid_orders || 0).toLocaleString("vi-VN")} đơn · không tính đơn đã hủy</small></article>
                <article class="payment-summary-card"><span>Đơn đã hủy</span><strong>${Number(totals.cancelled_orders || 0).toLocaleString("vi-VN")}</strong><small>Hiển thị riêng, không cộng vào đối soát</small></article>
            `;
            $("payment-breakdown").innerHTML = (data.breakdown || []).length ? data.breakdown.map(row =>
                `<span class="payment-breakdown-item">${escapeHtml(paymentMethodText(row.payment_method))} · ${escapeHtml(paymentStatusText(row.payment_status))}: <strong>${Number(row.order_count || 0)} đơn</strong> · ${money(row.active_amount)}${Number(row.cancelled_count || 0) ? ` · ${Number(row.cancelled_count)} đã hủy` : ""}</span>`
            ).join("") : '<span class="empty-row">Chưa có dữ liệu thanh toán.</span>';
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadOrders() {
        try {
            const q = encodeURIComponent($("order-search").value.trim());
            const status = encodeURIComponent($("order-status").value);
            const method = encodeURIComponent($("order-payment-method").value);
            const payment = encodeURIComponent($("order-payment-status").value);
            const data = await api("/orders?q=" + q + "&status=" + status + "&payment_method=" + method + "&payment_status=" + payment);
            $("orders-table").innerHTML = data.orders.length ? data.orders.map(o => `<tr><td><strong>${escapeHtml(o.order_code)}</strong></td><td>${escapeHtml(o.recipient_name)}</td><td>${escapeHtml(o.phone)}</td><td>${date(o.created_at)}</td><td>${money(o.total_amount)}</td><td><span class="pill ${paymentStatusClass(o.payment_status)}">${escapeHtml(paymentStatusText(o.payment_status))}</span></td><td><span class="pill ${statusClass(o.order_status)}">${statusText(o.order_status)}</span></td><td><button type="button" class="table-action" data-order-detail="${o.id}">Chi tiết</button></td><td><select aria-label="Trạng thái đơn ${escapeHtml(o.order_code)}" data-order-status="${o.id}">${[o.order_status, ...(ORDER_TRANSITIONS[o.order_status] || [])].map(s => `<option value="${s}" ${s === o.order_status ? "selected" : ""}>${statusText(s)}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="9" class="empty-row">Không có đơn hàng phù hợp.</td></tr>';
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadOrderDetail(orderId) {
        try {
            const data = await api("/orders/" + encodeURIComponent(orderId));
            const order = data.order;
            $("order-detail-title").textContent = "Đơn hàng " + (order.order_code || "");
            $("order-detail-meta").innerHTML = `
                <div><span>Người nhận</span><strong>${escapeHtml(order.recipient_name)}</strong></div>
                <div><span>Số điện thoại</span><strong>${escapeHtml(order.phone)}</strong></div>
                <div><span>Email</span><strong>${escapeHtml(order.email || "—")}</strong></div>
                <div><span>Địa chỉ giao hàng</span><strong>${escapeHtml(order.shipping_address || "—")}</strong></div>
                <div><span>Phương thức thanh toán</span><strong>${escapeHtml(order.payment_method || "—")}</strong></div>
                <div><span>Trạng thái thanh toán</span><strong>${escapeHtml(paymentStatusText(order.payment_status))}</strong></div>
                <div><span>Phương thức</span><strong>${escapeHtml(order.payment_method === "cod" ? "Thanh toán khi nhận hàng" : order.payment_method === "bank_transfer" ? "Chuyển khoản" : order.payment_method === "online" ? "Trực tuyến" : order.payment_method || "—")}</strong></div>
                <div><span>Trạng thái đơn</span><strong>${escapeHtml(statusText(order.order_status))}</strong></div>
                <div><span>Ngày đặt</span><strong>${escapeHtml(date(order.created_at))}</strong></div>
            `;
            $("order-detail-items").innerHTML = (data.items || []).length ? data.items.map(item => `
                <tr>
                    <td><strong>${escapeHtml(item.product_name)}</strong><small class="detail-subline">SKU: ${escapeHtml(item.sku || "—")} · SP #${escapeHtml(item.product_id)}</small></td>
                    <td>${escapeHtml(item.size || "—")}</td>
                    <td>${escapeHtml(item.color_name || "—")}</td>
                    <td>${money(item.unit_price)}</td>
                    <td>${Number(item.quantity || 0)}</td>
                    <td>${money(item.line_total)}</td>
                </tr>`).join("") : '<tr><td colspan="6" class="empty-row">Đơn hàng không có dòng sản phẩm.</td></tr>';
            $("order-detail-totals").innerHTML = `
                <div><span>Tạm tính</span><strong>${money(order.subtotal)}</strong></div>
                <div><span>Phí vận chuyển</span><strong>${money(order.shipping_fee)}</strong></div>
                <div><span>Giảm giá</span><strong>${money(order.discount_amount)}</strong></div>
                <div class="detail-grand-total"><span>Tổng thanh toán</span><strong>${money(order.total_amount)}</strong></div>
            `;
            $("order-detail-note").textContent = order.customer_note || "Không có ghi chú.";
            const canConfirmCod = order.payment_method === "cod" && order.payment_status === "unpaid" && order.order_status === "completed";
            $("confirm-cod-payment").hidden = !canConfirmCod;
            $("confirm-cod-payment").dataset.orderPaymentConfirm = order.id;
            $("order-payment-history").innerHTML = '<tr><td colspan="4" class="empty-row">Đang tải lịch sử...</td></tr>';
            try {
                const paymentHistoryData = await api("/orders/" + encodeURIComponent(orderId) + "/payment-history");
                const paymentHistory = paymentHistoryData.history || [];
                $("order-payment-history").innerHTML = paymentHistory.length ? paymentHistory.map(entry => `
                    <tr>
                        <td>${escapeHtml(entry.created_at ? new Date(entry.created_at).toLocaleString("vi-VN") : "—")}</td>
                        <td>${escapeHtml(paymentStatusText(entry.from_status))}</td>
                        <td><span class="pill ${paymentStatusClass(entry.to_status)}">${escapeHtml(paymentStatusText(entry.to_status))}</span></td>
                        <td>${escapeHtml(entry.changed_by_name || "Quản trị viên")}</td>
                    </tr>`).join("") : '<tr><td colspan="4" class="empty-row">Chưa có xác nhận thanh toán được ghi nhận.</td></tr>';
            } catch (paymentHistoryError) {
                $("order-payment-history").innerHTML = '<tr><td colspan="4" class="empty-row">Không tải được lịch sử thanh toán. Kiểm tra migration.</td></tr>';
            }
            $("order-detail-history").innerHTML = '<tr><td colspan="4" class="empty-row">Đang tải lịch sử...</td></tr>';
            $("order-detail-dialog").showModal();
            try {
                const historyData = await api("/orders/" + encodeURIComponent(orderId) + "/history");
                const history = historyData.history || [];
                $("order-detail-history").innerHTML = history.length ? history.map(entry => `
                    <tr>
                        <td>${escapeHtml(entry.created_at ? new Date(entry.created_at).toLocaleString("vi-VN") : "—")}</td>
                        <td>${escapeHtml(statusText(entry.from_status))}</td>
                        <td><span class="pill ${statusClass(entry.to_status)}">${escapeHtml(statusText(entry.to_status))}</span></td>
                        <td>${escapeHtml(entry.changed_by_name || (entry.from_status === "created" ? "Khách hàng / hệ thống" : "Quản trị viên"))}</td>
                    </tr>`).join("") : '<tr><td colspan="4" class="empty-row">Chưa có thay đổi trạng thái được ghi nhận.</td></tr>';
            } catch (historyError) {
                $("order-detail-history").innerHTML = '<tr><td colspan="4" class="empty-row">Không tải được lịch sử. Kiểm tra migration cơ sở dữ liệu.</td></tr>';
            }
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadCustomerDetail(customerId) {
        try {
            const data = await api("/customers/" + customerId);
            const c = data.customer, summary = data.summary || {};
            $("customer-detail-title").textContent = c.full_name || "Hồ sơ khách hàng";
            $("customer-detail-summary").innerHTML = `
                <div><span>Email</span><strong>${escapeHtml(c.email)}</strong></div>
                <div><span>Số điện thoại</span><strong>${escapeHtml(c.phone || "Chưa cập nhật")}</strong></div>
                <div><span>Ngày tham gia</span><strong>${date(c.created_at)}</strong></div>
                <div><span>Trạng thái</span><strong>${escapeHtml(statusText(c.status))}</strong></div>
                <div><span>Tổng đơn</span><strong>${Number(summary.total_orders || 0)}</strong></div>
                <div><span>Đã thu</span><strong>${money(summary.collected_amount)}</strong></div>
                <div><span>Chưa thu</span><strong>${money(summary.outstanding_amount)}</strong></div>
            `;
            $("customer-orders-table").innerHTML = (data.orders || []).length ? data.orders.map(o => `
                <tr><td><strong>${escapeHtml(o.order_code)}</strong></td><td>${date(o.created_at)}</td><td>${money(o.total_amount)}</td>
                <td><span class="pill ${paymentStatusClass(o.payment_status)}">${escapeHtml(paymentStatusText(o.payment_status))}</span></td>
                <td><span class="pill ${statusClass(o.order_status)}">${statusText(o.order_status)}</span></td>
                <td><button type="button" class="table-action" data-order-detail="${o.id}" data-close-customer-detail="true">Chi tiết</button></td></tr>`
            ).join("") : '<tr><td colspan="6" class="empty-row">Khách hàng chưa có đơn hàng.</td></tr>';
            $("customer-detail-dialog").showModal();
        } catch (error) { alertMessage(error.message, true); }
    }

    let inventoryPage = 1;
    let inventoryProductOptionsLoaded = false;

    async function loadInventoryProducts() {
        try {
            const data = await api("/products");
            const select = $("inventory-product");
            const selected = select.value;
            select.innerHTML = '<option value="">Chọn sản phẩm</option>' +
                (data.products || []).map(p => `<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.product_code)}</option>`).join("");
            if (selected) select.value = selected;
            inventoryProductOptionsLoaded = true;
            await loadInventoryVariants(select.value);
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadInventoryVariants(productId) {
        const select = $("inventory-variant");
        select.innerHTML = '<option value="">Tồn kho sản phẩm (không có biến thể)</option>';
        if (!productId) return;
        try {
            const data = await api("/products/" + productId + "/variants");
            const variants = data.variants || [];
            if (variants.length) {
                select.innerHTML = '<option value="">— Chọn biến thể —</option>' +
                    variants.map(v => `<option value="${v.id}">${escapeHtml(v.sku)} · ${escapeHtml(v.size)} · ${escapeHtml(v.color_name)} · tồn ${Number(v.stock)}</option>`).join("");
            }
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadInventory() {
        try {
            const params = new URLSearchParams({
                page: String(inventoryPage), limit: "30",
                q: $("inventory-search").value.trim(),
                type: $("inventory-type").value
            });
            const data = await api("/inventory/movements?" + params.toString());
            $("inventory-movements-table").innerHTML = data.movements.length ? data.movements.map(m => {
                const typeLabels = {adjustment_in:"Nhập kho",adjustment_out:"Xuất kho",order_out:"Xuất theo đơn",order_return:"Hoàn kho"};
                const ref = m.reference_type === "order" ? "Đơn #" + m.reference_id : m.reference_type === "admin_adjustment" ? "Điều chỉnh Admin" : "—";
                return `<tr><td>${new Date(m.created_at).toLocaleString("vi-VN")}</td><td><strong>${escapeHtml(m.product_name || ("Sản phẩm #" + m.product_id))}</strong><br><small>${escapeHtml([m.sku,m.size,m.color_name].filter(Boolean).join(" · ") || m.product_code || "")}</small></td><td>${escapeHtml(typeLabels[m.movement_type] || m.movement_type)}</td><td>${Number(m.quantity)}</td><td>${Number(m.stock_before)}</td><td>${Number(m.stock_after)}</td><td>${escapeHtml(ref)}</td><td>${escapeHtml(m.actor_name || (m.actor_user_id ? "Tài khoản #" + m.actor_user_id : "Hệ thống"))}</td><td>${escapeHtml(m.note || "—")}</td></tr>`;
            }).join("") : '<tr><td colspan="9" class="empty-row">Chưa có lịch sử biến động kho.</td></tr>';
            $("inventory-page-label").textContent = `Trang ${data.pagination.page} / ${Math.max(1,data.pagination.totalPages)} · ${data.pagination.total} bản ghi`;
            $("inventory-prev").disabled = inventoryPage <= 1;
            $("inventory-next").disabled = inventoryPage >= data.pagination.totalPages;
        } catch (error) { alertMessage(error.message, true); }
    }

    async function saveInventoryAdjustment(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const productId = $("inventory-product").value;
        const variantId = $("inventory-variant").value;
        if (!productId) { alertMessage("Hãy chọn sản phẩm.", true); return; }
        if ($("inventory-variant").options.length > 1 && !variantId) {
            alertMessage("Sản phẩm có biến thể. Hãy chọn đúng biến thể cần điều chỉnh.", true); return;
        }
        const payload = {
            product_id: Number(productId), variant_id: variantId ? Number(variantId) : null,
            direction: form.elements.direction.value,
            quantity: Number(form.elements.quantity.value),
            note: form.elements.note.value.trim()
        };
        if (!confirm(`Xác nhận ${payload.direction === "in" ? "nhập" : "xuất"} ${payload.quantity} sản phẩm vào/ra kho?`)) return;
        try {
            const result = await api("/inventory/adjust", {method:"POST",body:JSON.stringify(payload)});
            alertMessage(result.message + ` Tồn: ${result.stock_before} → ${result.stock_after}.`);
            form.reset();
            await Promise.all([loadInventory(),loadProducts(),loadInventoryVariants(productId)]);
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadCustomers() {
        try {
            const q = encodeURIComponent($("customer-search").value.trim());
            const data = await api("/customers?q=" + q);
            $("customers-table").innerHTML = data.customers.length ? data.customers.map(c => `<tr><td><button type="button" class="table-action customer-name-action" data-customer-detail="${c.id}">${escapeHtml(c.full_name)}</button><br><small>#${c.id}</small></td><td>${escapeHtml(c.email)}</td><td>${escapeHtml(c.phone || "—")}</td><td>${date(c.created_at)}</td><td><span class="pill ${statusClass(c.status)}">${statusText(c.status)}</span></td><td><button class="table-action" data-customer-id="${c.id}" data-customer-status="${c.status}">${c.status === "active" ? "Khóa tài khoản" : "Mở khóa"}</button></td></tr>`).join("") : '<tr><td colspan="6" class="empty-row">Chưa có khách hàng.</td></tr>';
        } catch (error) { alertMessage(error.message, true); }
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!requireAdmin()) return;
        document.querySelectorAll("[data-view]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); setView(link.dataset.view); }));
        document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));
        $("admin-logout").addEventListener("click", () => CHERI_AUTH.logout());
        $("close-order-detail").addEventListener("click", () => $("order-detail-dialog").close());
        $("close-order-detail-footer").addEventListener("click", () => $("order-detail-dialog").close());
        $("close-customer-detail").addEventListener("click", () => $("customer-detail-dialog").close());
        $("product-search").addEventListener("input", debounce(loadProducts, 300));
        $("order-search").addEventListener("input", debounce(loadOrders, 300));
        $("order-status").addEventListener("change", loadOrders);
        $("order-payment-method").addEventListener("change", loadOrders);
        $("order-payment-status").addEventListener("change", loadOrders);
        $("customer-search").addEventListener("input", debounce(loadCustomers, 300));
        $("inventory-adjust-form").addEventListener("submit", saveInventoryAdjustment);
        $("inventory-product").addEventListener("change", event => loadInventoryVariants(event.target.value));
        $("inventory-search").addEventListener("input", debounce(() => { inventoryPage = 1; loadInventory(); }, 300));
        $("inventory-type").addEventListener("change", () => { inventoryPage = 1; loadInventory(); });
        $("inventory-prev").addEventListener("click", () => { inventoryPage = Math.max(1, inventoryPage - 1); loadInventory(); });
        $("inventory-next").addEventListener("click", () => { inventoryPage += 1; loadInventory(); });
        $("add-product").addEventListener("click", () => openProduct());
        $("close-product-dialog").addEventListener("click", () => $("product-dialog").close());
        $("cancel-product").addEventListener("click", () => $("product-dialog").close());
        $("product-form").addEventListener("submit", saveProduct);
        $("category-form").addEventListener("submit", saveCategory);
        $("category-cancel").addEventListener("click", resetCategoryForm);
        $("variant-form").addEventListener("submit", saveVariant);
        $("close-variant-dialog").addEventListener("click", () => $("variant-dialog").close());
        $("cancel-variant-dialog").addEventListener("click", () => $("variant-dialog").close());
        $("add-variant").addEventListener("click", () => {
            const form = $("variant-form");
            form.reset();
            form.elements.product_id.value = activeVariantProduct?.id || "";
            form.elements.variant_id.value = "";
            form.elements.status.value = "active";
            form.elements.stock.value = "0";
            $("variant-save-label").textContent = "Thêm biến thể";
        });
        document.addEventListener("click", async event => {
            const edit = event.target.closest("[data-edit-product]");
            const editCategory = event.target.closest("[data-edit-category]");
            const toggleCategory = event.target.closest("[data-toggle-category]");
            if (editCategory) {
                try {
                    const data = await api("/categories/manage");
                    const category = (data.categories || []).find(item => String(item.id) === editCategory.dataset.editCategory);
                    if (category) {
                        const form = $("category-form");
                        form.elements.id.value = category.id;
                        form.elements.name.value = category.name;
                        form.elements.slug.value = category.slug;
                        $("category-save").textContent = "Lưu thay đổi";
                        $("category-cancel").hidden = false;
                        form.scrollIntoView({ behavior: "smooth", block: "center" });
                        form.elements.name.focus();
                    }
                } catch (error) { alertMessage(error.message, true); }
                return;
            }
            if (toggleCategory) {
                const next = toggleCategory.dataset.nextStatus;
                const row = toggleCategory.closest("tr");
                const count = Number(row?.children[2]?.textContent || 0);
                const message = next === "inactive"
                    ? (count > 0 ? "Danh mục đang có sản phẩm. Ngừng hoạt động sẽ giữ nguyên sản phẩm cũ nhưng không cho chọn cho sản phẩm mới. Tiếp tục?" : "Ngừng hoạt động danh mục này?")
                    : "Kích hoạt lại danh mục này?";
                if (confirm(message)) {
                    try {
                        await api("/categories/" + toggleCategory.dataset.toggleCategory + "/status", { method: "PATCH", body: JSON.stringify({ status: next }) });
                        alertMessage("Đã cập nhật trạng thái danh mục.");
                        await Promise.all([loadCategoryManagement(), loadCategories()]);
                    } catch (error) { alertMessage(error.message, true); }
                }
                return;
            }
            const variants = event.target.closest("[data-variant-product]");
            const editVariantButton = event.target.closest("[data-edit-variant]");
            const toggleVariantButton = event.target.closest("[data-toggle-variant]");
            const remove = event.target.closest("[data-delete-product]");
            const customer = event.target.closest("[data-customer-id]");
            const customerDetail = event.target.closest("[data-customer-detail]");
            if (customerDetail) { await loadCustomerDetail(customerDetail.dataset.customerDetail); return; }
            if (event.target.closest("[data-close-customer-detail]")) $("customer-detail-dialog").close();
            const orderDetail = event.target.closest("[data-order-detail]");
            const confirmCod = event.target.closest("[data-order-payment-confirm]");
            if (confirmCod) {
                if (!confirm("Chỉ xác nhận nếu bạn đã nhận đủ tiền COD từ đơn vị giao hàng. Xác nhận đã thu tiền?")) return;
                try {
                    await api("/orders/" + confirmCod.dataset.orderPaymentConfirm + "/payment/confirm-cod", { method: "POST", body: JSON.stringify({}) });
                    alertMessage("Đã xác nhận thu tiền COD.");
                    await loadOrders();
                    await loadOrderDetail(confirmCod.dataset.orderPaymentConfirm);
                } catch (error) { alertMessage(error.message, true); }
                return;
            }
            if (orderDetail) { await loadOrderDetail(orderDetail.dataset.orderDetail); return; }
            if (edit) openProduct(products.find(p => String(p.id) === edit.dataset.editProduct));
            if (variants) {
                try { await loadVariants(variants.dataset.variantProduct); }
                catch (error) { alertMessage(error.message, true); }
            }
            if (editVariantButton) editVariant(editVariantButton.dataset.editVariant);
            if (toggleVariantButton && activeVariantProduct) {
                const nextStatus = toggleVariantButton.dataset.nextStatus;
                if (confirm(nextStatus === "inactive" ? "Ngừng bán biến thể này? Biến thể sẽ không còn được chọn mua." : "Kích hoạt lại biến thể này?")) {
                    try {
                        await api("/products/" + activeVariantProduct.id + "/variants/" + toggleVariantButton.dataset.toggleVariant + "/status", { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
                        alertMessage("Đã cập nhật trạng thái biến thể.");
                        await renderVariants();
                        await loadProducts();
                    } catch (error) { alertMessage(error.message, true); }
                }
            }
            if (remove && confirm("Ngừng kinh doanh sản phẩm này?")) {
                try { await api("/products/" + remove.dataset.deleteProduct, { method: "DELETE" }); alertMessage("Đã ngừng kinh doanh sản phẩm."); loadProducts(); }
                catch (error) { alertMessage(error.message, true); }
            }
            if (customer) {
                const next = customer.dataset.customerStatus === "active" ? "blocked" : "active";
                if (confirm(next === "blocked" ? "Khóa tài khoản khách hàng này?" : "Mở khóa tài khoản khách hàng này?")) {
                    try { await api("/customers/" + customer.dataset.customerId + "/status", { method: "PATCH", body: JSON.stringify({ status: next }) }); alertMessage("Đã cập nhật tài khoản."); loadCustomers(); }
                    catch (error) { alertMessage(error.message, true); }
                }
            }
        });
        document.addEventListener("change", async event => {
            const select = event.target.closest("[data-order-status]");
            if (!select) return;
            if (select.value === "cancelled" && !confirm("Bạn chắc chắn muốn hủy đơn hàng này? Tồn kho sản phẩm sẽ được hoàn lại.")) {
                loadOrders();
                return;
            }
            try { await api("/orders/" + select.dataset.orderStatus + "/status", { method: "PATCH", body: JSON.stringify({ status: select.value }) }); alertMessage("Đã cập nhật trạng thái đơn hàng."); loadOrders(); }
            catch (error) { alertMessage(error.message, true); loadOrders(); }
        });
        setView(location.hash.slice(1) || "dashboard");
    });

    function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
})();

"use strict";

(() => {
    const token = () => window.CHERI_AUTH?.getToken();
    const user = () => window.CHERI_AUTH?.getUser();
    const $ = (id) => document.getElementById(id);
    const money = value => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
    const date = value => value ? new Date(value).toLocaleDateString("vi-VN") : "—";
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
    const statusText = value => ({pending:"Chờ xác nhận",confirmed:"Đã xác nhận",processing:"Đang xử lý",shipping:"Đang giao",completed:"Đã hoàn thành",cancelled:"Đã hủy",active:"Đang hoạt động",inactive:"Ngừng hoạt động",blocked:"Đã khóa",out_of_stock:"Hết hàng"})[value] || value || "—";
    const statusClass = value => ["completed","active"].includes(value) ? "success" : ["pending","confirmed","processing","shipping"].includes(value) ? "warn" : ["cancelled","blocked","inactive","out_of_stock"].includes(value) ? "danger" : "";
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
        $("page-title").textContent = ({dashboard:"Tổng quan",products:"Quản lý sản phẩm",orders:"Quản lý đơn hàng",customers:"Quản lý khách hàng"})[view] || "Quản trị";
        if (view === "dashboard") loadDashboard();
        if (view === "products") loadProducts();
        if (view === "orders") loadOrders();
        if (view === "customers") loadCustomers();
    }

    async function loadDashboard() {
        try {
            const data = await api("/dashboard");
            const m = data.metrics || {};
            $("metric-revenue").textContent = money(m.gross_revenue);
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

        const selectedCategory = categories.find(
            category => category.slug === product?.category_slug
        );

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
        const variants = data.variants || [];
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
        const row = document.querySelector('[data-edit-variant="' + CSS.escape(String(variantId)) + '"]')?.closest("tr");
        if (!row) return;
        const cells = row.querySelectorAll("td");
        const form = $("variant-form");
        form.elements.variant_id.value = variantId;
        form.elements.sku.value = cells[0].querySelector("strong")?.textContent || "";
        form.elements.size.value = cells[1].textContent.trim() === "—" ? "" : cells[1].textContent.trim();
        form.elements.color_name.value = cells[2].childNodes[0]?.textContent?.trim() || "";
        const colorCode = cells[2].querySelector("small")?.textContent || "";
        form.elements.color_code.value = colorCode;
        const priceText = cells[3].textContent.trim();
        form.elements.price.value = priceText === "Theo giá sản phẩm" ? "" : String(priceText.replace(/[^0-9]/g, ""));
        form.elements.stock.value = cells[4].textContent.trim();
        form.elements.status.value = cells[5].textContent.trim() === "Đang hoạt động" ? "active" : "inactive";
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

    async function loadOrders() {
        try {
            const q = encodeURIComponent($("order-search").value.trim());
            const status = encodeURIComponent($("order-status").value);
            const data = await api("/orders?q=" + q + "&status=" + status);
            $("orders-table").innerHTML = data.orders.length ? data.orders.map(o => `<tr><td><strong>${escapeHtml(o.order_code)}</strong></td><td>${escapeHtml(o.recipient_name)}</td><td>${escapeHtml(o.phone)}</td><td>${date(o.created_at)}</td><td>${money(o.total_amount)}</td><td><span class="pill ${statusClass(o.order_status)}">${statusText(o.order_status)}</span></td><td><select aria-label="Trạng thái đơn ${escapeHtml(o.order_code)}" data-order-status="${o.id}">${[o.order_status, ...(ORDER_TRANSITIONS[o.order_status] || [])].map(s => `<option value="${s}" ${s === o.order_status ? "selected" : ""}>${statusText(s)}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="7" class="empty-row">Không có đơn hàng phù hợp.</td></tr>';
        } catch (error) { alertMessage(error.message, true); }
    }

    async function loadCustomers() {
        try {
            const q = encodeURIComponent($("customer-search").value.trim());
            const data = await api("/customers?q=" + q);
            $("customers-table").innerHTML = data.customers.length ? data.customers.map(c => `<tr><td><strong>${escapeHtml(c.full_name)}</strong><br><small>#${c.id}</small></td><td>${escapeHtml(c.email)}</td><td>${escapeHtml(c.phone || "—")}</td><td>${date(c.created_at)}</td><td><span class="pill ${statusClass(c.status)}">${statusText(c.status)}</span></td><td><button class="table-action" data-customer-id="${c.id}" data-customer-status="${c.status}">${c.status === "active" ? "Khóa tài khoản" : "Mở khóa"}</button></td></tr>`).join("") : '<tr><td colspan="6" class="empty-row">Chưa có khách hàng.</td></tr>';
        } catch (error) { alertMessage(error.message, true); }
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!requireAdmin()) return;
        document.querySelectorAll("[data-view]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); setView(link.dataset.view); }));
        document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));
        $("admin-logout").addEventListener("click", () => CHERI_AUTH.logout());
        $("product-search").addEventListener("input", debounce(loadProducts, 300));
        $("order-search").addEventListener("input", debounce(loadOrders, 300));
        $("order-status").addEventListener("change", loadOrders);
        $("customer-search").addEventListener("input", debounce(loadCustomers, 300));
        $("add-product").addEventListener("click", () => openProduct());
        $("close-product-dialog").addEventListener("click", () => $("product-dialog").close());
        $("cancel-product").addEventListener("click", () => $("product-dialog").close());
        $("product-form").addEventListener("submit", saveProduct);
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
            const variants = event.target.closest("[data-variant-product]");
            const editVariantButton = event.target.closest("[data-edit-variant]");
            const toggleVariantButton = event.target.closest("[data-toggle-variant]");
            const remove = event.target.closest("[data-delete-product]");
            const customer = event.target.closest("[data-customer-id]");
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

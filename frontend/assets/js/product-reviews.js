"use strict";

(() => {
    const $ = id => document.getElementById(id);
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[char]));
    const formatDate = value => value ? new Date(value).toLocaleDateString("vi-VN") : "—";
    const authToken = () => window.CHERI_AUTH?.getToken?.() || "";
    const state = { productId: null, rating: 0, page: 1, loading: false };

    async function request(url, options = {}) {
        const headers = { Accept: "application/json", ...(options.headers || {}) };
        if (options.body) headers["Content-Type"] = "application/json";
        if (authToken()) headers.Authorization = "Bearer " + authToken();
        const response = await fetch(url, { ...options, headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "Không thể xử lý yêu cầu.");
        return data;
    }

    function renderSummary(summary) {
        const box = $("review-summary");
        if (!box) return;
        const total = Number(summary.total || 0);
        box.innerHTML = total
            ? `<strong>${Number(summary.averageRating || 0).toFixed(1)} ★</strong> ${total.toLocaleString("vi-VN")} đánh giá`
            : "Chưa có đánh giá";
    }

    async function loadReviews() {
        const list = $("product-review-list");
        if (!list) return;
        try {
            const data = await request("/api/reviews/products/" + encodeURIComponent(state.productId) + "?page=" + state.page);
            renderSummary(data.summary || {});
            list.innerHTML = data.reviews.length ? data.reviews.map(review => `
                <article class="review-card">
                    <div class="review-card-head">
                        <span class="review-card-name">${escapeHtml(review.reviewer_name || "Khách hàng CHERI")}</span>
                        <span class="review-card-date">${formatDate(review.created_at)}</span>
                    </div>
                    <div class="review-card-stars" aria-label="${Number(review.rating)} trên 5 sao">${"★".repeat(Number(review.rating))}${"☆".repeat(5 - Number(review.rating))}</div>
                    <p class="review-card-content">${escapeHtml(review.content)}</p>
                </article>`).join("") : '<div class="review-empty">Sản phẩm chưa có đánh giá được duyệt. Hãy là khách hàng đầu tiên chia sẻ trải nghiệm nhé.</div>';
        } catch (error) {
            list.innerHTML = '<div class="review-empty">Chưa thể tải đánh giá. Vui lòng thử lại sau.</div>';
            console.error("Lỗi tải đánh giá:", error);
        }
    }

    function setRating(value) {
        state.rating = value;
        document.querySelectorAll("[data-review-rating]").forEach(button => {
            const selected = Number(button.dataset.reviewRating) <= value;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", String(Number(button.dataset.reviewRating) === value));
        });
    }

    async function loadEligiblePurchases() {
        const form = $("product-review-form");
        const prompt = $("review-login-prompt");
        if (!authToken()) {
            if (prompt) prompt.hidden = false;
            return;
        }
        if (!form) return;
        form.hidden = false;
        try {
            const data = await request("/api/reviews/eligible/" + encodeURIComponent(state.productId));
            const select = $("review-purchase");
            if (!data.items.length) {
                select.innerHTML = '<option value="">Chưa có đơn hoàn thành, thanh toán đủ điều kiện đánh giá</option>';
                select.disabled = true;
                $("review-submit").disabled = true;
                $("review-form-message").textContent = "Bạn chỉ có thể đánh giá sau khi đơn hàng đã hoàn thành và thanh toán.";
                return;
            }
            select.innerHTML = '<option value="">Chọn sản phẩm trong đơn hàng</option>' + data.items.map(item =>
                `<option value="${Number(item.order_id)}:${Number(item.order_item_id)}">Đơn ${escapeHtml(item.order_code)} · ${escapeHtml(item.size)} / ${escapeHtml(item.color_name)} · SL ${Number(item.quantity)}</option>`
            ).join("");
        } catch (error) {
            $("review-form-message").textContent = error.message;
        }
    }

    async function submitReview(event) {
        event.preventDefault();
        if (state.loading) return;
        const selected = $("review-purchase").value.split(":").map(Number);
        const content = $("review-content").value.trim();
        if (!selected[0] || !selected[1]) {
            $("review-form-message").textContent = "Vui lòng chọn sản phẩm trong đơn hàng đủ điều kiện.";
            return;
        }
        if (!state.rating) {
            $("review-form-message").textContent = "Vui lòng chấm từ 1 đến 5 sao.";
            return;
        }
        if (content.length < 10 || content.length > 2000) {
            $("review-form-message").textContent = "Nội dung cần từ 10 đến 2.000 ký tự.";
            return;
        }
        state.loading = true;
        $("review-submit").disabled = true;
        $("review-form-message").textContent = "Đang gửi đánh giá...";
        try {
            const data = await request("/api/reviews", {
                method: "POST",
                body: JSON.stringify({ order_id: selected[0], order_item_id: selected[1], rating: state.rating, content })
            });
            $("review-form-message").textContent = data.message;
            $("product-review-form").reset();
            setRating(0);
            await loadEligiblePurchases();
        } catch (error) {
            $("review-form-message").textContent = error.message;
        } finally {
            state.loading = false;
            $("review-submit").disabled = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const params = new URLSearchParams(window.location.search);
        state.productId = params.get("id");
        if (!state.productId) return;
        loadReviews();
        loadEligiblePurchases();
        document.querySelectorAll("[data-review-rating]").forEach(button =>
            button.addEventListener("click", () => setRating(Number(button.dataset.reviewRating)))
        );
        $("product-review-form")?.addEventListener("submit", submitReview);
    });
})();

"use strict";

let homeProducts = [];
let homeWishlistIds = new Set();
let homeWishlistUnavailable = false;

function homeFormatPrice(value) {
    return new Intl.NumberFormat("vi-VN").format(Number(value) || 0) + "đ";
}

function homeEscapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function homeNormalizeProduct(raw) {
    return {
        id: raw.id ?? raw.product_id,
        name: String(raw.name ?? raw.product_name ?? "Sản phẩm CHERI").trim(),
        category: String(raw.category ?? raw.category_name ?? "Thời trang nữ").trim(),
        price: Number(raw.price ?? raw.sale_price ?? 0),
        oldPrice: Number(raw.old_price ?? raw.original_price ?? 0),
        image: String(raw.image ?? raw.image_url ?? "").trim(),
        isNew: raw.is_new === true || Number(raw.is_new) === 1,
        isSale: raw.is_sale === true || Number(raw.is_sale) === 1
    };
}

async function homeLoadProducts() {
    const response = await fetch("/api/products", {
        headers: { Accept: "application/json" }
    });

    if (!response.ok) {
        throw new Error("Không thể tải danh sách sản phẩm. Vui lòng thử lại sau.");
    }

    const result = await response.json();
    const rows = Array.isArray(result) ? result : result.products ?? result.data ?? [];

    if (!Array.isArray(rows)) {
        throw new Error("Dữ liệu sản phẩm từ máy chủ không đúng định dạng.");
    }

    return rows
        .map(homeNormalizeProduct)
        .filter(product =>
            product.id !== undefined &&
            product.id !== null &&
            product.name &&
            Number.isFinite(product.price) &&
            product.price >= 0
        );
}

function homeRenderProduct(product) {
    const rawId = String(product.id);
    const id = encodeURIComponent(rawId);
    const dataId = homeEscapeHTML(rawId);
    const name = homeEscapeHTML(product.name);
    const category = homeEscapeHTML(product.category);
    const image = homeEscapeHTML(product.image || "../assets/images/products/ao-kieu.webp");
    const oldPrice = product.oldPrice > product.price
        ? `<del class="home-product-old-price">${homeFormatPrice(product.oldPrice)}</del>`
        : "";
    const badge = product.isSale
        ? '<span class="home-product-badge">Ưu đãi</span>'
        : product.isNew
            ? '<span class="home-product-badge">Mới</span>'
            : "";

    return `
        <article class="home-product-card">
            <a class="home-product-image" href="product.html?id=${id}" aria-label="Xem ${name}">
                ${badge}
                <img src="${image}" alt="${name}" loading="lazy">
            </a>
            <button
                type="button"
                class="home-wishlist-button"
                data-home-action="wishlist"
                data-product-id="${dataId}"
                aria-label="Thêm ${name} vào danh sách yêu thích"
                aria-pressed="false"
                title="Thêm vào yêu thích"
            >♡</button>
            <div class="home-product-info">
                <span class="home-product-category">${category}</span>
                <a class="home-product-name" href="product.html?id=${id}">${name}</a>
                <div class="home-product-price">
                    <span>${homeFormatPrice(product.price)}</span>
                    ${oldPrice}
                </div>
            </div>
        </article>
    `;
}

function homeReadWishlistStorage() {
    try {
        const key = typeof cheriStorageKey === "function"
            ? cheriStorageKey("cheri_wishlist")
            : "cheri_wishlist_guest";
        const rows = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

async function homeLoadWishlist() {
    homeWishlistIds = new Set();
    homeWishlistUnavailable = false;

    if (window.CheriCommerceAPI?.isLoggedIn()) {
        try {
            const result = await window.CheriCommerceAPI.getWishlist();
            const items = Array.isArray(result.items) ? result.items : [];
            homeWishlistIds = new Set(items.map(item => String(item.product_id ?? item.id)));
            return;
        } catch (error) {
            homeWishlistUnavailable = true;
            console.warn("Không thể tải yêu thích trên trang chủ:", error);
            homeShowToast("Chưa thể tải danh sách yêu thích từ tài khoản. Vui lòng tải lại trang.");
            return;
        }
    }

    homeWishlistIds = new Set(homeReadWishlistStorage().map(item =>
        String(typeof item === "object" ? item.id ?? item.product_id : item)
    ));
}

function homeUpdateWishlistButtons() {
    document.querySelectorAll(".home-wishlist-button").forEach(button => {
        const active = homeWishlistIds.has(button.dataset.productId);
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.textContent = active ? "♥" : "♡";
        button.title = active ? "Xóa khỏi yêu thích" : "Thêm vào yêu thích";
        button.disabled = homeWishlistUnavailable;
    });
}

function homeShowToast(message) {
    const toast = document.getElementById("home-toast");
    if (!toast) {
        console.warn(message);
        return;
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(homeShowToast.timer);
    homeShowToast.timer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2800);
}

async function homeToggleWishlist(product) {
    const productId = String(product.id);
    const alreadySaved = homeWishlistIds.has(productId);

    if (window.CheriCommerceAPI?.isLoggedIn()) {
        if (homeWishlistUnavailable) {
            homeShowToast("Danh sách yêu thích chưa tải được. Vui lòng tải lại trang.");
            return;
        }
        const numericId = Number(product.id);
        if (!Number.isSafeInteger(numericId) || numericId <= 0) {
            homeShowToast("Mã sản phẩm không hợp lệ.");
            return;
        }
        try {
            if (alreadySaved) {
                await window.CheriCommerceAPI.removeFromWishlist(numericId);
                homeWishlistIds.delete(productId);
                homeShowToast("Đã xóa khỏi danh sách yêu thích.");
            } else {
                await window.CheriCommerceAPI.addToWishlist(numericId);
                homeWishlistIds.add(productId);
                homeShowToast("Đã thêm vào danh sách yêu thích.");
            }
        } catch (error) {
            homeShowToast(error.message || "Không thể cập nhật danh sách yêu thích.");
            return;
        }
    } else {
        const key = typeof cheriStorageKey === "function"
            ? cheriStorageKey("cheri_wishlist")
            : "cheri_wishlist_guest";
        let wishlist = homeReadWishlistStorage();
        if (alreadySaved) {
            wishlist = wishlist.filter(item =>
                String(typeof item === "object" ? item.id ?? item.product_id : item) !== productId
            );
            homeWishlistIds.delete(productId);
            homeShowToast("Đã xóa khỏi danh sách yêu thích.");
        } else {
            wishlist.push({
                id: product.id,
                name: product.name,
                category: product.category,
                price: product.price,
                image: product.image
            });
            homeWishlistIds.add(productId);
            homeShowToast("Đã thêm vào danh sách yêu thích.");
        }
        try {
            localStorage.setItem(key, JSON.stringify(wishlist));
        } catch {
            homeShowToast("Không thể lưu danh sách yêu thích.");
            return;
        }
    }

    homeUpdateWishlistButtons();
    document.dispatchEvent(new CustomEvent("cheri:wishlist-updated"));
}

function homeBindWishlistEvents() {
    document.addEventListener("click", event => {
        const button = event.target.closest('[data-home-action="wishlist"]');
        if (!button || button.disabled) return;
        const product = homeProducts.find(item => String(item.id) === button.dataset.productId);
        if (product) homeToggleWishlist(product);
    });
}

function homeRenderMessage(container, message, withLink = false) {
    if (!container) return;
    container.innerHTML = `
        <div class="home-loading" role="status">
            <p>${homeEscapeHTML(message)}</p>
            ${withLink ? '<a href="shop.html">Khám phá tất cả sản phẩm</a>' : ""}
        </div>
    `;
}

function homeBindImageFallback(container) {
    container.querySelectorAll("img").forEach(image => {
        image.addEventListener("error", () => {
            if (image.dataset.fallbackApplied === "true") {
                image.hidden = true;
                image.closest(".home-product-image")?.classList.add("is-image-missing");
                return;
            }

            image.dataset.fallbackApplied = "true";
            image.src = "../assets/images/products/ao-kieu.webp";
        }, { once: true });
    });
}

async function homeInitProducts() {
    const featuredContainer = document.getElementById("home-featured-products");
    const newContainer = document.getElementById("home-new-products");
    if (!featuredContainer || !newContainer) return;

    try {
        const products = await homeLoadProducts();
        homeProducts = products;
        await homeLoadWishlist();

        if (!products.length) {
            homeRenderMessage(featuredContainer, "CHERI đang cập nhật sản phẩm mới.", true);
            homeRenderMessage(newContainer, "Hiện chưa có sản phẩm để hiển thị.", true);
            return;
        }

        const featured = products.filter(product => product.isSale || !product.isNew);
        const newArrivals = products.filter(product => product.isNew);
        const featuredProducts = (featured.length ? featured : products).slice(0, 4);
        const newProducts = (newArrivals.length ? newArrivals : [...products].reverse()).slice(0, 4);

        featuredContainer.innerHTML = featuredProducts.map(homeRenderProduct).join("");
        newContainer.innerHTML = newProducts.map(homeRenderProduct).join("");
        homeBindImageFallback(featuredContainer);
        homeBindImageFallback(newContainer);
        homeUpdateWishlistButtons();
    } catch (error) {
        console.error("Không thể tải sản phẩm trang chủ:", error);
        homeRenderMessage(featuredContainer, error.message || "Không thể tải sản phẩm.", true);
        homeRenderMessage(newContainer, "Vui lòng quay lại sau ít phút.", true);
    }
}

function homeInitPopup() {
    const popup = document.getElementById("home-promo-popup");
    const closeButton = document.getElementById("home-popup-close");
    const noShowCheckbox = document.getElementById("home-popup-no-show");

    if (!popup || !closeButton) return;

    try {
        if (
            sessionStorage.getItem("cheri_promo_shown") === "1" ||
            sessionStorage.getItem("cheri_promo_dismissed") === "1"
        ) return;

        sessionStorage.setItem("cheri_promo_shown", "1");
    } catch (error) {
        console.warn("Không thể lưu trạng thái cửa sổ giới thiệu:", error);
    }

    const closePopup = () => {
        popup.classList.remove("is-visible");
        popup.setAttribute("aria-hidden", "true");

        if (noShowCheckbox?.checked) {
            try {
                sessionStorage.setItem("cheri_promo_dismissed", "1");
            } catch (error) {
                console.warn("Không thể lưu tùy chọn cửa sổ giới thiệu:", error);
            }
        }
    };

    window.setTimeout(() => {
        popup.classList.add("is-visible");
        popup.setAttribute("aria-hidden", "false");
        closeButton.focus();
    }, 1200);

    closeButton.addEventListener("click", closePopup);
    popup.addEventListener("click", event => {
        if (event.target === popup) closePopup();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && popup.classList.contains("is-visible")) {
            closePopup();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    homeBindWishlistEvents();
    homeInitProducts();
    homeInitPopup();
});

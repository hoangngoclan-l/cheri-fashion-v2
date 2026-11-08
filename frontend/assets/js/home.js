"use strict";

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
    const id = encodeURIComponent(String(product.id));
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
    homeInitProducts();
    homeInitPopup();
});

"use strict";

document.addEventListener("DOMContentLoaded", loadWishlistPage);

let wishlistToastTimer = null;

function wishlistEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function wishlistPrice(value) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function wishlistStorageKey() {
    return typeof cheriStorageKey === "function"
        ? cheriStorageKey("cheri_wishlist")
        : "cheri_wishlist_guest";
}

function wishlistReadGuestItems() {
    try {
        const parsed = JSON.parse(localStorage.getItem(wishlistStorageKey()) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function wishlistShowToast(message) {
    const toast = document.getElementById("wishlist-toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(wishlistToastTimer);
    wishlistToastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2500);
}

async function wishlistLoadGuestProducts() {
    const saved = wishlistReadGuestItems();
    if (!saved.length) return [];

    try {
        const response = await fetch("/api/products");
        if (!response.ok) throw new Error("Không thể tải thông tin sản phẩm.");

        const result = await response.json();
        const products = Array.isArray(result)
            ? result
            : result.products ?? result.data ?? [];

        return saved.map(item => {
            const id = String(typeof item === "object" ? item.id ?? item.product_id : item);
            const product = products.find(row =>
                String(row.id ?? row.product_id) === id
            );

            return product
                ? { ...product, product_id: product.id ?? product.product_id }
                : typeof item === "object"
                    ? { ...item, product_id: item.id ?? item.product_id }
                    : { product_id: id, name: "Sản phẩm CHERI", price: 0, image: "" };
        });
    } catch (error) {
        console.warn("Không thể bổ sung thông tin sản phẩm:", error);
        return saved.map(item => typeof item === "object"
            ? { ...item, product_id: item.id ?? item.product_id }
            : { product_id: item, name: "Sản phẩm CHERI", price: 0, image: "" }
        );
    }
}

async function loadWishlistPage() {
    const grid = document.getElementById("wishlist-grid");
    if (!grid) return;

    try {
        let items = [];

        if (window.CheriCommerceAPI?.isLoggedIn()) {
            const result = await window.CheriCommerceAPI.getWishlist();
            items = Array.isArray(result.items) ? result.items : [];
        } else {
            items = await wishlistLoadGuestProducts();
        }

        renderWishlistItems(items);
    } catch (error) {
        console.error("Không thể tải danh sách yêu thích:", error);
        grid.innerHTML = `
            <div class="wishlist-state wishlist-error">
                <h2>Chưa thể tải danh sách yêu thích</h2>
                <p>${wishlistEscape(error.message || "Vui lòng thử lại sau.")}</p>
                <button type="button" id="wishlist-reload">Tải lại</button>
            </div>
        `;
        document.getElementById("wishlist-reload")
            ?.addEventListener("click", loadWishlistPage);
    }
}

function renderWishlistItems(items) {
    const grid = document.getElementById("wishlist-grid");
    const empty = document.getElementById("wishlist-empty");
    const count = document.getElementById("wishlist-result-count");

    if (!grid || !empty || !count) return;

    count.textContent = `${items.length} sản phẩm`;
    empty.hidden = items.length > 0;
    grid.hidden = items.length === 0;

    if (!items.length) {
        grid.innerHTML = "";
        return;
    }

    grid.innerHTML = items.map(item => {
        const id = item.product_id ?? item.id;
        const name = item.name ?? item.product_name ?? "Sản phẩm CHERI";
        const image = item.image ?? item.image_url ?? "";
        const price = item.price ?? item.sale_price ?? 0;
        const stock = Number(item.stock ?? item.quantity ?? 0);

        return `
            <article class="wishlist-card" data-product-id="${wishlistEscape(id)}">
                <a class="wishlist-card-image"
                   href="product.html?id=${encodeURIComponent(String(id))}">
                    ${image
                        ? `<img src="${wishlistEscape(image)}" alt="${wishlistEscape(name)}" loading="lazy">`
                        : '<span class="wishlist-image-placeholder">CHERI.</span>'}
                </a>
                <div class="wishlist-card-content">
                    <p class="wishlist-card-label">CHERI COLLECTION</p>
                    <a class="wishlist-card-name"
                       href="product.html?id=${encodeURIComponent(String(id))}">
                        ${wishlistEscape(name)}
                    </a>
                    <strong class="wishlist-card-price">${wishlistPrice(price)}</strong>
                    <p class="wishlist-card-stock">${stock > 0 ? `Còn ${stock} sản phẩm` : "Thông tin tồn kho tại cửa hàng"}</p>
                    <div class="wishlist-card-actions">
                        <a href="product.html?id=${encodeURIComponent(String(id))}" class="wishlist-view-link">XEM SẢN PHẨM</a>
                        <button type="button" class="wishlist-remove-button"
                                data-wishlist-remove="${wishlistEscape(id)}"
                                aria-label="Xóa ${wishlistEscape(name)} khỏi danh sách">Xóa ♡</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    grid.querySelectorAll(".wishlist-card-image img").forEach(image => {
        image.addEventListener("error", () => {
            const placeholder = document.createElement("span");
            placeholder.className = "wishlist-image-placeholder";
            placeholder.textContent = "CHERI.";
            image.replaceWith(placeholder);
        }, { once: true });
    });

    grid.querySelectorAll("[data-wishlist-remove]").forEach(button => {
        button.addEventListener("click", () => {
            removeWishlistItem(button.dataset.wishlistRemove);
        });
    });
}

async function removeWishlistItem(productId) {
    const button = document.querySelector(
        `[data-wishlist-remove="${CSS.escape(String(productId))}"]`
    );
    if (button) button.disabled = true;

    try {
        if (window.CheriCommerceAPI?.isLoggedIn()) {
            await window.CheriCommerceAPI.removeFromWishlist(productId);
        } else {
            const next = wishlistReadGuestItems().filter(item => {
                const id = typeof item === "object" ? item.id ?? item.product_id : item;
                return String(id) !== String(productId);
            });
            localStorage.setItem(wishlistStorageKey(), JSON.stringify(next));
        }

        document.dispatchEvent(new CustomEvent("cheri:wishlist-updated"));
        wishlistShowToast("Đã xóa sản phẩm khỏi danh sách yêu thích.");
        await loadWishlistPage();
    } catch (error) {
        if (button) button.disabled = false;
        wishlistShowToast(error.message || "Không thể xóa sản phẩm.");
    }
}

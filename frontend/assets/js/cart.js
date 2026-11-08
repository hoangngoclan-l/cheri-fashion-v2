
"use strict";

const CART_STORAGE_KEY = cheriStorageKey("cheri_cart");

let cartBusy = false;

// ==============================
// ĐỌC VÀ LƯU GIỎ HÀNG
// ==============================

function cartRead() {
    try {
        const data = JSON.parse(
            localStorage.getItem(CART_STORAGE_KEY) || "[]"
        );

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Không thể đọc giỏ hàng:", error);
        return [];
    }
}

function cartSave(items) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));

    document.dispatchEvent(new CustomEvent("cheri:cart-updated"));
    window.dispatchEvent(new CustomEvent("cheri:cart-updated"));
}

function cartIsLoggedIn() {
    return Boolean(
        window.CheriCommerceAPI &&
        window.CheriCommerceAPI.isLoggedIn()
    );
}

// ==============================
// CHUYỂN DỮ LIỆU MYSQL SANG GIAO DIỆN
// ==============================

function cartMapServerItems(serverItems) {
    const oldItems = cartRead();

    return serverItems.map(item => {
        const cartItemId = Number(item.cart_item_id);

        const oldItem = oldItems.find(
            old => Number(old.cartItemId) === cartItemId
        );

        return {
            cartItemId,
            id: Number(item.product_id),
            productId: Number(item.product_id),
            name: item.name || "Sản phẩm Cheri",
            price: Number(item.price) || 0,
            image: item.image || "",
            size: item.size || "",
            color: item.color || "",
            quantity: Number(item.quantity) || 1,
            stock: Number(item.stock) || 0,
            selected: oldItem ? oldItem.selected !== false : true
        };
    });
}

// ==============================
// ĐỊNH DẠNG VÀ HIỂN THỊ
// ==============================

function cartFormatPrice(price) {
    return new Intl.NumberFormat("vi-VN").format(
        Number(price) || 0
    ) + "đ";
}

function cartEscapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function cartGetQuantity(item) {
    return Math.max(
        1,
        Math.floor(Number(item.quantity ?? item.qty) || 1)
    );
}

function cartShowToast(message) {
    const toast = document.getElementById("cart-toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");

    clearTimeout(cartShowToast.timeoutId);

    cartShowToast.timeoutId = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2400);
}

function cartGetSelectedItems(items = cartRead()) {
    return items.filter(item => item.selected !== false);
}

function cartGetSubtotal(items) {
    return items.reduce((total, item) => {
        return total +
            (Number(item.price) || 0) * cartGetQuantity(item);
    }, 0);
}

// ==============================
// HIỂN THỊ GIỎ HÀNG TRỐNG
// ==============================

function cartRenderEmpty() {
    const container = document.getElementById("cart-items");

    if (container) {
        container.innerHTML = `
            <div class="cart-empty">
                <h3>Giỏ hàng đang trống</h3>
                <p>
                    Có vẻ bạn chưa chọn món đồ nào.
                    Hãy khám phá bộ sưu tập của Cheri nhé!
                </p>
                <a href="shop.html" class="cart-empty-link">
                    KHÁM PHÁ SẢN PHẨM
                </a>
            </div>
        `;
    }

    const count = document.getElementById("cart-item-count");
    const selectedCount = document.getElementById("selected-count");
    const selectAll = document.getElementById("select-all-cart");
    const subtotal = document.getElementById("cart-subtotal");
    const total = document.getElementById("cart-total");
    const checkout = document.getElementById("cart-checkout-button");
    const clear = document.getElementById("cart-clear-button");

    if (count) count.textContent = "0 sản phẩm";
    if (selectedCount) selectedCount.textContent = "Đã chọn 0 sản phẩm";

    if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        selectAll.disabled = true;
    }

    if (subtotal) subtotal.textContent = cartFormatPrice(0);
    if (total) total.textContent = cartFormatPrice(0);

    if (checkout) checkout.disabled = true;
    if (clear) clear.disabled = true;
}

// ==============================
// HIỂN THỊ DANH SÁCH SẢN PHẨM
// ==============================

function cartRender() {
    const container = document.getElementById("cart-items");
    if (!container) return;

    const items = cartRead();

    if (!items.length) {
        cartRenderEmpty();
        return;
    }

    container.innerHTML = items.map((item, index) => {
        const quantity = cartGetQuantity(item);
        const price = Number(item.price) || 0;
        const name = cartEscapeHTML(item.name || "Sản phẩm Cheri");

        const image = cartEscapeHTML(
            item.image || "../assets/images/products/ao-kieu.webp"
        );

        const size = cartEscapeHTML(item.size || "Chưa chọn");
        const color = cartEscapeHTML(item.color || "Chưa chọn");
        const id = encodeURIComponent(String(item.id ?? ""));
        const lineTotal = price * quantity;
        const isSelected = item.selected !== false;

        return `
            <article class="cart-item">
                <label class="cart-item-select">
                    <input
                        type="checkbox"
                        class="cart-item-checkbox"
                        data-action="select"
                        data-index="${index}"
                        ${isSelected ? "checked" : ""}
                        aria-label="Chọn ${name}"
                    >
                </label>

                <a
                    class="cart-item-image-link"
                    href="product.html?id=${id}"
                    aria-label="Xem ${name}"
                >
                    <img
                        class="cart-item-image"
                        src="${image}"
                        alt="${name}"
                        loading="lazy"
                    >
                </a>

                <div class="cart-item-info">
                    <a
                        class="cart-item-name"
                        href="product.html?id=${id}"
                    >${name}</a>

                    <span class="cart-item-category">
                        CHERI FASHION
                    </span>

                    <span class="cart-item-variant">
                        Kích cỡ: ${size}<br>
                        Màu sắc: ${color}
                    </span>

                    <div class="cart-item-price">
                        ${cartFormatPrice(price)}
                    </div>

                    <div class="cart-item-quantity">
                        <button
                            type="button"
                            data-action="decrease"
                            data-index="${index}"
                            aria-label="Giảm số lượng"
                            ${cartBusy ? "disabled" : ""}
                        >−</button>

                        <input
                            type="number"
                            min="1"
                            max="99"
                            value="${quantity}"
                            data-action="quantity"
                            data-index="${index}"
                            aria-label="Số lượng ${name}"
                            ${cartBusy ? "disabled" : ""}
                        >

                        <button
                            type="button"
                            data-action="increase"
                            data-index="${index}"
                            aria-label="Tăng số lượng"
                            ${cartBusy ? "disabled" : ""}
                        >+</button>
                    </div>
                </div>

                <div class="cart-item-side">
                    <span class="cart-item-line-total">
                        ${cartFormatPrice(lineTotal)}
                    </span>

                    <button
                        type="button"
                        class="cart-remove-button"
                        data-action="remove"
                        data-index="${index}"
                        ${cartBusy ? "disabled" : ""}
                    >
                        Xóa
                    </button>
                </div>
            </article>
        `;
    }).join("");

    container.querySelectorAll(".cart-item-image").forEach(image => {
        image.addEventListener("error", () => {
            image.style.visibility = "hidden";
            image.alt = "Ảnh sản phẩm chưa có";
            image.parentElement.style.background = "#f7f1f2";
        }, { once: true });
    });

    const selectedItems = cartGetSelectedItems(items);

    const selectedCount = document.getElementById("selected-count");
    const selectAll = document.getElementById("select-all-cart");

    if (selectedCount) {
        selectedCount.textContent =
            `Đã chọn ${selectedItems.length} sản phẩm`;
    }

    if (selectAll) {
        selectAll.checked =
            items.length > 0 && selectedItems.length === items.length;

        selectAll.indeterminate =
            selectedItems.length > 0 &&
            selectedItems.length < items.length;

        selectAll.disabled = items.length === 0;
    }

    const totalQuantity = selectedItems.reduce(
        (total, item) => total + cartGetQuantity(item),
        0
    );

    const subtotal = cartGetSubtotal(selectedItems);

    const count = document.getElementById("cart-item-count");
    const subtotalElement = document.getElementById("cart-subtotal");
    const totalElement = document.getElementById("cart-total");
    const checkout = document.getElementById("cart-checkout-button");
    const clear = document.getElementById("cart-clear-button");

    if (count) {
        count.textContent = `${totalQuantity} sản phẩm`;
    }

    if (subtotalElement) {
        subtotalElement.textContent = cartFormatPrice(subtotal);
    }

    if (totalElement) {
        totalElement.textContent = cartFormatPrice(subtotal);
    }

    if (checkout) {
        checkout.disabled = selectedItems.length === 0 || cartBusy;
    }

    if (clear) {
        clear.disabled = items.length === 0 || cartBusy;
    }
}

// ==============================
// TẢI GIỎ HÀNG TỪ MYSQL
// ==============================

async function cartLoad() {
    const container = document.getElementById("cart-items");
    if (!container) return;

    if (!cartIsLoggedIn()) {
        cartRender();
        return;
    }

    if (!window.CheriCommerceAPI) {
        cartShowToast("Không tải được chức năng giỏ hàng.");
        return;
    }

    container.innerHTML = `
        <p class="cart-loading">Đang tải giỏ hàng...</p>
    `;

    try {
        const result = await window.CheriCommerceAPI.getCart();

        const serverItems = Array.isArray(result.items)
            ? result.items
            : [];

        const items = cartMapServerItems(serverItems);

        cartSave(items);
        cartRender();

    } catch (error) {
        console.error("Lỗi tải giỏ hàng từ MySQL:", error);

        container.innerHTML = `
            <div class="cart-empty">
                <h3>Không thể tải giỏ hàng</h3>
                <p>${cartEscapeHTML(error.message)}</p>
                <button type="button" onclick="cartLoad()">
                    Thử tải lại
                </button>
            </div>
        `;
    }
}

// ==============================
// GỌI API CẬP NHẬT GIỎ HÀNG
// ==============================

async function cartApiRequest(endpoint, method, body) {
    return window.CheriCommerceAPI.request(endpoint, {
        method,
        ...(body !== undefined
            ? { body: JSON.stringify(body) }
            : {})
    });
}

async function cartRefreshAfterAction(message) {
    await cartLoad();

    if (message) {
        cartShowToast(message);
    }
}

// ==============================
// CẬP NHẬT SỐ LƯỢNG
// ==============================

async function cartUpdateQuantity(index, newQuantity) {
    const items = cartRead();
    const item = items[index];

    if (!item || cartBusy) return;

    let quantity = Math.max(
        1,
        Math.min(99, Math.floor(Number(newQuantity) || 1))
    );

    if (item.stock > 0) {
        quantity = Math.min(quantity, Number(item.stock));
    }

    if (cartIsLoggedIn()) {
        if (!item.cartItemId) {
            cartShowToast("Không xác định được sản phẩm trong giỏ hàng.");
            return;
        }

        cartBusy = true;
        cartRender();

        try {
            await cartApiRequest(
                `/api/cart/${item.cartItemId}`,
                "PATCH",
                { quantity }
            );

            await cartRefreshAfterAction("Đã cập nhật số lượng.");

        } catch (error) {
            console.error("Lỗi cập nhật số lượng:", error);
            cartShowToast(error.message);
            await cartLoad();

        } finally {
            cartBusy = false;
            cartRender();
        }

        return;
    }

    item.quantity = quantity;
    item.qty = quantity;

    cartSave(items);
    cartRender();
}

// ==============================
// XÓA MỘT SẢN PHẨM
// ==============================

async function cartRemoveItem(index) {
    const items = cartRead();
    const item = items[index];

    if (!item || cartBusy) return;

    const removedName = item.name || "Sản phẩm";

    if (cartIsLoggedIn()) {
        if (!item.cartItemId) {
            cartShowToast("Không xác định được sản phẩm trong giỏ hàng.");
            return;
        }

        cartBusy = true;
        cartRender();

        try {
            await cartApiRequest(
                `/api/cart/${item.cartItemId}`,
                "DELETE"
            );

            await cartRefreshAfterAction(
                `Đã xóa "${removedName}" khỏi giỏ hàng.`
            );

        } catch (error) {
            console.error("Lỗi xóa sản phẩm:", error);
            cartShowToast(error.message);
            await cartLoad();

        } finally {
            cartBusy = false;
            cartRender();
        }

        return;
    }

    items.splice(index, 1);
    cartSave(items);
    cartRender();

    cartShowToast(`Đã xóa "${removedName}" khỏi giỏ hàng.`);
}

// ==============================
// XÓA TOÀN BỘ GIỎ HÀNG
// ==============================

async function cartClearAll() {
    const items = cartRead();

    if (!items.length || cartBusy) return;

    const confirmed = window.confirm(
        "Bạn có chắc muốn xóa toàn bộ sản phẩm trong giỏ hàng?"
    );

    if (!confirmed) return;

    if (cartIsLoggedIn()) {
        cartBusy = true;
        cartRender();

        try {
            await cartApiRequest("/api/cart", "DELETE");

            cartSave([]);
            cartRender();

            cartShowToast("Đã xóa toàn bộ giỏ hàng.");

        } catch (error) {
            console.error("Lỗi xóa giỏ hàng:", error);
            cartShowToast(error.message);
            await cartLoad();

        } finally {
            cartBusy = false;
            cartRender();
        }

        return;
    }

    cartSave([]);
    cartRender();

    cartShowToast("Đã xóa toàn bộ giỏ hàng.");
}

// ==============================
// GẮN SỰ KIỆN
// ==============================

function cartBindEvents() {
    const container = document.getElementById("cart-items");

    container?.addEventListener("click", async event => {
        const button = event.target.closest("[data-action]");
        if (!button || cartBusy) return;

        const index = Number(button.dataset.index);
        const action = button.dataset.action;
        const items = cartRead();

        if (!items[index]) return;

        const currentQuantity = cartGetQuantity(items[index]);

        if (action === "increase") {
            await cartUpdateQuantity(index, currentQuantity + 1);
        }

        if (action === "decrease") {
            if (currentQuantity <= 1) {
                cartShowToast("Số lượng tối thiểu là 1.");
                return;
            }

            await cartUpdateQuantity(index, currentQuantity - 1);
        }

        if (action === "remove") {
            await cartRemoveItem(index);
        }
    });

    container?.addEventListener("change", async event => {
        const checkbox = event.target.closest(
            'input[data-action="select"]'
        );

        if (checkbox) {
            const items = cartRead();
            const index = Number(checkbox.dataset.index);

            if (items[index]) {
                items[index].selected = checkbox.checked;
                cartSave(items);
                cartRender();
            }

            return;
        }

        const input = event.target.closest(
            'input[data-action="quantity"]'
        );

        if (input) {
            await cartUpdateQuantity(
                Number(input.dataset.index),
                input.value
            );
        }
    });

    document.getElementById("select-all-cart")
        ?.addEventListener("change", event => {
            const items = cartRead();

            items.forEach(item => {
                item.selected = event.target.checked;
            });

            cartSave(items);
            cartRender();
        });

    document.getElementById("cart-clear-button")
        ?.addEventListener("click", cartClearAll);

    document.getElementById("cart-checkout-button")
        ?.addEventListener("click", () => {
            const items = cartRead();

            const selectedItems = items.filter(
                item => item.selected !== false
            );

            if (!selectedItems.length) {
                cartShowToast("Vui lòng chọn ít nhất một sản phẩm.");
                return;
            }

            localStorage.setItem(
                cheriStorageKey("cheri_checkout_items"),
                JSON.stringify(selectedItems)
            );

            window.location.href = "checkout.html";
        });

    window.addEventListener("storage", event => {
        if (event.key === CART_STORAGE_KEY) {
            cartRender();
        }
    });

    document.addEventListener("cheri:cart-updated", cartRender);
}

// ==============================
// KHỞI CHẠY
// ==============================

document.addEventListener("DOMContentLoaded", () => {
    cartBindEvents();
    cartLoad();
});

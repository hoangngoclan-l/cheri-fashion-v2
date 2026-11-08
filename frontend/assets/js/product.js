const PRODUCT_SAMPLE_DATA = [
    {
        id: 1,
        name: "Áo kiểu tối giản",
        category: "Áo nữ",
        price: 320000,
        oldPrice: 390000,
        image: "../assets/images/products/ao-kieu.webp",
        description:
            "Thiết kế tối giản, dễ phối cùng quần jeans, chân váy hoặc quần âu. Phù hợp để mặc đi học, đi làm và dạo phố.",
        sizes: ["S", "M", "L", "XL"],
        colors: [
            { name: "Trắng", code: "#f5f0e8" },
            { name: "Đen", code: "#292629" },
            { name: "Hồng nhạt", code: "#e8c6ce" }
        ],
        stock: 20
    },
    {
        id: 2,
        name: "Váy nữ thanh lịch",
        category: "Váy",
        price: 490000,
        oldPrice: 0,
        image: "../assets/images/products/vay-thanh-lich.webp",
        description:
            "Thiết kế nữ tính với đường nét thanh lịch. Dễ dàng kết hợp cùng giày bệt, giày cao gót và phụ kiện yêu thích.",
        sizes: ["S", "M", "L"],
        colors: [
            { name: "Kem", code: "#e8ddca" },
            { name: "Đen", code: "#292629" }
        ],
        stock: 15
    },
    {
        id: 3,
        name: "Quần ống rộng hiện đại",
        category: "Quần",
        price: 420000,
        oldPrice: 0,
        image: "../assets/images/products/quan-ong-rong.webp",
        description:
            "Phom quần ống rộng mang lại vẻ ngoài hiện đại, dễ phối với áo kiểu và áo thun.",
        sizes: ["S", "M", "L", "XL"],
        colors: [
            { name: "Đen", code: "#292629" },
            { name: "Be", code: "#c8b69f" }
        ],
        stock: 18
    },
    {
        id: 4,
        name: "Chân váy hiện đại",
        category: "Váy",
        price: 380000,
        oldPrice: 0,
        image: "../assets/images/products/chan-vay.webp",
        description:
            "Chân váy dễ phối đồ, phù hợp với nhiều phong cách từ nhẹ nhàng đến thanh lịch.",
        sizes: ["S", "M", "L"],
        colors: [
            { name: "Đen", code: "#292629" },
            { name: "Kem", code: "#e8ddca" }
        ],
        stock: 12
    },
    {
        id: 5,
        name: "Áo khoác thanh lịch",
        category: "Áo khoác",
        price: 550000,
        oldPrice: 0,
        image: "../assets/images/products/ao-khoac.webp",
        description:
            "Áo khoác nữ với thiết kế hiện đại, dễ kết hợp cùng trang phục thường ngày.",
        sizes: ["S", "M", "L", "XL"],
        colors: [
            { name: "Be", code: "#c8b69f" },
            { name: "Đen", code: "#292629" }
        ],
        stock: 10
    },
    {
        id: 6,
        name: "Set đồ nữ hiện đại",
        category: "Set đồ nữ",
        price: 620000,
        oldPrice: 0,
        image: "../assets/images/products/set-do-nu.webp",
        description:
            "Set đồ đồng bộ giúp bạn tiết kiệm thời gian phối trang phục mà vẫn giữ được vẻ chỉn chu.",
        sizes: ["S", "M", "L"],
        colors: [
            { name: "Kem", code: "#e8ddca" },
            { name: "Hồng nhạt", code: "#e8c6ce" }
        ],
        stock: 8
    }
];

let currentProduct = null;
let selectedSize = "";
let selectedColor = "";
let productQuantity = 1;
let productWishlistIds = new Set();

function productFormatPrice(price) {
    return new Intl.NumberFormat("vi-VN").format(price) + "đ";
}

function productEscapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function productGetId(product) {
    return String(product.id ?? product.product_id ?? "");
}

function productNormalize(raw, index) {
    const defaultProduct = PRODUCT_SAMPLE_DATA[index % PRODUCT_SAMPLE_DATA.length];

    const rawPrice = Number(raw.price ?? raw.sale_price ?? defaultProduct.price);

    let sizes = raw.sizes ?? raw.available_sizes ?? defaultProduct.sizes;
    if (typeof sizes === "string") {
        sizes = sizes.split(",").map(size => size.trim()).filter(Boolean);
    }
    if (!Array.isArray(sizes) || !sizes.length) {
        sizes = defaultProduct.sizes;
    }

    let colors = raw.colors ?? raw.available_colors ?? defaultProduct.colors;
    if (typeof colors === "string") {
        colors = colors.split(",").map(name => ({
            name: name.trim(),
            code: "#d8c6cc"
        })).filter(color => color.name);
    }
    if (!Array.isArray(colors) || !colors.length) {
        colors = defaultProduct.colors;
    }

    return {
        id: raw.id ?? raw.product_id ?? defaultProduct.id,
        name: raw.name ?? raw.product_name ?? defaultProduct.name,
        category: raw.category_name ?? raw.category ?? defaultProduct.category,
        price: Number.isFinite(rawPrice) ? rawPrice : defaultProduct.price,
        oldPrice: Number(raw.old_price ?? raw.original_price ?? 0),
        image: raw.image ?? raw.image_url ?? defaultProduct.image,
        description: raw.description ?? defaultProduct.description,
        sizes,
        colors,
        stock: Math.max(0, Number(raw.stock ?? raw.quantity ?? defaultProduct.stock))
    };
}

async function productLoadAll() {
    try {
        const response = await fetch("/api/products");

        if (!response.ok) {
            throw new Error("API sản phẩm chưa sẵn sàng.");
        }

        const result = await response.json();
        const data = Array.isArray(result)
            ? result
            : result.products ?? result.data ?? [];

        if (Array.isArray(data) && data.length) {
            return data.map(productNormalize);
        }
    } catch (error) {
        console.warn("Đang dùng dữ liệu mẫu:", error.message);
    }

    return PRODUCT_SAMPLE_DATA.map(product => ({ ...product }));
}

function productShowToast(message) {
    const toast = document.getElementById("product-toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");

    window.clearTimeout(productShowToast.timeoutId);
    productShowToast.timeoutId = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}

function productReadStorage(key) {
    try {
        const data = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function productWriteStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function productDispatchUpdate(eventName) {
    document.dispatchEvent(new CustomEvent(eventName));
    window.dispatchEvent(new CustomEvent(eventName));
}

function productRenderDetail(product) {
    const container = document.getElementById("product-detail-content");
    const breadcrumb = document.getElementById("product-breadcrumb-name");
    const description = document.getElementById("product-description");

    if (!container) return;

    if (breadcrumb) breadcrumb.textContent = product.name;
    if (description) {
        description.textContent = product.description || "Thông tin sản phẩm đang được cập nhật.";
    }

    selectedSize = "";
    selectedColor = "";
    productQuantity = 1;

    const discount = product.oldPrice > product.price
        ? Math.round((1 - product.price / product.oldPrice) * 100)
        : 0;

    const stockText = product.stock > 0
        ? `Còn hàng · ${product.stock} sản phẩm`
        : "Sản phẩm tạm hết hàng";

    container.innerHTML = `
        <div class="product-detail-layout">
            <div class="product-gallery">
                <div class="product-main-image">
                    <span class="product-gallery-note">CHERI SELECTION</span>
                    <img
                        id="product-main-photo"
                        src="${productEscapeHTML(product.image)}"
                        alt="${productEscapeHTML(product.name)}"
                    >
                </div>
            </div>

            <div class="product-info">
                <span class="product-info-category">
                    ${productEscapeHTML(product.category)}
                </span>

                <h1>${productEscapeHTML(product.name)}</h1>

                <div class="product-price-row">
                    <span class="product-current-price">
                        ${productFormatPrice(product.price)}
                    </span>

                    ${product.oldPrice > product.price ? `
                        <span class="product-old-price">
                            ${productFormatPrice(product.oldPrice)}
                        </span>
                        <span class="product-discount">-${discount}%</span>
                    ` : ""}
                </div>

                <p class="product-short-description">
                    ${productEscapeHTML(product.description)}
                </p>

                <p class="product-stock ${product.stock <= 0 ? "is-out" : ""}">
                    ${stockText}
                </p>

                <div class="product-option">
                    <div class="product-option-heading">
                        <span>Kích cỡ</span>
                        <span class="product-option-current" id="product-size-current">
                            Chưa chọn
                        </span>
                    </div>

                    <div class="product-size-list" id="product-size-list">
                        ${product.sizes.map(size => `
                            <button
                                type="button"
                                class="product-size-button"
                                data-size="${productEscapeHTML(size)}"
                                aria-pressed="false"
                            >${productEscapeHTML(size)}</button>
                        `).join("")}
                    </div>
                </div>

                <div class="product-option">
                    <div class="product-option-heading">
                        <span>Màu sắc</span>
                        <span class="product-option-current" id="product-color-current">
                            Chưa chọn
                        </span>
                    </div>

                    <div class="product-color-list" id="product-color-list">
                        ${product.colors.map(color => `
                            <button
                                type="button"
                                class="product-color-button"
                                data-color="${productEscapeHTML(color.name)}"
                                aria-pressed="false"
                            >
                                <span
                                    class="product-color-dot"
                                    style="background:${/^#[0-9a-f]{3,8}$/i.test(color.code) ? color.code : "#d8c6cc"}"
                                ></span>
                                ${productEscapeHTML(color.name)}
                            </button>
                        `).join("")}
                    </div>
                </div>

                <div class="product-quantity-row">
                    <span class="product-quantity-label">Số lượng</span>

                    <div class="product-quantity-control">
                        <button type="button" id="product-quantity-minus"
                                aria-label="Giảm số lượng">−</button>

                        <input id="product-quantity"
                               type="number"
                               min="1"
                               max="${product.stock}"
                               value="1"
                               inputmode="numeric"
                               aria-label="Số lượng mua">

                        <button type="button" id="product-quantity-plus"
                                aria-label="Tăng số lượng">+</button>
                    </div>
                </div>

                <div class="product-action-buttons">
                    <button type="button"
                            class="product-action-button product-add-cart"
                            id="product-add-cart"
                            ${product.stock <= 0 ? "disabled" : ""}>
                        THÊM VÀO GIỎ
                    </button>

                    <button type="button"
                            class="product-action-button product-buy-now"
                            id="product-buy-now"
                            ${product.stock <= 0 ? "disabled" : ""}>
                        MUA NGAY
                    </button>
                </div>

                <button type="button"
                        class="product-wishlist-button"
                        id="product-wishlist-button">
                    ♡ Thêm vào danh sách yêu thích
                </button>

                <div class="product-policy-list">
                    <div class="product-policy-item">
                        <span class="product-policy-icon">✧</span>
                        <span>Thiết kế hiện đại, dễ phối đồ mỗi ngày.</span>
                    </div>
                    <div class="product-policy-item">
                        <span class="product-policy-icon">♡</span>
                        <span>Kiểm tra kỹ thông tin size và màu trước khi đặt hàng.</span>
                    </div>
                    <div class="product-policy-item">
                        <span class="product-policy-icon">↗</span>
                        <span>Thông tin giao hàng và đổi trả sẽ được xác nhận ở bước thanh toán.</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const photo = document.getElementById("product-main-photo");
    photo.addEventListener("error", () => {
        photo.style.display = "none";
        const placeholder = document.createElement("div");
        placeholder.className = "product-image-placeholder";
        placeholder.textContent = "Ảnh sản phẩm chưa được thêm";
        photo.parentElement.appendChild(placeholder);
    }, { once: true });

    productBindControls();
    productUpdateWishlistButton();
}

function productBindControls() {
    const sizeList = document.getElementById("product-size-list");
    const colorList = document.getElementById("product-color-list");
    const quantityInput = document.getElementById("product-quantity");

    sizeList?.addEventListener("click", event => {
        const button = event.target.closest("[data-size]");
        if (!button || button.disabled) return;

        selectedSize = button.dataset.size;

        sizeList.querySelectorAll("[data-size]").forEach(item => {
            const selected = item === button;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-pressed", String(selected));
        });

        document.getElementById("product-size-current").textContent = selectedSize;
    });

    colorList?.addEventListener("click", event => {
        const button = event.target.closest("[data-color]");
        if (!button) return;

        selectedColor = button.dataset.color;

        colorList.querySelectorAll("[data-color]").forEach(item => {
            const selected = item === button;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-pressed", String(selected));
        });

        document.getElementById("product-color-current").textContent = selectedColor;
    });

    function setQuantity(value) {
        const max = Math.max(1, currentProduct.stock);
        productQuantity = Math.min(max, Math.max(1, Math.floor(Number(value) || 1)));

        if (quantityInput) {
            quantityInput.value = String(productQuantity);
        }
    }

    document.getElementById("product-quantity-minus")?.addEventListener("click", () => {
        setQuantity(productQuantity - 1);
    });

    document.getElementById("product-quantity-plus")?.addEventListener("click", () => {
        setQuantity(productQuantity + 1);
    });

    quantityInput?.addEventListener("change", () => {
        setQuantity(quantityInput.value);
    });

    document.getElementById("product-add-cart")?.addEventListener("click", () => {
        productAddToCart(false);
    });

    document.getElementById("product-buy-now")?.addEventListener("click", () => {
        productAddToCart(true);
    });

    document.getElementById("product-wishlist-button")?.addEventListener("click", () => {
        productToggleWishlist();
    });
}

function productValidateSelection() {
    if (!selectedSize) {
        productShowToast("Vui lòng chọn kích cỡ sản phẩm.");
        return false;
    }

    if (!selectedColor) {
        productShowToast("Vui lòng chọn màu sắc sản phẩm.");
        return false;
    }

    if (!currentProduct || currentProduct.stock <= 0) {
        productShowToast("Sản phẩm hiện đã hết hàng.");
        return false;
    }

    if (productQuantity < 1 || productQuantity > currentProduct.stock) {
        productShowToast("Số lượng vượt quá số sản phẩm hiện có.");
        return false;
    }

    return true;
}

function productBuildCartItem() {
    return {
        id: currentProduct.id,
        name: currentProduct.name,
        price: currentProduct.price,
        image: currentProduct.image,
        size: selectedSize,
        color: selectedColor,
        quantity: productQuantity
    };
}

async function productAddToCart(buyNow) {
    if (!productValidateSelection()) return;

    const item = productBuildCartItem();

    if (buyNow) {
        try {
            localStorage.setItem("cheri_buy_now", JSON.stringify(item));
            window.location.href = "checkout.html?mode=buy-now";
        } catch {
            productShowToast("Không thể lưu thông tin sản phẩm. Hãy kiểm tra bộ nhớ trình duyệt.");
        }
        return;
    }

    if (window.CheriCommerceAPI?.isLoggedIn()) {
        try {
            await window.CheriCommerceAPI.addToCart(item);
        } catch (error) {
            productShowToast(error.message || "Không thể thêm sản phẩm vào giỏ hàng.");
            return;
        }
    } else {
        try {
            const cart = productReadStorage("cheri_cart");
            const existingItem = cart.find(cartItem =>
                String(cartItem.id ?? cartItem.product_id) === String(item.id) &&
                String(cartItem.size ?? "") === item.size &&
                String(cartItem.color ?? cartItem.colorName ?? "") === item.color
            );

            if (existingItem) {
                const oldQuantity = Number(existingItem.quantity ?? existingItem.qty ?? 0);
                existingItem.quantity = Math.min(
                    currentProduct.stock,
                    oldQuantity + item.quantity
                );
                existingItem.qty = existingItem.quantity;
            } else {
                cart.push({ ...item, qty: item.quantity });
            }

            productWriteStorage("cheri_cart", cart);
        } catch {
            productShowToast("Không thể cập nhật giỏ hàng. Vui lòng thử lại.");
            return;
        }
    }

    productDispatchUpdate("cheri:cart-updated");
    productShowToast("Đã thêm sản phẩm vào giỏ hàng!");
}

async function productLoadWishlist() {
    productWishlistIds = new Set();

    if (window.CheriCommerceAPI?.isLoggedIn()) {
        try {
            const result = await window.CheriCommerceAPI.getWishlist();
            const items = Array.isArray(result.items) ? result.items : [];
            productWishlistIds = new Set(items.map(item => String(item.product_id ?? item.id)));
            return;
        } catch (error) {
            console.warn("Không thể tải danh sách yêu thích:", error);
            productShowToast("Chưa thể tải danh sách yêu thích từ tài khoản.");
        }
    }

    const key = typeof cheriStorageKey === "function" ? cheriStorageKey("cheri_wishlist") : "cheri_wishlist_guest";
    const saved = productReadStorage(key);
    productWishlistIds = new Set(saved.map(item => String(
        typeof item === "object" ? item.id ?? item.product_id : item
    )));
}

function productUpdateWishlistButton() {
    const button = document.getElementById("product-wishlist-button");
    if (!button || !currentProduct) return;

    const isSaved = productWishlistIds.has(String(currentProduct.id));
    button.classList.toggle("is-active", isSaved);
    button.setAttribute("aria-pressed", String(isSaved));
    button.textContent = isSaved
        ? "♥ Đã có trong danh sách yêu thích"
        : "♡ Thêm vào danh sách yêu thích";
}

async function productToggleWishlist() {
    if (!currentProduct) return;

    const productId = String(currentProduct.id);
    const isSaved = productWishlistIds.has(productId);

    if (window.CheriCommerceAPI?.isLoggedIn()) {
        const numericId = Number(currentProduct.id);
        if (!Number.isInteger(numericId) || numericId <= 0) {
            productShowToast("Mã sản phẩm không hợp lệ.");
            return;
        }

        try {
            if (isSaved) {
                await window.CheriCommerceAPI.removeFromWishlist(numericId);
                productWishlistIds.delete(productId);
                productShowToast("Đã xóa khỏi danh sách yêu thích.");
            } else {
                await window.CheriCommerceAPI.addToWishlist(numericId);
                productWishlistIds.add(productId);
                productShowToast("Đã thêm vào danh sách yêu thích.");
            }
        } catch (error) {
            productShowToast(error.message || "Không thể cập nhật danh sách yêu thích.");
            return;
        }
    } else {
        const key = typeof cheriStorageKey === "function" ? cheriStorageKey("cheri_wishlist") : "cheri_wishlist_guest";
        let wishlist = productReadStorage(key);

        if (isSaved) {
            wishlist = wishlist.filter(item =>
                String(typeof item === "object" ? item.id ?? item.product_id : item) !== productId
            );
            productWishlistIds.delete(productId);
            productShowToast("Đã xóa khỏi danh sách yêu thích.");
        } else {
            wishlist.push({
                id: currentProduct.id,
                name: currentProduct.name,
                price: currentProduct.price,
                image: currentProduct.image
            });
            productWishlistIds.add(productId);
            productShowToast("Đã thêm vào danh sách yêu thích.");
        }

        try {
            productWriteStorage(key, wishlist);
        } catch {
            productShowToast("Không thể lưu danh sách yêu thích.");
            return;
        }
    }

    productDispatchUpdate("cheri:wishlist-updated");
    productUpdateWishlistButton();
}


function productRenderRelated(products) {
    const container = document.getElementById("product-related-grid");
    if (!container) return;

    const related = products
        .filter(product => String(product.id) !== String(currentProduct.id))
        .slice(0, 4);

    if (!related.length) {
        container.innerHTML = `
            <p class="product-loading">
                Chưa có sản phẩm liên quan.
                <a href="shop.html">Xem tất cả sản phẩm</a>
            </p>
        `;
        return;
    }

    container.innerHTML = related.map(product => `
        <article class="product-related-card">
            <a class="product-related-image"
               href="product.html?id=${encodeURIComponent(String(product.id))}">
                <img
                    src="${productEscapeHTML(product.image)}"
                    alt="${productEscapeHTML(product.name)}"
                    loading="lazy"
                >
            </a>

            <a class="product-related-name"
               href="product.html?id=${encodeURIComponent(String(product.id))}">
                ${productEscapeHTML(product.name)}
            </a>

            <div class="product-related-price">
                ${productFormatPrice(product.price)}
            </div>
        </article>
    `).join("");

    container.querySelectorAll("img").forEach(image => {
        image.addEventListener("error", () => {
            image.style.visibility = "hidden";
        }, { once: true });
    });
}

async function productInit() {
    const container = document.getElementById("product-detail-content");
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("id");

    if (!productId) {
        if (container) {
            container.innerHTML = `
                <div class="product-error">
                    Chưa có mã sản phẩm trong đường dẫn.<br>
                    Vui lòng chọn sản phẩm từ cửa hàng.
                    <p><a href="shop.html">Quay lại trang sản phẩm →</a></p>
                </div>
            `;
        }
        return;
    }

    const products = await productLoadAll();

    const found = products.find(product =>
        String(product.id) === String(productId)
    );

    if (!found) {
        if (container) {
            container.innerHTML = `
                <div class="product-error">
                    Không tìm thấy sản phẩm này.<br>
                    Sản phẩm có thể đã bị xóa hoặc mã sản phẩm không hợp lệ.
                    <p><a href="shop.html">Quay lại cửa hàng →</a></p>
                </div>
            `;
        }
        return;
    }

    currentProduct = found;
    await productLoadWishlist();
    productRenderDetail(currentProduct);
    productRenderRelated(products);

    document.title = `${currentProduct.name} | CHERI FASHION`;
}

document.addEventListener("DOMContentLoaded", productInit);

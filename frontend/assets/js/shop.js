
"use strict";

document.addEventListener("DOMContentLoaded", initShopPage);

const SHOP_PAGE_SIZE = 12;
const SHOP_FALLBACK_IMAGE = "../assets/images/products/no-image.webp";

const SHOP_SAMPLE_PRODUCTS = [
    {
        id: "cheri-001",
        name: "Áo kiểu tối giản",
        category: "Áo nữ",
        price: 320000,
        oldPrice: 0,
        image: "../assets/images/products/ao-kieu.webp",
        colors: ["Trắng", "Hồng pastel", "Đen"],
        sizes: ["S", "M", "L"],
        stock: 20,
        isNew: true
    },
    {
        id: "cheri-002",
        name: "Váy nữ thanh lịch",
        category: "Váy & Đầm",
        price: 490000,
        oldPrice: 550000,
        image: "../assets/images/products/vay-thanh-lich.webp",
        colors: ["Kem", "Đen", "Hồng pastel"],
        sizes: ["S", "M", "L"],
        stock: 15,
        isNew: true
    },
    {
        id: "cheri-003",
        name: "Quần ống rộng",
        category: "Quần",
        price: 420000,
        oldPrice: 0,
        image: "../assets/images/products/quan-ong-rong.webp",
        colors: ["Đen", "Be", "Nâu"],
        sizes: ["S", "M", "L", "XL"],
        stock: 18,
        isNew: false
    },
    {
        id: "cheri-004",
        name: "Chân váy hiện đại",
        category: "Váy & Đầm",
        price: 380000,
        oldPrice: 430000,
        image: "../assets/images/products/chan-vay.webp",
        colors: ["Đen", "Trắng"],
        sizes: ["S", "M", "L"],
        stock: 12,
        isNew: false
    },
    {
        id: "cheri-005",
        name: "Áo khoác thanh lịch",
        category: "Áo khoác",
        price: 690000,
        oldPrice: 0,
        image: "../assets/images/products/ao-khoac.webp",
        colors: ["Kem", "Nâu", "Đen"],
        sizes: ["S", "M", "L"],
        stock: 8,
        isNew: true
    },
    {
        id: "cheri-006",
        name: "Set đồ nữ hiện đại",
        category: "Set đồ nữ",
        price: 720000,
        oldPrice: 790000,
        image: "../assets/images/products/set-do-nu.webp",
        colors: ["Be", "Đen"],
        sizes: ["S", "M", "L"],
        stock: 10,
        isNew: true
    }
];

let shopProducts = [];
let shopFilteredProducts = [];
let shopCurrentPage = 1;
let shopSelectedProduct = null;
let shopSelectedAction = "cart";
let shopToastTimer = null;

function initShopPage() {
    const grid = document.getElementById("shop-product-grid");
    if (!grid) return;

    bindShopEvents();
    readShopQuery();
    loadShopProducts();
}

function bindShopEvents() {
    document.getElementById("shop-search-form")
        ?.addEventListener("submit", event => {
            event.preventDefault();
            shopCurrentPage = 1;
            applyShopFilters();
            updateShopUrl();
        });

    document.getElementById("shop-category")
        ?.addEventListener("change", () => {
            shopCurrentPage = 1;
            applyShopFilters();
            updateShopUrl();
        });

    document.getElementById("shop-price")
        ?.addEventListener("change", () => {
            shopCurrentPage = 1;
            applyShopFilters();
        });

    document.getElementById("shop-sort")
        ?.addEventListener("change", () => {
            shopCurrentPage = 1;
            applyShopFilters();
        });

    document.getElementById("shop-clear-filters")
        ?.addEventListener("click", clearShopFilters);

    document.getElementById("shop-empty-reset")
        ?.addEventListener("click", clearShopFilters);

    document.getElementById("shop-pagination")
        ?.addEventListener("click", event => {
            const button = event.target.closest("[data-page]");
            if (!button || button.disabled) return;

            shopCurrentPage = Number(button.dataset.page) || 1;
            renderShopProducts();
            document.querySelector(".shop-title-row")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });

    document.getElementById("shop-product-grid")
        ?.addEventListener("click", handleShopProductClick);

    document.getElementById("shop-variant-form")
        ?.addEventListener("submit", confirmShopVariant);

    document.querySelectorAll("[data-close-variant]")
        .forEach(element => {
            element.addEventListener("click", closeShopVariantModal);
        });

    document.getElementById("shop-quantity-minus")
        ?.addEventListener("click", () => changeShopQuantity(-1));

    document.getElementById("shop-quantity-plus")
        ?.addEventListener("click", () => changeShopQuantity(1));

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeShopVariantModal();
    });
}

function readShopQuery() {
    const params = new URLSearchParams(window.location.search);

    const keyword = params.get("q") || params.get("search") || "";
    const category = params.get("category") || "";
    const collection = params.get("collection") || "";

    document.getElementById("shop-search-input").value = keyword;

    const categorySelect = document.getElementById("shop-category");
    const categoryMap = {
        ao: "Áo nữ",
        "ao-khoac": "Áo khoác",
        quan: "Quần",
        vay: "Váy & Đầm",
        "set-do-nu": "Set đồ nữ"
    };

    if (categorySelect) {
        categorySelect.value = categoryMap[category] || category;
    }

    const title = document.getElementById("shop-page-title");

    if (title && collection === "new") {
        title.textContent = "Hàng mới về";
    } else if (title && collection === "sale") {
        title.textContent = "Sản phẩm ưu đãi";
    } else if (title && category) {
        title.textContent = categoryMap[category] || category;
    }
}

async function loadShopProducts() {
    const grid = document.getElementById("shop-product-grid");

    try {
        // API dự kiến: GET /api/products
        // Nếu backend hiện tại dùng đường dẫn khác, chỉnh URL tại đây.
        const response = await fetch("/api/products");

        if (!response.ok) {
            throw new Error(`API sản phẩm trả về ${response.status}`);
        }

        const result = await response.json();
        const rawProducts = Array.isArray(result)
            ? result
            : result.products || result.data || [];

        if (!rawProducts.length) {
            throw new Error("API chưa trả về sản phẩm");
        }

        shopProducts = rawProducts.map(normalizeShopProduct);
    } catch (error) {
        console.warn("Chưa lấy được sản phẩm từ API, dùng dữ liệu mẫu:", error);
        shopProducts = SHOP_SAMPLE_PRODUCTS.map(normalizeShopProduct);
    }

    applyShopFilters();
}


function normalizeShopProduct(product, index = 0) {
    const price = Number(product.price ?? product.salePrice ?? 0);
    const rawColors = product.colors ?? product.colorOptions;
    const rawSizes = product.sizes ?? product.sizeOptions;

    // Chuẩn hóa màu sắc thành mảng chuỗi.
    function normalizeOptions(raw, fallback) {
        let items = [];

        if (Array.isArray(raw)) {
            items = raw;
        } else if (typeof raw === "string" && raw.trim()) {
            items = raw.split(",").map(value => value.trim());
        }

        const normalized = items
            .map(item => {
                if (typeof item === "string" || typeof item === "number") {
                    return String(item).trim();
                }

                if (item && typeof item === "object") {
                    return String(
                        item.name ??
                        item.label ??
                        item.color_name ??
                        item.size_name ??
                        item.value ??
                        item.title ??
                        ""
                    ).trim();
                }

                return "";
            })
            .filter(Boolean);

        return normalized.length ? normalized : [fallback];
    }

    const colors = normalizeOptions(
        rawColors ?? (product.color ? [product.color] : []),
        "Mặc định"
    );

    const sizes = normalizeOptions(
        rawSizes ?? (product.size ? [product.size] : []),
        "Free size"
    );

    return {
        ...product,
        id: String(product.id ?? product.product_id ?? `product-${index}`),
        name: String(product.name ?? product.title ?? "Sản phẩm CHERI"),
        category: String(product.category ?? product.category_name ?? ""),
        price,
        oldPrice: Number(product.oldPrice ?? product.old_price ?? 0),
        image: product.image ?? product.image_url ?? product.thumbnail ?? "",
        colors,
        sizes,
        stock: Math.max(0, Number(product.stock ?? product.quantity ?? 99)),
        isNew: Boolean(product.isNew ?? product.is_new),
        isSale: Boolean(product.isSale ?? product.is_sale)
    };
}

function applyShopFilters() {
    const keyword = normalizeText(
        document.getElementById("shop-search-input")?.value || ""
    );

    const category = document.getElementById("shop-category")?.value || "";
    const priceRange = document.getElementById("shop-price")?.value || "";
    const sort = document.getElementById("shop-sort")?.value || "featured";
    const params = new URLSearchParams(window.location.search);
    const collection = params.get("collection") || "";

    shopFilteredProducts = shopProducts.filter(product => {
        const searchable = normalizeText(
            `${product.name} ${product.category} ${product.description || ""}`
        );

        if (keyword && !searchable.includes(keyword)) return false;
        if (category && product.category !== category) return false;

        if (priceRange) {
            const [min, max] = priceRange.split("-").map(Number);
            if (product.price < min || product.price > max) return false;
        }

        if (collection === "new" && !product.isNew) return false;
        if (
            collection === "sale" &&
            !(product.isSale || product.oldPrice > product.price)
        ) return false;

        return true;
    });

    if (sort === "price-asc") {
        shopFilteredProducts.sort((a, b) => a.price - b.price);
    } else if (sort === "price-desc") {
        shopFilteredProducts.sort((a, b) => b.price - a.price);
    } else if (sort === "name-asc") {
        shopFilteredProducts.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    } else if (sort === "newest") {
        shopFilteredProducts.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    }

    shopCurrentPage = Math.max(
        1,
        Math.min(
            shopCurrentPage,
            Math.ceil(shopFilteredProducts.length / SHOP_PAGE_SIZE) || 1
        )
    );

    renderShopProducts();
}

function normalizeText(value) {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .toLowerCase()
        .trim();
}

function formatShopPrice(price) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(price);
}

function escapeShopHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function renderShopProducts() {
    const grid = document.getElementById("shop-product-grid");
    const empty = document.getElementById("shop-empty");
    const count = document.getElementById("shop-result-count");
    const pagination = document.getElementById("shop-pagination");

    if (!grid) return;

    const total = shopFilteredProducts.length;
    const start = (shopCurrentPage - 1) * SHOP_PAGE_SIZE;
    const pageProducts = shopFilteredProducts.slice(start, start + SHOP_PAGE_SIZE);

    count.textContent = `${total} sản phẩm`;
    empty.hidden = total > 0;
    grid.hidden = total === 0;

    if (total === 0) {
        grid.innerHTML = "";
        pagination.innerHTML = "";
        return;
    }

    grid.innerHTML = pageProducts.map(renderShopCard).join("");
    renderShopPagination(pagination, total);

    updateShopWishlistButtons();
}

function renderShopCard(product) {
    const id = escapeShopHTML(product.id);
    const name = escapeShopHTML(product.name);
    const category = escapeShopHTML(product.category);
    const image = escapeShopHTML(product.image || SHOP_FALLBACK_IMAGE);
    const price = formatShopPrice(product.price);
    const oldPrice = product.oldPrice > product.price
        ? `<del>${formatShopPrice(product.oldPrice)}</del>`
        : "";

    const tag = product.isNew
        ? '<span class="shop-card-tag">NEW</span>'
        : product.isSale || product.oldPrice > product.price
            ? '<span class="shop-card-tag">SALE</span>'
            : "";

    const disabled = product.stock <= 0 ? "disabled" : "";
    const stockText = product.stock <= 0
        ? "Tạm hết hàng"
        : `Còn ${product.stock} sản phẩm`;

    return `
        <article class="shop-card" data-product-id="${id}">
            <a class="shop-card-image" href="product.html?id=${encodeURIComponent(product.id)}"
               aria-label="Xem ${name}">
                <img src="${image}" alt="${name}" loading="lazy"
                     onerror="this.style.display='none'; this.nextElementSibling.hidden=false">
                <span class="shop-image-fallback" hidden>CHERI FASHION</span>
                ${tag}
            </a>

            <button
                type="button"
                class="shop-wishlist-button"
                data-shop-action="wishlist"
                data-product-id="${id}"
                aria-label="Thêm ${name} vào yêu thích"
                aria-pressed="false"
            >♡</button>

            <div class="shop-card-info">
                <p class="shop-card-category">${category || "CHERI COLLECTION"}</p>
                <a class="shop-card-name" href="product.html?id=${encodeURIComponent(product.id)}">
                    ${name}
                </a>

                <div class="shop-card-price">
                    <strong>${price}</strong>
                    ${oldPrice}
                </div>

                <p class="shop-card-stock">${stockText}</p>

                <div class="shop-card-actions">
                    <button type="button" class="shop-add-cart"
                        data-shop-action="cart" data-product-id="${id}" ${disabled}>
                        THÊM VÀO GIỎ
                    </button>
                    <button type="button" class="shop-buy-now"
                        data-shop-action="buy" data-product-id="${id}" ${disabled}>
                        MUA NGAY
                    </button>
                </div>
            </div>
        </article>
    `;
}

function renderShopPagination(container, total) {
    const pages = Math.ceil(total / SHOP_PAGE_SIZE);

    if (pages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = `
        <button class="shop-page-button"
            data-page="${shopCurrentPage - 1}"
            ${shopCurrentPage === 1 ? "disabled" : ""}
            aria-label="Trang trước">‹</button>
    `;

    for (let page = 1; page <= pages; page++) {
        html += `
            <button class="shop-page-button ${page === shopCurrentPage ? "is-current" : ""}"
                data-page="${page}"
                ${page === shopCurrentPage ? 'aria-current="page"' : ""}>
                ${page}
            </button>
        `;
    }

    html += `
        <button class="shop-page-button"
            data-page="${shopCurrentPage + 1}"
            ${shopCurrentPage === pages ? "disabled" : ""}
            aria-label="Trang tiếp theo">›</button>
    `;

    container.innerHTML = html;
}

function updateShopUrl() {
    const params = new URLSearchParams(window.location.search);
    const keyword = document.getElementById("shop-search-input").value.trim();
    const category = document.getElementById("shop-category").value;

    if (keyword) {
        params.set("q", keyword);
        params.delete("search");
    } else {
        params.delete("q");
        params.delete("search");
    }

    if (category) {
        const categoryMap = {
            "Áo nữ": "ao",
            "Áo khoác": "ao-khoac",
            "Quần": "quan",
            "Váy & Đầm": "vay",
            "Set đồ nữ": "set-do-nu"
        };
        params.set("category", categoryMap[category] || category);
    } else {
        params.delete("category");
    }

    const query = params.toString();
    history.replaceState({}, "", query ? `${location.pathname}?${query}` : location.pathname);
}

function clearShopFilters() {
    document.getElementById("shop-search-input").value = "";
    document.getElementById("shop-category").value = "";
    document.getElementById("shop-price").value = "";
    document.getElementById("shop-sort").value = "featured";

    const params = new URLSearchParams(window.location.search);
    params.delete("q");
    params.delete("search");
    params.delete("category");
    params.delete("collection");

    const query = params.toString();
    history.replaceState({}, "", query ? `${location.pathname}?${query}` : location.pathname);

    const title = document.getElementById("shop-page-title");
    if (title) title.textContent = "Tất cả sản phẩm";

    shopCurrentPage = 1;
    applyShopFilters();
}

function handleShopProductClick(event) {
    const button = event.target.closest("[data-shop-action]");
    if (!button) return;

    const product = shopProducts.find(
        item => item.id === button.dataset.productId
    );

    if (!product) return;

    const action = button.dataset.shopAction;

    if (action === "wishlist") {
        toggleShopWishlist(product);
        return;
    }

    if (product.stock <= 0) {
        showShopToast("Sản phẩm hiện đã hết hàng.");
        return;
    }

    openShopVariantModal(product, action);
}

function openShopVariantModal(product, action) {
    shopSelectedProduct = product;
    shopSelectedAction = action;

    document.getElementById("shop-modal-name").textContent = product.name;
    document.getElementById("shop-modal-price").textContent = formatShopPrice(product.price);

    const image = document.getElementById("shop-modal-image");
    image.src = product.image || SHOP_FALLBACK_IMAGE;
    image.alt = product.name;

    const sizeSelect = document.getElementById("shop-modal-size");
    const colorSelect = document.getElementById("shop-modal-color");

    sizeSelect.innerHTML = '<option value="">Chọn kích thước</option>';
    product.sizes.forEach(size => {
        sizeSelect.add(new Option(size, size));
    });

    colorSelect.innerHTML = '<option value="">Chọn màu sắc</option>';

    product.colors.forEach(color => {
        const colorName = String(color).trim();

        if (colorName) {
            colorSelect.add(new Option(colorName, colorName));
        }
    });

    document.getElementById("shop-modal-quantity").value = "1";

    const error = document.getElementById("shop-variant-error");
    error.hidden = true;
    error.textContent = "";

    document.getElementById("shop-variant-confirm").textContent =
        action === "buy" ? "MUA NGAY" : "THÊM VÀO GIỎ";

    document.getElementById("shop-variant-modal").hidden = false;
    document.body.style.overflow = "hidden";
    sizeSelect.focus();
}

function closeShopVariantModal() {
    const modal = document.getElementById("shop-variant-modal");
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    document.body.style.overflow = "";
    shopSelectedProduct = null;
}

function changeShopQuantity(amount) {
    const input = document.getElementById("shop-modal-quantity");
    const current = Number(input.value) || 1;
    const max = shopSelectedProduct
        ? Math.min(99, shopSelectedProduct.stock)
        : 99;

    input.value = String(Math.max(1, Math.min(max, current + amount)));
}

function confirmShopVariant(event) {
    event.preventDefault();

    if (!shopSelectedProduct) return;

    const size = document.getElementById("shop-modal-size").value;
    const color = document.getElementById("shop-modal-color").value;
    const quantityInput = document.getElementById("shop-modal-quantity");
    const quantity = Number(quantityInput.value);
    const error = document.getElementById("shop-variant-error");
    const product = shopSelectedProduct;

    if (!size || !color) {
        error.textContent = "Vui lòng chọn kích thước và màu sắc.";
        error.hidden = false;
        return;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.stock) {
        error.textContent = `Số lượng phải từ 1 đến ${product.stock}.`;
        error.hidden = false;
        return;
    }

    const selectedItem = {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        image: product.image,
        size,
        color,
        quantity
    };

    if (shopSelectedAction === "buy") {
        // Lưu riêng lựa chọn mua ngay, không ghi đè giỏ hàng.
        localStorage.setItem("cheri_buy_now", JSON.stringify(selectedItem));
        closeShopVariantModal();
        window.location.href = "checkout.html?mode=buy-now";
        return;
    }

    const cart = readShopStorage("cheri_cart");

    const existing = cart.find(item =>
        String(item.id) === selectedItem.id &&
        item.size === selectedItem.size &&
        item.color === selectedItem.color
    );

    if (existing) {
        const existingQuantity = Number(existing.quantity ?? existing.qty) || 0;
        if (existingQuantity + quantity > product.stock) {
            error.textContent = `Bạn chỉ có thể chọn tối đa ${product.stock} sản phẩm.`;
            error.hidden = false;
            return;
        }

        existing.quantity = existingQuantity + quantity;
        delete existing.qty;
    } else {
        cart.push(selectedItem);
    }

    try {
        localStorage.setItem("cheri_cart", JSON.stringify(cart));
    } catch (storageError) {
        error.textContent = "Không thể lưu giỏ hàng. Hãy kiểm tra dung lượng trình duyệt.";
        error.hidden = false;
        return;
    }

    closeShopVariantModal();
    document.dispatchEvent(new CustomEvent("cheri:cart-updated"));
    showShopToast("Đã thêm sản phẩm vào giỏ hàng.");
}

function readShopStorage(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function toggleShopWishlist(product) {
    const wishlist = readShopStorage("cheri_wishlist");
    const index = wishlist.findIndex(item =>
        String(typeof item === "object" ? item.id : item) === product.id
    );

    if (index >= 0) {
        wishlist.splice(index, 1);
        showShopToast("Đã bỏ sản phẩm khỏi yêu thích.");
    } else {
        wishlist.push({
            id: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
            image: product.image
        });
        showShopToast("Đã thêm vào danh sách yêu thích.");
    }

    localStorage.setItem("cheri_wishlist", JSON.stringify(wishlist));
    document.dispatchEvent(new CustomEvent("cheri:wishlist-updated"));
    updateShopWishlistButtons();
}

function updateShopWishlistButtons() {
    const wishlist = readShopStorage("cheri_wishlist");
    const ids = new Set(wishlist.map(item =>
        String(typeof item === "object" ? item.id : item)
    ));

    document.querySelectorAll(".shop-wishlist-button").forEach(button => {
        const active = ids.has(button.dataset.productId);
        button.classList.toggle("is-active", active);
        button.textContent = active ? "♥" : "♡";
        button.setAttribute("aria-pressed", String(active));
    });
}

function showShopToast(message) {
    const toast = document.getElementById("shop-toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");

    clearTimeout(shopToastTimer);
    shopToastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}

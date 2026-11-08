"use strict";

/* =========================================================
   CHERI FASHION - SHOP PAGE
   Tìm kiếm, lọc, phân trang, giỏ hàng, mua ngay, yêu thích
   ========================================================= */

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
let shopWishlistIds = new Set();


/* =========================================================
   1. KHỞI TẠO TRANG
   ========================================================= */

function initShopPage() {
    const grid = document.getElementById("shop-product-grid");

    if (!grid) return;

    bindShopEvents();
    readShopQuery();
    loadShopProducts();
}


/* =========================================================
   2. ĐỌC VÀ GHI LOCAL STORAGE AN TOÀN
   ========================================================= */

function readShopStorage(key) {
    try {
        const value = localStorage.getItem(key);

        if (!value) return [];

        const parsed = JSON.parse(value);

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Không đọc được dữ liệu:", error);
        return [];
    }
}

function writeShopStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error("Không thể lưu dữ liệu:", error);
        return false;
    }
}


/* =========================================================
   3. GẮN SỰ KIỆN
   ========================================================= */

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
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
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
        if (event.key === "Escape") {
            closeShopVariantModal();
        }
    });
}


/* =========================================================
   4. ĐỌC THAM SỐ URL
   ========================================================= */

function readShopQuery() {
    const params = new URLSearchParams(window.location.search);

    const keyword = params.get("q") || params.get("search") || "";
    const category = params.get("category") || "";
    const collection = params.get("collection") || "";

    const searchInput = document.getElementById("shop-search-input");

    if (searchInput) {
        searchInput.value = keyword;
    }

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

    if (!title) return;

    if (collection === "new") {
        title.textContent = "Hàng mới về";
    } else if (collection === "sale") {
        title.textContent = "Sản phẩm ưu đãi";
    } else if (category) {
        title.textContent = categoryMap[category] || category;
    }
}


/* =========================================================
   5. TẢI SẢN PHẨM TỪ API
   ========================================================= */

async function loadShopProducts() {
    try {
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
        console.warn(
            "Không lấy được sản phẩm từ API, sử dụng dữ liệu mẫu:",
            error
        );

        shopProducts = SHOP_SAMPLE_PRODUCTS.map(normalizeShopProduct);
    }

    await loadShopWishlist();
    applyShopFilters();
}


async function loadShopWishlist() {
    shopWishlistIds = new Set();

    if (window.CheriCommerceAPI?.isLoggedIn()) {
        try {
            const result = await window.CheriCommerceAPI.getWishlist();
            const items = Array.isArray(result.items) ? result.items : [];
            shopWishlistIds = new Set(items.map(item => String(item.product_id ?? item.id)));
            return;
        } catch (error) {
            console.warn("Không thể tải danh sách yêu thích:", error);
            showShopToast("Chưa thể tải danh sách yêu thích từ tài khoản.");
        }
    }

    const key = typeof cheriStorageKey === "function" ? cheriStorageKey("cheri_wishlist") : "cheri_wishlist_guest";
    shopWishlistIds = new Set(readShopStorage(key).map(item => String(
        typeof item === "object" ? item.id ?? item.product_id : item
    )));
}


/* =========================================================
   6. CHUẨN HÓA DỮ LIỆU SẢN PHẨM
   ========================================================= */

function normalizeShopProduct(product, index = 0) {
    const price = Number(product.price ?? product.salePrice ?? 0);

    function normalizeOptions(raw, fallback) {
        let items = [];

        if (Array.isArray(raw)) {
            items = raw;
        } else if (typeof raw === "string" && raw.trim()) {
            items = raw.split(",").map(value => value.trim());
        }

        const normalized = items.map(item => {
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
        }).filter(Boolean);

        return normalized.length ? normalized : fallback;
    }

    const rawColors =
        product.colors ??
        product.colorOptions ??
        product.color_options;

    const rawSizes =
        product.sizes ??
        product.sizeOptions ??
        product.size_options;

    const colors = normalizeOptions(
        rawColors ?? (product.color ? [product.color] : []),
        ["Trắng", "Đen"]
    );

    const sizes = normalizeOptions(
        rawSizes ?? (product.size ? [product.size] : []),
        ["S", "M", "L", "XL", "Free size"]
    );

    const stock = Number(product.stock ?? product.quantity ?? 99);

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
        stock: Math.max(0, Number.isFinite(stock) ? stock : 99),
        isNew: Boolean(product.isNew ?? product.is_new),
        isSale: Boolean(product.isSale ?? product.is_sale)
    };
}


/* =========================================================
   7. TÌM KIẾM, LỌC VÀ SẮP XẾP
   ========================================================= */

function applyShopFilters() {
    const keyword = normalizeText(
        document.getElementById("shop-search-input")?.value || ""
    );

    const category =
        document.getElementById("shop-category")?.value || "";

    const priceRange =
        document.getElementById("shop-price")?.value || "";

    const sort =
        document.getElementById("shop-sort")?.value || "featured";

    const params = new URLSearchParams(window.location.search);
    const collection = params.get("collection") || "";

    shopFilteredProducts = shopProducts.filter(product => {
        const searchable = normalizeText(
            `${product.name} ${product.category} ${product.description || ""}`
        );

        if (keyword && !searchable.includes(keyword)) {
            return false;
        }

        if (category && product.category !== category) {
            return false;
        }

        if (priceRange) {
            const [min, max] = priceRange.split("-").map(Number);

            if (
                Number.isFinite(min) &&
                Number.isFinite(max) &&
                (product.price < min || product.price > max)
            ) {
                return false;
            }
        }

        if (collection === "new" && !product.isNew) {
            return false;
        }

        if (
            collection === "sale" &&
            !(product.isSale || product.oldPrice > product.price)
        ) {
            return false;
        }

        return true;
    });

    if (sort === "price-asc") {
        shopFilteredProducts.sort((a, b) => a.price - b.price);
    } else if (sort === "price-desc") {
        shopFilteredProducts.sort((a, b) => b.price - a.price);
    } else if (sort === "name-asc") {
        shopFilteredProducts.sort(
            (a, b) => a.name.localeCompare(b.name, "vi")
        );
    } else if (sort === "newest") {
        shopFilteredProducts.sort(
            (a, b) => Number(b.isNew) - Number(a.isNew)
        );
    }

    const totalPages = Math.ceil(
        shopFilteredProducts.length / SHOP_PAGE_SIZE
    ) || 1;

    shopCurrentPage = Math.max(
        1,
        Math.min(shopCurrentPage, totalPages)
    );

    renderShopProducts();
}


/* =========================================================
   8. HÀM TIỆN ÍCH
   ========================================================= */

function normalizeText(value) {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .trim();
}

function formatShopPrice(price) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(Number(price) || 0);
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


/* =========================================================
   9. HIỂN THỊ DANH SÁCH SẢN PHẨM
   ========================================================= */

function renderShopProducts() {
    const grid = document.getElementById("shop-product-grid");
    const empty = document.getElementById("shop-empty");
    const count = document.getElementById("shop-result-count");
    const pagination = document.getElementById("shop-pagination");

    if (!grid) return;

    const total = shopFilteredProducts.length;
    const start = (shopCurrentPage - 1) * SHOP_PAGE_SIZE;
    const pageProducts = shopFilteredProducts.slice(
        start,
        start + SHOP_PAGE_SIZE
    );

    if (count) {
        count.textContent = `${total} sản phẩm`;
    }

    if (empty) {
        empty.hidden = total > 0;
    }

    grid.hidden = total === 0;

    if (total === 0) {
        grid.innerHTML = "";

        if (pagination) {
            pagination.innerHTML = "";
        }

        return;
    }

    grid.innerHTML = pageProducts.map(renderShopCard).join("");

    if (pagination) {
        renderShopPagination(pagination, total);
    }

    updateShopWishlistButtons();
}


/* =========================================================
   10. TẠO THẺ SẢN PHẨM
   ========================================================= */

function renderShopCard(product) {
    const id = escapeShopHTML(product.id);
    const name = escapeShopHTML(product.name);
    const category = escapeShopHTML(product.category);
    const image = escapeShopHTML(
        product.image || SHOP_FALLBACK_IMAGE
    );

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
            <a class="shop-card-image"
               href="product.html?id=${encodeURIComponent(product.id)}"
               aria-label="Xem ${name}">
                <img
                    src="${image}"
                    alt="${name}"
                    loading="lazy"
                    onerror="this.style.display='none'; this.nextElementSibling.hidden=false"
                >
                <span class="shop-image-fallback" hidden>
                    CHERI FASHION
                </span>
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
                <p class="shop-card-category">
                    ${category || "CHERI COLLECTION"}
                </p>

                <a
                    class="shop-card-name"
                    href="product.html?id=${encodeURIComponent(product.id)}"
                >${name}</a>

                <div class="shop-card-price">
                    <strong>${price}</strong>
                    ${oldPrice}
                </div>

                <p class="shop-card-stock">${stockText}</p>

                <div class="shop-card-actions">
                    <button
                        type="button"
                        class="shop-add-cart"
                        data-shop-action="cart"
                        data-product-id="${id}"
                        ${disabled}
                    >THÊM VÀO GIỎ</button>

                    <button
                        type="button"
                        class="shop-buy-now"
                        data-shop-action="buy"
                        data-product-id="${id}"
                        ${disabled}
                    >MUA NGAY</button>
                </div>
            </div>
        </article>
    `;
}


/* =========================================================
   11. PHÂN TRANG
   ========================================================= */

function renderShopPagination(container, total) {
    const pages = Math.ceil(total / SHOP_PAGE_SIZE);

    if (pages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = `
        <button
            class="shop-page-button"
            data-page="${shopCurrentPage - 1}"
            ${shopCurrentPage === 1 ? "disabled" : ""}
            aria-label="Trang trước"
        >‹</button>
    `;

    for (let page = 1; page <= pages; page++) {
        html += `
            <button
                class="shop-page-button ${
                    page === shopCurrentPage ? "is-current" : ""
                }"
                data-page="${page}"
                ${page === shopCurrentPage ? 'aria-current="page"' : ""}
            >${page}</button>
        `;
    }

    html += `
        <button
            class="shop-page-button"
            data-page="${shopCurrentPage + 1}"
            ${shopCurrentPage === pages ? "disabled" : ""}
            aria-label="Trang tiếp theo"
        >›</button>
    `;

    container.innerHTML = html;
}


/* =========================================================
   12. CẬP NHẬT URL TÌM KIẾM VÀ DANH MỤC
   ========================================================= */

function updateShopUrl() {
    const params = new URLSearchParams(window.location.search);

    const keyword =
        document.getElementById("shop-search-input")?.value.trim() || "";

    const category =
        document.getElementById("shop-category")?.value || "";

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

    history.replaceState(
        {},
        "",
        query ? `${location.pathname}?${query}` : location.pathname
    );
}


/* =========================================================
   13. XÓA BỘ LỌC
   ========================================================= */

function clearShopFilters() {
    const searchInput = document.getElementById("shop-search-input");
    const category = document.getElementById("shop-category");
    const price = document.getElementById("shop-price");
    const sort = document.getElementById("shop-sort");

    if (searchInput) searchInput.value = "";
    if (category) category.value = "";
    if (price) price.value = "";
    if (sort) sort.value = "featured";

    const params = new URLSearchParams(window.location.search);

    params.delete("q");
    params.delete("search");
    params.delete("category");
    params.delete("collection");

    const query = params.toString();

    history.replaceState(
        {},
        "",
        query ? `${location.pathname}?${query}` : location.pathname
    );

    const title = document.getElementById("shop-page-title");

    if (title) {
        title.textContent = "Tất cả sản phẩm";
    }

    shopCurrentPage = 1;
    applyShopFilters();
}


/* =========================================================
   14. XỬ LÝ NHẤN NÚT TRÊN SẢN PHẨM
   ========================================================= */

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


/* =========================================================
   15. MỞ CỬA SỔ CHỌN KÍCH THƯỚC VÀ MÀU SẮC
   ========================================================= */

function openShopVariantModal(product, action) {
    shopSelectedProduct = product;
    shopSelectedAction = action;

    const name = document.getElementById("shop-modal-name");
    const price = document.getElementById("shop-modal-price");
    const image = document.getElementById("shop-modal-image");
    const sizeSelect = document.getElementById("shop-modal-size");
    const colorSelect = document.getElementById("shop-modal-color");
    const quantityInput = document.getElementById("shop-modal-quantity");
    const error = document.getElementById("shop-variant-error");
    const confirmButton = document.getElementById("shop-variant-confirm");
    const modal = document.getElementById("shop-variant-modal");

    if (
        !name ||
        !price ||
        !image ||
        !sizeSelect ||
        !colorSelect ||
        !quantityInput ||
        !error ||
        !confirmButton ||
        !modal
    ) {
        console.error("HTML cửa sổ chọn biến thể chưa đầy đủ.");
        showShopToast("Không thể mở cửa sổ chọn sản phẩm.");
        return;
    }

    name.textContent = product.name;
    price.textContent = formatShopPrice(product.price);

    image.src = product.image || SHOP_FALLBACK_IMAGE;
    image.alt = product.name;

    // Tạo lại danh sách kích thước.
    sizeSelect.replaceChildren(
        new Option("Chọn kích thước", "")
    );

    const sizes = Array.isArray(product.sizes) && product.sizes.length
        ? product.sizes
        : ["S", "M", "L", "XL", "Free size"];

    sizes.forEach(size => {
        const value = String(size).trim();

        if (value) {
            sizeSelect.add(new Option(value, value));
        }
    });

    // Tạo lại danh sách màu sắc.
    colorSelect.replaceChildren(
        new Option("Chọn màu sắc", "")
    );

    const colors = Array.isArray(product.colors) && product.colors.length
        ? product.colors
        : ["Trắng", "Đen"];

    colors.forEach(color => {
        const value = String(color).trim();

        if (value) {
            colorSelect.add(new Option(value, value));
        }
    });

    quantityInput.value = "1";
    quantityInput.min = "1";
    quantityInput.max = String(Math.max(1, Math.min(99, product.stock)));

    error.hidden = true;
    error.textContent = "";

    confirmButton.textContent =
        action === "buy" ? "MUA NGAY" : "THÊM VÀO GIỎ";

    modal.hidden = false;
    document.body.style.overflow = "hidden";

    sizeSelect.focus();
}


/* =========================================================
   16. ĐÓNG CỬA SỔ CHỌN BIẾN THỂ
   ========================================================= */

function closeShopVariantModal() {
    const modal = document.getElementById("shop-variant-modal");

    if (!modal || modal.hidden) return;

    modal.hidden = true;
    document.body.style.overflow = "";

    shopSelectedProduct = null;
}


/* =========================================================
   17. THAY ĐỔI SỐ LƯỢNG
   ========================================================= */

function changeShopQuantity(amount) {
    const input = document.getElementById("shop-modal-quantity");

    if (!input) return;

    const current = Number(input.value) || 1;

    const max = shopSelectedProduct
        ? Math.min(99, shopSelectedProduct.stock)
        : 99;

    input.value = String(
        Math.max(1, Math.min(max, current + amount))
    );
}


/* =========================================================
   18. XÁC NHẬN THÊM GIỎ HÀNG HOẶC MUA NGAY
   ========================================================= */

async function confirmShopVariant(event) {
    event.preventDefault();

    if (!shopSelectedProduct) return;

    const size = document.getElementById("shop-modal-size").value;
    const color = document.getElementById("shop-modal-color").value;
    const quantityInput = document.getElementById("shop-modal-quantity");
    const quantity = Number(quantityInput.value);
    const error = document.getElementById("shop-variant-error");
    const product = shopSelectedProduct;

    error.hidden = true;
    error.textContent = "";

    if (!size || !color) {
        error.textContent = "Vui lòng chọn kích thước và màu sắc.";
        error.hidden = false;
        return;
    }

    if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > product.stock
    ) {
        error.textContent =
            `Số lượng phải từ 1 đến ${product.stock}.`;

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

    // Giữ nguyên luồng mua ngay.
    if (shopSelectedAction === "buy") {
        if (!writeShopStorage("cheri_buy_now", selectedItem)) {
            error.textContent = "Không thể lưu sản phẩm để mua ngay.";
            error.hidden = false;
            return;
        }

        closeShopVariantModal();

        window.location.href = "checkout.html?mode=buy-now";
        return;
    }

    // Nếu đã đăng nhập, đồng bộ giỏ hàng với backend.
    if (window.CheriCommerceAPI?.isLoggedIn()) {
        const numericProductId = Number(product.id);

        if (!Number.isInteger(numericProductId) || numericProductId <= 0) {
            error.textContent =
                "Mã sản phẩm không hợp lệ. Vui lòng tải lại trang.";

            error.hidden = false;
            return;
        }

        try {
            await window.CheriCommerceAPI.addToCart(selectedItem);
        } catch (apiError) {
            error.textContent =
                apiError.message ||
                "Chưa thể lưu giỏ hàng vào hệ thống. Vui lòng thử lại.";

            error.hidden = false;
            return;
        }
    }

    // Duy trì dữ liệu localStorage để tương thích với giỏ hàng
    // và thanh toán hiện tại của website.
    const cart = readShopStorage("cheri_cart");

    const existing = cart.find(item =>
        String(item.id) === String(selectedItem.id) &&
        item.size === selectedItem.size &&
        item.color === selectedItem.color
    );

    if (existing) {
        const existingQuantity =
            Number(existing.quantity ?? existing.qty) || 0;

        if (existingQuantity + quantity > product.stock) {
            error.textContent =
                `Bạn chỉ có thể chọn tối đa ${product.stock} sản phẩm.`;

            error.hidden = false;
            return;
        }

        existing.quantity = existingQuantity + quantity;
        delete existing.qty;
    } else {
        cart.push(selectedItem);
    }

    if (!writeShopStorage("cheri_cart", cart)) {
        error.textContent =
            "Không thể cập nhật giỏ hàng trên trình duyệt.";

        error.hidden = false;
        return;
    }

    closeShopVariantModal();

    document.dispatchEvent(
        new CustomEvent("cheri:cart-updated")
    );

    showShopToast("Đã thêm sản phẩm vào giỏ hàng.");
}


/* =========================================================
   19. THÊM HOẶC XÓA SẢN PHẨM YÊU THÍCH
   ========================================================= */

async function toggleShopWishlist(product) {
    const productId = String(product.id);
    const alreadySaved = shopWishlistIds.has(productId);

    if (window.CheriCommerceAPI?.isLoggedIn()) {
        const numericId = Number(product.id);
        if (!Number.isInteger(numericId) || numericId <= 0) {
            showShopToast("Mã sản phẩm không hợp lệ.");
            return;
        }

        try {
            if (alreadySaved) {
                await window.CheriCommerceAPI.removeFromWishlist(numericId);
                shopWishlistIds.delete(productId);
                showShopToast("Đã xóa khỏi danh sách yêu thích.");
            } else {
                await window.CheriCommerceAPI.addToWishlist(numericId);
                shopWishlistIds.add(productId);
                showShopToast("Đã thêm vào danh sách yêu thích.");
            }
        } catch (error) {
            showShopToast(error.message || "Chưa thể cập nhật danh sách yêu thích.");
            return;
        }
    } else {
        const key = typeof cheriStorageKey === "function" ? cheriStorageKey("cheri_wishlist") : "cheri_wishlist_guest";
        let wishlist = readShopStorage(key);

        if (alreadySaved) {
            wishlist = wishlist.filter(item =>
                String(typeof item === "object" ? item.id ?? item.product_id : item) !== productId
            );
            shopWishlistIds.delete(productId);
            showShopToast("Đã xóa khỏi danh sách yêu thích.");
        } else {
            wishlist.push({
                id: product.id,
                name: product.name,
                category: product.category,
                price: product.price,
                image: product.image
            });
            shopWishlistIds.add(productId);
            showShopToast("Đã thêm vào danh sách yêu thích.");
        }

        if (!writeShopStorage(key, wishlist)) {
            showShopToast("Không thể lưu danh sách yêu thích.");
            return;
        }
    }

    document.dispatchEvent(new CustomEvent("cheri:wishlist-updated"));
    updateShopWishlistButtons();
}


20. CẬP NHẬT TRẠNG THÁI NÚT YÊU THÍCH
   ========================================================= */

function updateShopWishlistButtons() {
    document.querySelectorAll(".shop-wishlist-button").forEach(button => {
        const active = shopWishlistIds.has(button.dataset.productId);
        button.classList.toggle("is-active", active);
        button.textContent = active ? "♥" : "♡";
        button.setAttribute("aria-pressed", String(active));
    });
}


/* =========================================================
   21. THÔNG BÁO CHO NGƯỜI DÙNG
   ========================================================= */

function showShopToast(message) {
    const toast = document.getElementById("shop-toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    clearTimeout(shopToastTimer);

    shopToastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}
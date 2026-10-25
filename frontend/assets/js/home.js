
/* ========================================
   CHERI FASHION - HOMEPAGE
======================================== */

const HOME_SAMPLE_PRODUCTS = [
    {
        id: 1,
        name: "Áo kiểu tối giản",
        category: "Áo nữ",
        price: 320000,
        image: "../assets/images/products/ao-kieu.webp",
        collection: "featured"
    },
    {
        id: 2,
        name: "Váy nữ thanh lịch",
        category: "Váy",
        price: 490000,
        image: "../assets/images/products/vay-thanh-lich.webp",
        collection: "new"
    },
    {
        id: 3,
        name: "Quần ống rộng hiện đại",
        category: "Quần",
        price: 420000,
        image: "../assets/images/products/quan-ong-rong.webp",
        collection: "featured"
    },
    {
        id: 4,
        name: "Chân váy nữ",
        category: "Váy",
        price: 380000,
        image: "../assets/images/products/chan-vay.webp",
        collection: "new"
    },
    {
        id: 5,
        name: "Áo khoác thanh lịch",
        category: "Áo khoác",
        price: 550000,
        image: "../assets/images/products/ao-khoac.webp",
        collection: "new"
    },
    {
        id: 6,
        name: "Set đồ nữ hiện đại",
        category: "Set đồ nữ",
        price: 620000,
        image: "../assets/images/products/set-do-nu.webp",
        collection: "featured"
    }
];

function homeFormatPrice(price) {
    return new Intl.NumberFormat("vi-VN").format(price) + "đ";
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

function homeNormalizeProduct(product, index) {
    return {
        id: product.id ?? product.product_id ?? index + 1,
        name: product.name ?? product.product_name ?? "Sản phẩm Cheri",
        category: product.category_name ?? product.category ?? "Thời trang nữ",
        price: Number(product.price ?? product.sale_price ?? 0),
        oldPrice: Number(product.old_price ?? product.original_price ?? 0),
        image: product.image ?? product.image_url
            ?? "../assets/images/products/ao-kieu.webp",
        collection: product.collection ?? ""
    };
}

async function homeLoadProducts() {
    try {
        const response = await fetch("/api/products");

        if (!response.ok) {
            throw new Error("Không thể tải sản phẩm từ API.");
        }

        const result = await response.json();
        const products = Array.isArray(result)
            ? result
            : result.products ?? result.data ?? [];

        if (!Array.isArray(products) || products.length === 0) {
            return HOME_SAMPLE_PRODUCTS.map(homeNormalizeProduct);
        }

        return products.map(homeNormalizeProduct);
    } catch (error) {
        console.warn(
            "Trang chủ đang sử dụng dữ liệu sản phẩm mẫu:",
            error.message
        );

        return HOME_SAMPLE_PRODUCTS.map(homeNormalizeProduct);
    }
}

function homeRenderProduct(product) {
    const id = encodeURIComponent(String(product.id));
    const name = homeEscapeHTML(product.name);
    const category = homeEscapeHTML(product.category);
    const image = homeEscapeHTML(product.image);

    const oldPrice = product.oldPrice > product.price
        ? `<span class="home-product-old-price">
               ${homeFormatPrice(product.oldPrice)}
           </span>`
        : "";

    return `
        <article class="home-product-card">
            <a class="home-product-image"
               href="product.html?id=${id}"
               aria-label="Xem ${name}">
                <img
                    src="${image}"
                    alt="${name}"
                    loading="lazy"
                    onerror="this.onerror=null;this.style.opacity='0';"
                >
            </a>

            <div class="home-product-info">
                <span class="home-product-category">${category}</span>

                <a class="home-product-name"
                   href="product.html?id=${id}">
                    ${name}
                </a>

                <div class="home-product-price">
                    ${homeFormatPrice(product.price)}
                    ${oldPrice}
                </div>
            </div>
        </article>
    `;
}

async function homeInitProducts() {
    const featuredContainer =
        document.getElementById("home-featured-products");

    const newContainer =
        document.getElementById("home-new-products");

    if (!featuredContainer || !newContainer) return;

    const products = await homeLoadProducts();

    const featured = products.filter(product =>
        product.collection === "featured"
    );

    const newArrivals = products.filter(product =>
        product.collection === "new"
    );

    const featuredProducts = (featured.length ? featured : products)
        .slice(0, 4);

    const newProducts = (newArrivals.length
        ? newArrivals
        : [...products].reverse()
    ).slice(0, 4);

    featuredContainer.innerHTML = featuredProducts
        .map(homeRenderProduct)
        .join("");

    newContainer.innerHTML = newProducts
        .map(homeRenderProduct)
        .join("");
}

/* Popup chỉ hiển thị một lần trong mỗi phiên trình duyệt */


function homeInitPopup() {
    const popup = document.getElementById("home-promo-popup");
    const closeButton = document.getElementById("home-popup-close");

    if (!popup || !closeButton) return;

    // Kiểm tra popup đã được hiển thị trong phiên này chưa
    try {
        if (sessionStorage.getItem("cheri_promo_shown") === "1") {
            return;
        }
    } catch (error) {
        console.warn("Không thể kiểm tra trạng thái popup.", error);
    }

    // Đánh dấu ngay khi chuẩn bị hiển thị để tránh hiện lại
    try {
        sessionStorage.setItem("cheri_promo_shown", "1");
    } catch (error) {
        console.warn("Không thể lưu trạng thái popup.", error);
    }

    // Hiển thị sau 1,2 giây
    window.setTimeout(() => {
        popup.classList.add("is-visible");
        popup.setAttribute("aria-hidden", "false");
    }, 1200);

    function closePopup() {
        popup.classList.remove("is-visible");
        popup.setAttribute("aria-hidden", "true");
    }

    closeButton.addEventListener("click", closePopup);

    // Nhấn ra ngoài popup để đóng
    popup.addEventListener("click", event => {
        if (event.target === popup) {
            closePopup();
        }
    });

    // Nhấn ESC để đóng
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closePopup();
        }
    });

    function closePopup() {
        popup.classList.remove("is-visible");
        popup.setAttribute("aria-hidden", "true");

        if (noShowCheckbox?.checked) {
            try {
                sessionStorage.setItem("cheri_promo_dismissed", "1");
            } catch (error) {
                console.warn("Không thể lưu trạng thái popup.", error);
            }
        }
    }

    closeButton.addEventListener("click", closePopup);

    popup.addEventListener("click", event => {
        if (event.target === popup) {
            closePopup();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closePopup();
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    homeInitProducts();
    homeInitPopup();
});

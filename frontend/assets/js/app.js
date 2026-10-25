"use strict";


document.addEventListener("DOMContentLoaded", async () => {
    await loadSharedComponents();

    updateHeaderCounts();
    setupHeaderInteractions();

    if (typeof window.updateCheriAccountMenu === "function") {
        window.updateCheriAccountMenu();
    }
});

async function loadSharedComponents() {
    const includes = document.querySelectorAll("[data-include]");

    for (const target of includes) {
        const componentName = target.dataset.include;

        const allowedComponents = {
            header: "../components/header.html",
            footer: "../components/footer.html"
        };

        const componentUrl = allowedComponents[componentName];

        if (!componentUrl) {
            console.warn("Không tìm thấy component:", componentName);
            continue;
        }

        try {
            const response = await fetch(componentUrl);

            if (!response.ok) {
                throw new Error(
                    `Không tải được ${componentName}.html (${response.status})`
                );
            }

            target.innerHTML = await response.text();
        } catch (error) {
            console.error("Lỗi tải component:", error);
            target.innerHTML = `
                <p style="padding:12px;color:#b42318">
                    Không tải được giao diện ${componentName}.
                    Hãy kiểm tra máy chủ và đường dẫn file.
                </p>
            `;
        }
    }
}

function setupHeaderInteractions() {
    // Dùng một listener chung để các nút vẫn hoạt động
    // sau khi header được tải bằng fetch().
    document.addEventListener("click", event => {
        const searchToggle = event.target.closest("#search-toggle");
        const searchClose = event.target.closest("#search-close");
        const accountToggle = event.target.closest("#account-toggle");
        const mobileToggle = event.target.closest("#mobile-menu-toggle");
        const dropdownTrigger = event.target.closest(".dropdown-trigger");

        const searchPanel = document.getElementById("header-search-panel");
        const accountMenu = document.getElementById("account-menu");
        const navigation = document.getElementById("main-navigation");

        if (searchToggle) {
            event.preventDefault();

            if (!searchPanel) {
                console.error("Không tìm thấy #header-search-panel");
                return;
            }

            const shouldOpen = searchPanel.hidden;

            searchPanel.hidden = !shouldOpen;
            searchToggle.setAttribute("aria-expanded", String(shouldOpen));

            if (shouldOpen) {
                accountMenu && (accountMenu.hidden = true);

                const accountButton = document.getElementById("account-toggle");
                accountButton?.setAttribute("aria-expanded", "false");

                document.getElementById("header-search-input")?.focus();
            }

            return;
        }

        if (searchClose) {
            event.preventDefault();

            if (searchPanel) {
                searchPanel.hidden = true;
            }

            document.getElementById("search-toggle")
                ?.setAttribute("aria-expanded", "false");

            document.getElementById("search-toggle")?.focus();
            return;
        }

        if (accountToggle) {
            event.preventDefault();

            if (!accountMenu) {
                console.error("Không tìm thấy #account-menu");
                return;
            }

            const shouldOpen = accountMenu.hidden;

            accountMenu.hidden = !shouldOpen;
            accountToggle.setAttribute("aria-expanded", String(shouldOpen));

            if (searchPanel) {
                searchPanel.hidden = true;
            }

            document.getElementById("search-toggle")
                ?.setAttribute("aria-expanded", "false");

            return;
        }

        if (mobileToggle) {
            event.preventDefault();

            if (!navigation) return;

            const isOpen = navigation.classList.toggle("is-open");
            mobileToggle.setAttribute("aria-expanded", String(isOpen));
            return;
        }

        if (dropdownTrigger) {
            const dropdown = dropdownTrigger.closest(".nav-item-dropdown");

            if (dropdown && window.matchMedia("(max-width: 980px)").matches) {
                event.preventDefault();

                const isOpen = dropdown.classList.toggle("is-open");
                dropdownTrigger.setAttribute("aria-expanded", String(isOpen));
            }

            return;
        }

        // Bấm bên ngoài thì đóng các bảng đang mở.
        if (searchPanel && !searchPanel.hidden &&
            !event.target.closest("#header-search-panel")) {
            searchPanel.hidden = true;
            document.getElementById("search-toggle")
                ?.setAttribute("aria-expanded", "false");
        }

        if (accountMenu && !accountMenu.hidden &&
            !event.target.closest("#account-menu")) {
            accountMenu.hidden = true;
            document.getElementById("account-toggle")
                ?.setAttribute("aria-expanded", "false");
        }
    });

    // Gửi từ khóa qua URL: shop.html?q=...
    document.addEventListener("submit", event => {
        if (event.target.id !== "header-search-form") return;

        event.preventDefault();

        const input = document.getElementById("header-search-input");
        const keyword = input?.value.trim() || "";

        if (!keyword) {
            input?.focus();
            return;
        }

        window.location.href = `shop.html?q=${encodeURIComponent(keyword)}`;
    });

    // Nhấn Escape để đóng bảng tìm kiếm/tài khoản/menu.
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        const searchPanel = document.getElementById("header-search-panel");
        const accountMenu = document.getElementById("account-menu");
        const navigation = document.getElementById("main-navigation");
        const mobileToggle = document.getElementById("mobile-menu-toggle");

        if (searchPanel) searchPanel.hidden = true;
        if (accountMenu) accountMenu.hidden = true;

        document.getElementById("search-toggle")
            ?.setAttribute("aria-expanded", "false");

        document.getElementById("account-toggle")
            ?.setAttribute("aria-expanded", "false");

        navigation?.classList.remove("is-open");
        mobileToggle?.setAttribute("aria-expanded", "false");

        document.querySelectorAll(".nav-item-dropdown.is-open")
            .forEach(dropdown => {
                dropdown.classList.remove("is-open");
                dropdown.querySelector(".dropdown-trigger")
                    ?.setAttribute("aria-expanded", "false");
            });
    });
}

function updateHeaderCounts() {
    const cartCount = document.getElementById("cart-count");
    const wishlistCount = document.getElementById("wishlist-count");

    try {
        const cart = JSON.parse(
            localStorage.getItem("cheri_cart") || "[]"
        );

        const wishlist = JSON.parse(
            localStorage.getItem("cheri_wishlist") || "[]"
        );

        if (cartCount) {
            const totalQuantity = Array.isArray(cart)
                ? cart.reduce((total, item) => {
                    if (!item || typeof item !== "object") {
                        return total;
                    }

                    const quantity = Number(
                        item.quantity ?? item.qty ?? 0
                    );

                    return total + (
                        Number.isFinite(quantity) && quantity > 0
                            ? quantity
                            : 0
                    );
                }, 0)
                : 0;

            cartCount.textContent = String(totalQuantity);
        }

        if (wishlistCount) {
            wishlistCount.textContent = String(
                Array.isArray(wishlist) ? wishlist.length : 0
            );
        }
    } catch (error) {
        console.warn("Dữ liệu giỏ hàng không hợp lệ:", error);

        if (cartCount) cartCount.textContent = "0";
        if (wishlistCount) wishlistCount.textContent = "0";
    }
}

// Các trang giỏ hàng/yêu thích phát sự kiện này khi dữ liệu thay đổi.
document.addEventListener("cheri:cart-updated", updateHeaderCounts);
document.addEventListener("cheri:wishlist-updated", updateHeaderCounts);

// Cập nhật nếu thay đổi localStorage từ tab khác.
window.addEventListener("storage", event => {
    if (event.key === "cheri_cart" || event.key === "cheri_wishlist") {
        updateHeaderCounts();
    }
});


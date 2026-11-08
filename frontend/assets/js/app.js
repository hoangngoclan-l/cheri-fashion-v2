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


/**
 * CHERI: Tạo khóa lưu riêng cho từng tài khoản.
 * Giữ dữ liệu cũ làm bản dự phòng, không xóa khóa cũ.
 */
function cheriGetStorageUserId() {
    const token = localStorage.getItem("cheri_auth_token");

    if (!token) return null;

    try {
        const user = JSON.parse(
            localStorage.getItem("cheri_auth_user") || "null"
        );

        if (!user) return null;

        const id = user.userId ?? user.user_id ?? user.id;

        // Ưu tiên ID tài khoản từ backend.
        // Email chỉ là phương án dự phòng nếu dữ liệu user không có ID.
        const identity = id ?? user.email;

        if (identity === undefined || identity === null || identity === "") {
            return null;
        }

        return String(identity);
    } catch {
        return null;
    }
}

function cheriStorageKey(baseKey) {
    const userId = cheriGetStorageUserId();

    // Khách chưa đăng nhập có vùng lưu riêng, không dùng chung với tài khoản.
    if (!userId) {
        return `${baseKey}_guest`;
    }

    const encodedId = encodeURIComponent(userId);
    const userKey = `${baseKey}_user_${encodedId}`;
    const migrationKey = "cheri_legacy_storage_migration_owner";

    if (!localStorage.getItem(migrationKey)) {
        const legacyCart = localStorage.getItem("cheri_cart");
        const legacyWishlist = localStorage.getItem("cheri_wishlist");

        if (legacyCart !== null || legacyWishlist !== null) {
            if (
                legacyCart !== null &&
                !localStorage.getItem(
                    `cheri_cart_user_${encodedId}`
                )
            ) {
                localStorage.setItem(
                    `cheri_cart_user_${encodedId}`,
                    legacyCart
                );
            }

            if (
                legacyWishlist !== null &&
                !localStorage.getItem(
                    `cheri_wishlist_user_${encodedId}`
                )
            ) {
                localStorage.setItem(
                    `cheri_wishlist_user_${encodedId}`,
                    legacyWishlist
                );
            }

            // Chỉ đánh dấu sau khi đã sao chép dữ liệu thành công.
            localStorage.setItem(migrationKey, userId);
        }
    }

    return userKey;
}


async function updateHeaderCounts() {
    const cartCount = document.getElementById("cart-count");
    const wishlistCount = document.getElementById("wishlist-count");
    const token = localStorage.getItem("cheri_auth_token");

    if (!token) {
        const guestCart = readHeaderStorage("cheri_cart");
        const guestWishlist = readHeaderStorage("cheri_wishlist");
        const quantity = guestCart.reduce((total, item) => {
            const value = Number(item?.quantity ?? item?.qty ?? 1);
            return total + (Number.isFinite(value) && value > 0 ? value : 0);
        }, 0);

        if (cartCount) cartCount.textContent = quantity ? String(quantity) : "";
        if (wishlistCount) wishlistCount.textContent = guestWishlist.length ? String(guestWishlist.length) : "";
        return;
    }

    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const [cartResult, wishlistResult] = await Promise.allSettled([
        fetch("/api/cart", { headers }),
        fetch("/api/wishlist", { headers })
    ]);

    if (cartCount) {
        try {
            if (cartResult.status !== "fulfilled" || !cartResult.value.ok) {
                throw new Error("Không thể tải số lượng giỏ hàng.");
            }
            const data = await cartResult.value.json();
            const items = Array.isArray(data.items) ? data.items : [];
            const quantity = items.reduce((total, item) => {
                const value = Number(item.quantity ?? 1);
                return total + (Number.isFinite(value) && value > 0 ? value : 0);
            }, 0);
            cartCount.textContent = quantity ? String(quantity) : "";
        } catch (error) {
            console.warn("Không thể cập nhật số lượng giỏ hàng:", error);
            cartCount.textContent = "";
        }
    }

    if (wishlistCount) {
        try {
            if (wishlistResult.status !== "fulfilled" || !wishlistResult.value.ok) {
                throw new Error("Không thể tải số lượng yêu thích.");
            }
            const data = await wishlistResult.value.json();
            const items = Array.isArray(data.items) ? data.items : [];
            wishlistCount.textContent = items.length ? String(items.length) : "";
        } catch (error) {
            console.warn("Không thể cập nhật số lượng yêu thích:", error);
            wishlistCount.textContent = "";
        }
    }
}

function readHeaderStorage(baseKey) {
    try {
        const key = typeof cheriStorageKey === "function"
            ? cheriStorageKey(baseKey)
            : `${baseKey}_guest`;
        const items = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(items) ? items : [];
    } catch {
        return [];
    }
}

// Các trang giỏ hàng/yêu thích phát sự kiện này khi dữ liệu thay đổi.
document.addEventListener("cheri:cart-updated", updateHeaderCounts);
document.addEventListener("cheri:wishlist-updated", updateHeaderCounts);

// Cập nhật nếu thay đổi localStorage từ tab khác.
window.addEventListener("storage", event => {
    if (
        event.key === "cheri_cart" ||
        event.key === "cheri_wishlist" ||
        event.key === "cheri_cart_guest" ||
        event.key === "cheri_wishlist_guest" ||
        event.key?.startsWith("cheri_cart_user_") ||
        event.key?.startsWith("cheri_wishlist_user_")
    ) {
        updateHeaderCounts();
    }
});


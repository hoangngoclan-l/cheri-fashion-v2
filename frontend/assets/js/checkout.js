
"use strict";

const CHECKOUT_CART_KEY = cheriStorageKey("cheri_checkout_items");
const CART_STORAGE_KEY = cheriStorageKey("cheri_cart");
const BUY_NOW_KEY = cheriStorageKey("cheri_buy_now");

const ADDRESS_API = "https://www.tinhthanhpho.com/api/v1";

let checkoutProducts = [];
let provinceList = [];
let wardList = [];
let checkoutSource = new URLSearchParams(window.location.search).get("mode") === "buy-now"
    ? "buy-now"
    : "cart";

function checkoutFormatPrice(value) {
    return new Intl.NumberFormat("vi-VN").format(
        Math.max(0, Number(value) || 0)
    ) + "đ";
}

function checkoutEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function checkoutGetQuantity(item) {
    return Math.max(1, Number(item.quantity ?? item.qty) || 1);
}

function checkoutGetPrice(item) {
    return Math.max(0, Number(item.price) || 0);
}

function checkoutGetImage(item) {
    return item.image || "../assets/images/products/placeholder.webp";
}

function checkoutReadProducts() {
    const params = new URLSearchParams(window.location.search);

    // Mua ngay từ trang chi tiết sản phẩm.
    if (checkoutSource === "buy-now") {
        try {
            const item = JSON.parse(
                localStorage.getItem(BUY_NOW_KEY) || "null"
            );

            return item ? [item] : [];
        } catch {
            return [];
        }
    }

    // Thanh toán các sản phẩm được chuyển từ giỏ hàng.
    try {
        const selected = JSON.parse(
            localStorage.getItem(CHECKOUT_CART_KEY) || "null"
        );

        if (Array.isArray(selected)) {
            return selected;
        }
    } catch {
        // Nếu dữ liệu không hợp lệ, thử đọc giỏ hàng bên dưới.
    }

    // Phương án dự phòng cho dữ liệu giỏ hàng cũ.
    try {
        const cart = JSON.parse(
            localStorage.getItem(CART_STORAGE_KEY) || "[]"
        );

        return Array.isArray(cart)
            ? cart.filter(item => item.selected !== false)
            : [];
    } catch {
        return [];
    }
}

function checkoutCalculateSubtotal() {
    return checkoutProducts.reduce((sum, item) => {
        return sum + checkoutGetPrice(item) * checkoutGetQuantity(item);
    }, 0);
}

function checkoutCalculateShipping() {
    // Phí vận chuyển tạm tính cho bản giao diện.
    // Có thể thay bằng phí thực tế khi tích hợp đơn vị vận chuyển.
    return checkoutProducts.length > 0 ? 30000 : 0;
}

function checkoutRenderProducts() {
    const container = document.getElementById("checkout-products");
    const submitButton = document.getElementById("checkout-submit");

    if (!container) return;

    if (!checkoutProducts.length) {
        container.innerHTML = `
            <div class="checkout-empty">
                <p>Chưa có sản phẩm để thanh toán.</p>
                <a href="cart.html">Quay lại giỏ hàng</a>
            </div>
        `;

        if (submitButton) submitButton.disabled = true;

        checkoutUpdateTotals();
        return;
    }

    if (submitButton) submitButton.disabled = false;

    container.innerHTML = checkoutProducts.map(item => {
        const name = checkoutEscape(item.name || "Sản phẩm Cheri Fashion");
        const image = checkoutEscape(checkoutGetImage(item));
        const quantity = checkoutGetQuantity(item);
        const price = checkoutGetPrice(item);
        const size = item.size ? checkoutEscape(item.size) : "";
        const color = item.color ? checkoutEscape(item.color) : "";

        const options = [size, color].filter(Boolean).join(" / ");

        return `
            <article class="checkout-product">
                <img
                    src="${image}"
                    alt="${name}"
                    loading="lazy"
                    onerror="this.style.display='none'"
                >

                <div>
                    <p class="checkout-product-name">${name}</p>

                    <div class="checkout-product-meta">
                        ${options ? `${options} · ` : ""}
                        Số lượng: ${quantity}
                    </div>

                    <div class="checkout-product-price">
                        ${checkoutFormatPrice(price * quantity)}
                    </div>
                </div>
            </article>
        `;
    }).join("");

    checkoutUpdateTotals();
}

function checkoutUpdateTotals() {
    const subtotal = checkoutCalculateSubtotal();
    const shipping = checkoutCalculateShipping();

    const subtotalElement = document.getElementById("checkout-subtotal");
    const shippingElement = document.getElementById("checkout-shipping");
    const totalElement = document.getElementById("checkout-total");

    if (subtotalElement) {
        subtotalElement.textContent = checkoutFormatPrice(subtotal);
    }

    if (shippingElement) {
        shippingElement.textContent = checkoutFormatPrice(shipping);
    }

    if (totalElement) {
        totalElement.textContent = checkoutFormatPrice(subtotal + shipping);
    }
}

function checkoutShowMessage(message, type = "error") {
    const container = document.getElementById("checkout-message");

    if (!container) return;

    container.innerHTML = `
        <div class="checkout-message ${type}" role="status">
            ${checkoutEscape(message)}
        </div>
    `;

    container.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

async function checkoutLoadProvinces() {
    const provinceInput = document.getElementById("receiver-province");
    const provinceOptions = document.getElementById("province-options");

    if (!provinceInput || !provinceOptions) return;

    try {
        const response = await fetch(`${ADDRESS_API}/new-provinces?limit=100`);

        if (!response.ok) {
            throw new Error("Không tải được danh sách tỉnh/thành.");
        }

        const result = await response.json();

        provinceList = Array.isArray(result)
            ? result
            : (result.data || []);

        provinceOptions.innerHTML = provinceList.map(province => `
            <option value="${checkoutEscape(province.name)}"></option>
        `).join("");

    } catch (error) {
        console.error("Lỗi tải tỉnh/thành:", error);

        provinceInput.placeholder =
            "Nhập tỉnh/thành phố nếu danh sách chưa tải được";
    }
}

async function checkoutLoadWards(provinceName) {
    const wardInput = document.getElementById("receiver-ward");
    const wardOptions = document.getElementById("ward-options");

    if (!wardInput || !wardOptions) return;

    wardList = [];
    wardOptions.innerHTML = "";
    wardInput.value = "";

    const province = provinceList.find(item =>
        item.name.toLocaleLowerCase("vi") ===
        provinceName.trim().toLocaleLowerCase("vi")
    );

    if (!province) {
        wardInput.placeholder = provinceList.length
            ? "Chọn đúng tỉnh/thành trong danh sách"
            : "Nhập tên phường / xã";
        return;
    }

    wardInput.placeholder = "Đang tải danh sách phường/xã...";

    try {
        const response = await fetch(
            `${ADDRESS_API}/new-provinces/${encodeURIComponent(province.code)}/wards?limit=1000`
        );

        if (!response.ok) {
            throw new Error("Không tải được danh sách phường/xã.");
        }

        const result = await response.json();

        wardList = Array.isArray(result)
            ? result
            : (result.data || []);

        wardOptions.innerHTML = wardList.map(ward => `
            <option value="${checkoutEscape(ward.name)}"></option>
        `).join("");

        wardInput.placeholder = "Tìm phường / xã";

    } catch (error) {
        console.error("Lỗi tải phường/xã:", error);
        wardInput.placeholder = "Nhập tên phường/xã";
    }
}

function checkoutBindAddressEvents() {
    const provinceInput = document.getElementById("receiver-province");
    const wardInput = document.getElementById("receiver-ward");

    provinceInput?.addEventListener("change", () => {
        checkoutLoadWards(provinceInput.value);
    });

    provinceInput?.addEventListener("input", () => {
        const matched = provinceList.some(item =>
            item.name.toLocaleLowerCase("vi") ===
            provinceInput.value.trim().toLocaleLowerCase("vi")
        );

        if (!matched && wardInput) {
            wardInput.value = "";
            document.getElementById("ward-options").innerHTML = "";
            wardList = [];
        }
    });
}

function checkoutValidateForm(form) {
    const requiredFields = [
        ["receiver-name", "Vui lòng nhập họ và tên người nhận."],
        ["receiver-phone", "Vui lòng nhập số điện thoại."],
        ["receiver-province", "Vui lòng nhập tỉnh/thành phố."],
        ["receiver-ward", "Vui lòng nhập phường/xã."],
        ["receiver-address", "Vui lòng nhập địa chỉ cụ thể."]
    ];

    for (const [id, message] of requiredFields) {
        const field = document.getElementById(id);

        if (!field || !field.value.trim()) {
            checkoutShowMessage(message);
            field?.focus();
            return false;
        }
    }

    const phone = document.getElementById("receiver-phone").value.trim();

    if (!/^[0-9+\s().-]{9,15}$/.test(phone)) {
        checkoutShowMessage("Số điện thoại chưa đúng định dạng.");
        document.getElementById("receiver-phone").focus();
        return false;
    }

    const email = document.getElementById("receiver-email").value.trim();

    if (email && !document.getElementById("receiver-email").checkValidity()) {
        checkoutShowMessage("Vui lòng kiểm tra lại địa chỉ email.");
        document.getElementById("receiver-email").focus();
        return false;
    }

    if (!checkoutProducts.length) {
        checkoutShowMessage("Giỏ hàng chưa có sản phẩm để thanh toán.");
        return false;
    }

    // Nếu danh sách địa chỉ tải thành công, yêu cầu chọn đúng gợi ý.
    if (
        provinceList.length &&
        !provinceList.some(item =>
            item.name.toLocaleLowerCase("vi") ===
            document.getElementById("receiver-province").value
                .trim().toLocaleLowerCase("vi")
        )
    ) {
        checkoutShowMessage("Vui lòng chọn tỉnh/thành từ danh sách gợi ý.");
        document.getElementById("receiver-province").focus();
        return false;
    }

    if (
        wardList.length &&
        !wardList.some(item =>
            item.name.toLocaleLowerCase("vi") ===
            document.getElementById("receiver-ward").value
                .trim().toLocaleLowerCase("vi")
        )
    ) {
        checkoutShowMessage("Vui lòng chọn phường/xã từ danh sách gợi ý.");
        document.getElementById("receiver-ward").focus();
        return false;
    }

    return true;
}


function checkoutGetIdempotencyStorageKey(token) {
    if (!token) {
        return "cheri_pending_order_idempotency_guest";
    }

    let user;

    try {
        user = JSON.parse(
            localStorage.getItem("cheri_auth_user") || "null"
        );
    } catch (error) {
        throw new Error(
            "Không thể xác định tài khoản đặt hàng. Vui lòng đăng nhập lại."
        );
    }

    const userId = String(user?.id ?? "").trim();

    if (!/^[1-9]\d*$/.test(userId)) {
        throw new Error(
            "Không thể xác định tài khoản đặt hàng. Vui lòng đăng nhập lại."
        );
    }

    return `cheri_pending_order_idempotency_user_${userId}`;
}

async function checkoutGetIdempotencyKey(payload, token) {
    const storageKey = checkoutGetIdempotencyStorageKey(token);
    const legacyStorageKey = "cheri_pending_order_idempotency";

    if (
        !globalThis.crypto?.subtle ||
        !globalThis.crypto?.getRandomValues
    ) {
        throw new Error(
            "Trình duyệt không hỗ trợ bảo mật cần thiết để xác nhận đơn hàng."
        );
    }

    const identity = token
        ? storageKey.replace("cheri_pending_order_idempotency_user_", "")
        : "guest";

    async function createFingerprint(value) {
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(value))
        );

        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    const fingerprint = await createFingerprint({
        identity: storageKey,
        payload
    });

    // Fingerprint theo đúng công thức của phiên bản cũ.
    const legacyFingerprint = await createFingerprint({
        identity,
        payload
    });

    let previous = null;
    let legacyPrevious = null;

    try {
        previous = JSON.parse(
            localStorage.getItem(storageKey) || "null"
        );

        legacyPrevious = JSON.parse(
            sessionStorage.getItem(legacyStorageKey) || "null"
        );
    } catch (error) {
        throw new Error(
            "Không thể đọc dữ liệu xác nhận đơn hàng đang lưu. " +
            "Vui lòng kiểm tra bộ nhớ trình duyệt trước khi tiếp tục."
        );
    }

    // Chuyển khóa cũ chỉ khi chứng minh được nó thuộc đúng payload hiện tại.
    if (legacyPrevious !== null) {
        const validLegacy =
            /^[A-Za-z0-9_-]{32,100}$/.test(legacyPrevious?.key || "") &&
            /^[a-f0-9]{64}$/.test(legacyPrevious?.fingerprint || "");

        if (!validLegacy) {
            throw new Error(
                "Có yêu cầu đặt hàng cũ chưa thể xác minh. " +
                "Không thể tự động tạo yêu cầu mới an toàn."
            );
        }

        if (legacyPrevious.fingerprint !== legacyFingerprint) {
            throw new Error(
                "Phát hiện yêu cầu đặt hàng cũ chưa được đối chiếu. " +
                "Vui lòng kiểm tra lịch sử đơn hàng trước khi tiếp tục."
            );
        }

        if (
            previous !== null &&
            previous?.key !== legacyPrevious.key
        ) {
            throw new Error(
                "Khóa đặt hàng cũ và khóa hiện tại không khớp. " +
                "Vui lòng kiểm tra lịch sử đơn hàng trước khi tiếp tục."
            );
        }

        if (
            previous !== null &&
            previous?.fingerprint !== fingerprint
        ) {
            throw new Error(
                "Đang có yêu cầu đặt hàng khác chưa được xác nhận kết quả."
            );
        }

        if (previous === null) {
            const migratedRecord = {
                fingerprint,
                key: legacyPrevious.key,
                createdAt: new Date().toISOString(),
                migratedFromLegacy: true
            };

            try {
                localStorage.setItem(
                    storageKey,
                    JSON.stringify(migratedRecord)
                );

                previous = JSON.parse(
                    localStorage.getItem(storageKey) || "null"
                );

                if (
                    previous?.key !== legacyPrevious.key ||
                    previous?.fingerprint !== fingerprint
                ) {
                    throw new Error("Migration verification failed.");
                }
            } catch (error) {
                throw new Error(
                    "Không thể chuyển khóa đặt hàng cũ sang bộ nhớ an toàn. " +
                    "Vui lòng không gửi lại đơn hàng lúc này."
                );
            }
        }

        // Chỉ xóa khóa cũ sau khi khóa mới đã được xác minh.
        try {
            sessionStorage.removeItem(legacyStorageKey);
        } catch (error) {
            console.warn(
                "Chưa thể dọn khóa idempotency cũ:",
                error
            );
        }
    }

    if (previous !== null) {
        if (
            !/^[A-Za-z0-9_-]{32,100}$/.test(previous?.key || "") ||
            !/^[a-f0-9]{64}$/.test(previous?.fingerprint || "")
        ) {
            throw new Error(
                "Có yêu cầu đặt hàng trước chưa thể xác minh. " +
                "Vui lòng kiểm tra lịch sử đơn hàng trước khi tiếp tục."
            );
        }

        if (previous.fingerprint !== fingerprint) {
            throw new Error(
                "Đang có yêu cầu đặt hàng trước chưa được xác nhận kết quả. " +
                "Vui lòng kiểm tra lịch sử đơn hàng trước khi tạo yêu cầu mới."
            );
        }

        return previous.key;
    }

    let key;

    if (typeof crypto.randomUUID === "function") {
        key = crypto.randomUUID();
    } else {
        const bytes = crypto.getRandomValues(new Uint8Array(32));

        key = Array.from(bytes)
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    try {
        localStorage.setItem(
            storageKey,
            JSON.stringify({
                fingerprint,
                key,
                createdAt: new Date().toISOString()
            })
        );
    } catch (error) {
        throw new Error(
            "Không thể lưu khóa xác nhận đơn hàng. " +
            "Vui lòng kiểm tra cài đặt trình duyệt."
        );
    }

    return key;
}

let checkoutRecoveryBlocked = false;
let checkoutInitializationComplete = false;

function checkoutBlockRecovery(message) {
    checkoutRecoveryBlocked = true;

    const submitButton = document.getElementById("checkout-submit");
    if (submitButton) submitButton.disabled = true;

    checkoutShowMessage(message);
}

async function checkoutValidatePendingSnapshot(
    record,
    storageKey,
    expectedSource
) {
    try {
        const snapshot = record?.snapshot;
        const payload = snapshot?.payload;

        if (
            !/^[A-Za-z0-9_-]{32,100}$/.test(record?.key || "") ||
            !/^[a-f0-9]{64}$/.test(record?.fingerprint || "") ||
            snapshot?.version !== 1 ||
            snapshot?.checkoutSource !== expectedSource ||
            payload?.checkoutSource !== expectedSource ||
            !Array.isArray(payload?.items) ||
            !Array.isArray(payload?.cartItems) ||
            !Array.isArray(snapshot?.products) ||
            snapshot.products.length === 0 ||
            snapshot.products.length !== payload.items.length ||
            !snapshot.form ||
            typeof snapshot.form !== "object"
        ) {
            return false;
        }

        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify({
                identity: storageKey,
                payload
            }))
        );

        const fingerprint = Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");

        if (fingerprint !== record.fingerprint) {
            return false;
        }

        for (let i = 0; i < snapshot.products.length; i++) {
            const product = snapshot.products[i];
            const item = payload.items[i];

            if (
                Number(product.productId ?? product.id) !== Number(item.productId) ||
                String(product.size || "").trim() !== String(item.size || "").trim() ||
                String(product.colorName || product.color || "").trim() !==
                    String(item.colorName || "").trim() ||
                checkoutGetQuantity(product) !== Number(item.quantity)
            ) {
                return false;
            }
        }

        if (payload.cartItems.length > 0) {
            if (payload.cartItems.length !== snapshot.products.length) {
                return false;
            }

            for (let i = 0; i < payload.cartItems.length; i++) {
                const product = snapshot.products[i];
                const cartItem = payload.cartItems[i];

                const snapshotCartItemId = Number(product.cartItemId);
                const payloadCartItemId = Number(cartItem.cartItemId);

                if (
                    !Number.isSafeInteger(snapshotCartItemId) ||
                    snapshotCartItemId <= 0 ||
                    snapshotCartItemId !== payloadCartItemId ||
                    Number(product.productId ?? product.id) !==
                        Number(cartItem.productId) ||
                    String(product.size || "").trim() !==
                        String(cartItem.size || "").trim() ||
                    String(product.colorName || product.color || "").trim() !==
                        String(cartItem.colorName || "").trim() ||
                    checkoutGetQuantity(product) !== Number(cartItem.quantity)
                ) {
                    return false;
                }
            }
        }

        return true;
    } catch (error) {
        console.error("Không thể xác minh snapshot:", error);
        return false;
    }
}

async function checkoutPersistPendingSnapshot(
    idempotencyKey,
    token,
    payload,
    formData,
    isBuyNow
) {
    const storageKey = checkoutGetIdempotencyStorageKey(token);

    let pending;

    try {
        pending = JSON.parse(
            localStorage.getItem(storageKey) || "null"
        );
    } catch {
        throw new Error(
            "Không đọc được khóa đặt hàng. Không thể gửi yêu cầu an toàn."
        );
    }

    if (
        !pending ||
        pending.key !== idempotencyKey ||
        !/^[a-f0-9]{64}$/.test(pending.fingerprint || "")
    ) {
        throw new Error(
            "Khóa đặt hàng không còn khớp. Vui lòng tải lại trang trước khi tiếp tục."
        );
    }

    const snapshot = {
        version: 1,
        checkoutSource: isBuyNow ? "buy-now" : "cart",
        payload,
        products: checkoutProducts.map(item => ({ ...item })),
        form: {
            receiverName: String(formData.get("receiverName") || "").trim(),
            receiverPhone: String(formData.get("receiverPhone") || "").trim(),
            receiverEmail: String(formData.get("receiverEmail") || "").trim(),
            province: String(formData.get("province") || "").trim(),
            ward: String(formData.get("ward") || "").trim(),
            address: String(formData.get("address") || "").trim(),
            note: String(formData.get("note") || "").trim()
        },
        selectedPayment: String(
            formData.get("paymentMethod") || "cod"
        ),
        savedAt: new Date().toISOString()
    };

    const record = {
        ...pending,
        snapshot
    };

    const valid = await checkoutValidatePendingSnapshot(
        record,
        storageKey,
        snapshot.checkoutSource
    );

    if (!valid) {
        throw new Error(
            "Dữ liệu phục hồi không khớp với yêu cầu đặt hàng. Yêu cầu chưa được gửi."
        );
    }

    try {
        localStorage.setItem(storageKey, JSON.stringify(record));

        const verified = JSON.parse(
            localStorage.getItem(storageKey) || "null"
        );

        const readBackValid = await checkoutValidatePendingSnapshot(
            verified,
            storageKey,
            snapshot.checkoutSource
        );

        if (!readBackValid) {
            throw new Error("Snapshot verification failed.");
        }
    } catch (error) {
        throw new Error(
            "Không thể lưu và xác minh dữ liệu phục hồi đơn hàng. " +
            "Yêu cầu chưa được gửi lên máy chủ."
        );
    }
}

async function checkoutRestorePendingSnapshot() {
    let token;
    let storageKey;
    let pending;

    try {
        token = localStorage.getItem("cheri_auth_token");
        storageKey = checkoutGetIdempotencyStorageKey(token);

        pending = JSON.parse(
            localStorage.getItem(storageKey) || "null"
        );
    } catch (error) {
        checkoutBlockRecovery(
            error.message ||
            "Không thể kiểm tra yêu cầu đặt hàng đang chờ."
        );
        return;
    }

    if (!pending || !pending.snapshot) return;

    const snapshot = pending.snapshot;
    const params = new URLSearchParams(window.location.search);
    const snapshotSource = snapshot.checkoutSource;

    if (!["cart", "buy-now"].includes(snapshotSource)) {
        checkoutBlockRecovery(
            "Nguồn của yêu cầu đặt hàng đang chờ không hợp lệ. " +
            "Vui lòng kiểm tra lịch sử đơn hàng trước khi thử lại."
        );
        return;
    }

    const validSnapshot = await checkoutValidatePendingSnapshot(
        pending,
        storageKey,
        snapshotSource
    );
    if (!validSnapshot) {
        checkoutBlockRecovery(
            "Có yêu cầu đặt hàng cũ nhưng dữ liệu phục hồi không hợp lệ. " +
            "Không thể tự tạo yêu cầu mới. Vui lòng kiểm tra lịch sử đơn hàng."
        );
        return;
    }

    checkoutSource = snapshotSource;

    const fields = {
        "receiver-name": snapshot.form.receiverName,
        "receiver-phone": snapshot.form.receiverPhone,
        "receiver-email": snapshot.form.receiverEmail,
        "receiver-province": snapshot.form.province,
        "receiver-address": snapshot.form.address
    };

    Object.entries(fields).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = String(value || "");
    });

    checkoutProducts = snapshot.products.map(item => ({ ...item }));
    checkoutRenderProducts();

    const paymentInput = document.querySelector(
        `input[name="paymentMethod"][value="${CSS.escape(
            snapshot.selectedPayment || "cod"
        )}"]`
    );

    if (paymentInput && !paymentInput.disabled) {
        paymentInput.checked = true;
        paymentInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const provinceInput = document.getElementById("receiver-province");
    const wardInput = document.getElementById("receiver-ward");

    if (provinceInput) {
        provinceInput.value = snapshot.form.province || "";
    }

    if (snapshot.form.province) {
        await checkoutLoadWards(snapshot.form.province);
    }

    if (wardInput) {
        wardInput.value = snapshot.form.ward || "";
    }

    const noteInput = document.querySelector(
        '#checkout-form [name="note"]'
    );

    if (noteInput) {
        noteInput.value = snapshot.form.note || "";
    }

    console.info(
        "Đã phục hồi dữ liệu của yêu cầu đặt hàng đang chờ đối chiếu."
    );
}
function checkoutBindForm() {
    const form = document.getElementById("checkout-form");

    async function checkoutSubmitOrder(formData) {
        const submitButton = document.getElementById("checkout-submit");

        if (!checkoutInitializationComplete) {
            checkoutShowMessage(
                "Đang kiểm tra dữ liệu đặt hàng trước đó. Vui lòng chờ."
            );
            return;
        }

        if (checkoutRecoveryBlocked) {
            checkoutShowMessage(
                "Yêu cầu cũ chưa được xác minh. Không thể gửi đơn hàng mới."
            );
            return;
        }


        // Lấy thông tin từ form thanh toán
        const recipientName = String(formData.get("receiverName") || "").trim();
        const phone = String(formData.get("receiverPhone") || "").trim();
        const email = String(formData.get("receiverEmail") || "").trim();
        const province = String(formData.get("province") || "").trim();
        const ward = String(formData.get("ward") || "").trim();
        const address = String(formData.get("address") || "").trim();
        const note = String(formData.get("note") || "").trim();

        // Chuyển phương thức thanh toán của giao diện sang giá trị API chấp nhận
        const selectedPayment = String(formData.get("paymentMethod") || "cod");

        const paymentMap = {
            cod: "cod",
            bank: "bank_transfer",
            bank_transfer: "bank_transfer",
            ewallet: "online",
            card: "online",
            online: "online"
        };

        const paymentMethod = paymentMap[selectedPayment];

        if (!paymentMethod) {
            checkoutShowMessage("Phương thức thanh toán không hợp lệ.");
            return;
        }

        // Chuyển sản phẩm trong giỏ hàng sang định dạng API yêu cầu
        const items = checkoutProducts.map(item => ({
            productId: Number(item.productId ?? item.id),
            size: String(item.size || "").trim(),
            colorName: String(item.colorName || item.color || "").trim(),
            quantity: checkoutGetQuantity(item)
        }));

        if (items.some(item =>
            !Number.isSafeInteger(item.productId) ||
            item.productId <= 0 ||
            !item.size ||
            !item.colorName ||
            !Number.isSafeInteger(item.quantity) ||
            item.quantity <= 0
        )) {
            checkoutShowMessage(
                "Sản phẩm trong giỏ hàng thiếu ID, kích thước hoặc màu sắc. " +
                "Vui lòng quay lại giỏ hàng và chọn đầy đủ thông tin."
            );
            return;
        }

        const isBuyNow = checkoutSource === "buy-now";
        let token = null;

        try {
            token = localStorage.getItem("cheri_auth_token");
        } catch (storageError) {
            console.error("Không thể truy cập phiên đăng nhập:", storageError);

            checkoutShowMessage(
                "Không thể đọc thông tin đăng nhập từ trình duyệt. " +
                "Vui lòng kiểm tra cài đặt trình duyệt rồi thử lại."
            );

            return;
        }

        const cartItems = !isBuyNow && token
            ? checkoutProducts.map(item => ({
                cartItemId: Number(item.cartItemId),
                productId: Number(item.productId ?? item.id),
                size: String(item.size || "").trim(),
                colorName: String(item.colorName || item.color || "").trim(),
                quantity: checkoutGetQuantity(item)
            }))
            : [];

        if (
            !isBuyNow &&
            token &&
            cartItems.some(item =>
                !Number.isSafeInteger(item.cartItemId) ||
                item.cartItemId <= 0
            )
        ) {
            checkoutShowMessage(
                "Không xác định được sản phẩm trong giỏ hàng. Vui lòng quay lại tải lại giỏ hàng."
            );
            return;
        }

        const payload = {
            recipientName,
            phone,
            email: email || null,
            province,
            ward,
            shippingAddress: address,
            note,
            paymentMethod,
            items,
            checkoutSource: isBuyNow ? "buy-now" : "cart",
            cartItems
        };

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.dataset.originalText =
                submitButton.textContent || "Đặt hàng";
            submitButton.textContent = "Đang xử lý...";
        }

        try {
            const idempotencyKey =
                await checkoutGetIdempotencyKey(payload, token);

            await checkoutPersistPendingSnapshot(
                idempotencyKey,
                token,
                payload,
                formData,
                isBuyNow
            );

            const headers = {
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey
            };

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetch("/api/orders", {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success || !result.order?.orderCode) {
                // Chi xoa khoa neu backend xac nhan request chac chan chua tao don.
                if (result.safeToRetry === true) {
                    try {
                        const pendingStorageKey =
                            checkoutGetIdempotencyStorageKey(token);

                        const pending = JSON.parse(
                            localStorage.getItem(pendingStorageKey) || "null"
                        );

                        if (pending?.key === idempotencyKey) {
                            localStorage.removeItem(pendingStorageKey);
                        }
                    } catch (storageError) {
                        console.error(
                            "Không thể dọn khóa yêu cầu có thể thử lại:",
                            storageError
                        );
                    }
                }

                throw new Error(
                    result.message ||
                    "Không thể tạo đơn hàng. Vui lòng thử lại."
                );
            }


            // Chỉ lưu địa chỉ mặc định sau khi server đã tạo đơn thành công.
            try {
                checkoutSaveDefaultAddress(formData);
            } catch (addressError) {
                console.error(
                    "Không thể lưu địa chỉ mặc định:",
                    addressError
                );
            }

            // Server đã tạo đơn thành công.
            // Lưu dữ liệu trình duyệt là thao tác phụ, không được làm thất bại đơn hàng.
            const confirmedOrder = {
                orderCode: result.order.orderCode,
                orderId: result.order.id,
                idempotencyKey,
                recipientName,
                phone,
                email,
                province,
                ward,
                address,
                note,
                paymentMethod: result.order.paymentMethod,
                subtotal: result.order.subtotal,
                shipping: result.order.shippingFee,
                discount: result.order.discountAmount,
                total: result.order.totalAmount,
                orderStatus: result.order.orderStatus,
                items: checkoutProducts,
                createdAt: new Date().toISOString()
            };

            // Gắn khóa pending với đơn hàng vừa được server tạo.
            // Không xóa khóa ở checkout; trang xác nhận sẽ xử lý sau khi đối chiếu.
            try {
                const pendingStorageKey =
                    checkoutGetIdempotencyStorageKey(token);

                const pending = JSON.parse(
                    localStorage.getItem(pendingStorageKey) || "null"
                );

                if (pending?.key === idempotencyKey) {
                    localStorage.setItem(
                        pendingStorageKey,
                        JSON.stringify({
                            ...pending,
                            orderId: result.order.id,
                            confirmedAt: new Date().toISOString()
                        })
                    );
                }
            } catch (storageError) {
                console.error(
                    "Không thể liên kết khóa idempotency với đơn hàng:",
                    storageError
                );
            }
            try {
                localStorage.setItem(
                    cheriStorageKey("cheri_order_confirmation"),
                    JSON.stringify(confirmedOrder)
                );
            } catch (storageError) {
                console.error(
                    "Đơn hàng đã được tạo nhưng không thể lưu xác nhận vào trình duyệt:",
                    storageError
                );
            }

            // Dọn dữ liệu thanh toán tạm độc lập với việc lưu xác nhận.
            try {
                localStorage.removeItem(CHECKOUT_CART_KEY);
                localStorage.removeItem(BUY_NOW_KEY);
            } catch (cleanupError) {
                console.error(
                    "Không thể dọn dữ liệu thanh toán tạm:",
                    cleanupError
                );
            }
            // Nếu thanh toán từ giỏ hàng, chỉ trừ số lượng đã đặt.
            // Nếu là Mua ngay, giữ nguyên giỏ hàng hiện có.
            if (!isBuyNow) {
                try {
                    const cart = JSON.parse(
                        localStorage.getItem(CART_STORAGE_KEY) || "[]"
                    );

                    if (Array.isArray(cart)) {
                        for (const purchased of checkoutProducts) {
                            let remaining = checkoutGetQuantity(purchased);

                            for (let i = 0; i < cart.length && remaining > 0; i++) {
                                const cartItem = cart[i];

                                const sameProduct =
                                    Number(cartItem.productId ?? cartItem.id) ===
                                    Number(purchased.productId ?? purchased.id);

                                const sameSize =
                                    String(cartItem.size || "") ===
                                    String(purchased.size || "");

                                const sameColor =
                                    String(cartItem.colorName || cartItem.color || "") ===
                                    String(purchased.colorName || purchased.color || "");

                                if (!sameProduct || !sameSize || !sameColor) {
                                    continue;
                                }

                                const cartQuantity = checkoutGetQuantity(cartItem);
                                const removeQuantity = Math.min(
                                    cartQuantity,
                                    remaining
                                );

                                const newQuantity = cartQuantity - removeQuantity;
                                remaining -= removeQuantity;

                                if (newQuantity <= 0) {
                                    cart.splice(i, 1);
                                    i--;
                                } else {
                                    cartItem.quantity = newQuantity;
                                    if ("qty" in cartItem) {
                                        cartItem.qty = newQuantity;
                                    }
                                }
                            }
                        }

                        localStorage.setItem(
                            CART_STORAGE_KEY,
                            JSON.stringify(cart)
                        );
                    }
                } catch (storageError) {
                    console.error(
                        "Không thể cập nhật giỏ hàng sau khi đặt hàng:",
                        storageError
                    );
                }
            }

            // Chuyển đến trang xác nhận đơn hàng
            const successUrl = new URL("order-success.html", window.location.href);
            successUrl.searchParams.set("code", result.order.orderCode);
            successUrl.searchParams.set("id", String(result.order.id));

            window.location.href = successUrl.toString();

        } catch (error) {
            console.error("Lỗi đặt hàng:", error);

            checkoutShowMessage(
                error.message ||
                "Không thể kết nối máy chủ. Vui lòng thử lại."
            );

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent =
                    submitButton.dataset.originalText || "Đặt hàng";
            }
        }
    }

        form?.addEventListener("submit", async event => {
            event.preventDefault();

            if (!checkoutValidateForm(form)) {
                return;
            }

            const formData = new FormData(form);

            await checkoutSubmitOrder(formData);
        });
    }

const DEFAULT_ADDRESS_KEY = cheriStorageKey("cheri_default_address");

function checkoutLoadDefaultAddress() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(DEFAULT_ADDRESS_KEY) || "null"
        );

        if (!saved) return;

        const fields = {
            "receiver-name": saved.receiverName,
            "receiver-phone": saved.receiverPhone,
            "receiver-email": saved.receiverEmail,
            "receiver-province": saved.province,
            "receiver-ward": saved.ward,
            "receiver-address": saved.address
        };

        Object.entries(fields).forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (field && value) field.value = value;
        });

        const toggle = document.getElementById("save-default-address");
        if (toggle) toggle.checked = true;
    } catch (error) {
        console.error("Không đọc được địa chỉ mặc định:", error);
    }
}

function checkoutSaveDefaultAddress(formData) {
    const toggle = document.getElementById("save-default-address");

    if (!toggle?.checked) return;

    const address = {
        receiverName: String(formData.get("receiverName") || "").trim(),
        receiverPhone: String(formData.get("receiverPhone") || "").trim(),
        receiverEmail: String(formData.get("receiverEmail") || "").trim(),
        province: String(formData.get("province") || "").trim(),
        ward: String(formData.get("ward") || "").trim(),
        address: String(formData.get("address") || "").trim()
    };

    localStorage.setItem(DEFAULT_ADDRESS_KEY, JSON.stringify(address));
}

function checkoutBindPaymentMethods() {
    const detail = document.getElementById("payment-detail");

    document.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
        input.addEventListener("change", () => {
            const messages = {
                cod: "",
                bank: "Thông tin tài khoản nhận chuyển khoản sẽ hiển thị sau khi Cheri tích hợp thanh toán ngân hàng.",
                ewallet: "Thanh toán ví điện tử sẽ khả dụng sau khi tích hợp cổng ví được hỗ trợ.",
                card: "Thanh toán thẻ sẽ khả dụng sau khi tích hợp cổng thanh toán bảo mật."
            };

            const message = messages[input.value] || "";
            detail.textContent = message;
            detail.hidden = !message;
        });
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    let submitButton = null;

    try {
        submitButton = document.getElementById("checkout-submit");

        if (submitButton) {
            submitButton.disabled = true;
        }

        checkoutProducts = checkoutReadProducts();

        checkoutRenderProducts();
        checkoutBindAddressEvents();
        checkoutBindForm();
        checkoutLoadDefaultAddress();
        checkoutBindPaymentMethods();

        await checkoutLoadProvinces();
        await checkoutRestorePendingSnapshot();

        checkoutInitializationComplete = true;

        if (submitButton && !checkoutRecoveryBlocked) {
            submitButton.disabled = false;
        }
    } catch (error) {
        console.error("Không thể hoàn tất khởi tạo checkout:", error);

        checkoutRecoveryBlocked = true;
        checkoutInitializationComplete = false;

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            checkoutBlockRecovery(
                "Không thể kiểm tra yêu cầu đặt hàng trước đó. " +
                "Để tránh tạo đơn trùng, thao tác đặt hàng đã bị khóa. " +
                "Vui lòng tải lại trang hoặc kiểm tra lịch sử đơn hàng."
            );
        } catch (recoveryError) {
            console.error(
                "Không thể hiển thị thông báo lỗi khôi phục checkout:",
                recoveryError
            );
        }
    }
});

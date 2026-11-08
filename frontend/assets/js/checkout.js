
"use strict";

const CHECKOUT_CART_KEY = cheriStorageKey("cheri_checkout_items");
const CART_STORAGE_KEY = cheriStorageKey("cheri_cart");
const BUY_NOW_KEY = cheriStorageKey("cheri_buy_now");

const ADDRESS_API = "https://www.tinhthanhpho.com/api/v1";

let checkoutProducts = [];
let provinceList = [];
let wardList = [];

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
    if (params.get("mode") === "buy-now") {
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

function checkoutBindForm() {
    const form = document.getElementById("checkout-form");

    async function checkoutSubmitOrder(formData) {
        const submitButton = document.getElementById("checkout-submit");

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

        const payload = {
            recipientName,
            phone,
            email: email || null,
            province,
            ward,
            shippingAddress: address,
            note,
            paymentMethod,
            items
        };

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.dataset.originalText =
                submitButton.textContent || "Đặt hàng";
            submitButton.textContent = "Đang xử lý...";
        }

        try {
            const token = localStorage.getItem("cheri_auth_token");

            const headers = {
                "Content-Type": "application/json"
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
                throw new Error(
                    result.message ||
                    "Không thể tạo đơn hàng. Vui lòng thử lại."
                );
            }

            // Chỉ lưu bản xác nhận sau khi server đã tạo đơn thành công
            const confirmedOrder = {
                orderCode: result.order.orderCode,
                orderId: result.order.id,
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

            localStorage.setItem(
                cheriStorageKey ("cheri_order_confirmation"),
                JSON.stringify(confirmedOrder)
            );

            // Chỉ xóa dữ liệu thanh toán tạm sau khi API xác nhận thành công
            const params = new URLSearchParams(window.location.search);
            const isBuyNow = params.get("mode") === "buy-now";

            localStorage.removeItem(CHECKOUT_CART_KEY);
            localStorage.removeItem(BUY_NOW_KEY);

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
            window.location.href =
                "order-success.html?code=" +
                encodeURIComponent(result.order.orderCode);

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

            // Giữ chức năng lưu địa chỉ mặc định đang có
            try {
                checkoutSaveDefaultAddress(formData);
            } catch (error) {
                console.error(
                    "Không thể lưu địa chỉ mặc định:",
                    error
                );
            }

            await checkoutSubmitOrder(formData);
        });
    }

const DEFAULT_ADDRESS_KEY = "cheri_default_address";

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
    checkoutProducts = checkoutReadProducts();

    checkoutRenderProducts();
    checkoutBindAddressEvents();
    checkoutBindForm();
    checkoutLoadDefaultAddress();
    checkoutBindPaymentMethods();

    await checkoutLoadProvinces();
});

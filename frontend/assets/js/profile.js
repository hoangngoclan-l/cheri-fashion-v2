"use strict";

(() => {
    const API_BASE = "/api/profile";
    const TOKEN_KEY = "cheri_auth_token";
    const USER_KEY = "cheri_auth_user";

    const $ = (selector) => document.querySelector(selector);

    const profileForm = $("#profile-form");
    const addressForm = $("#address-form");
    const addressesList = $("#addresses-list");

    let addresses = [];
    let editingAddressId = null;

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function redirectToAccount() {
        window.location.replace("account.html");
    }

    function showMessage(element, message, type = "success") {
        if (!element) return;

        element.textContent = message;
        element.className = `profile-message show ${type}`;
    }

    function clearMessage(element) {
        if (!element) return;

        element.textContent = "";
        element.className = "profile-message";
    }

    async function apiRequest(url, options = {}) {
        const token = getToken();

        if (!token) {
            redirectToAccount();
            throw new Error("Bạn cần đăng nhập để tiếp tục.");
        }

        const headers = {
            Authorization: `Bearer ${token}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            redirectToAccount();
            throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("Máy chủ trả về dữ liệu không hợp lệ.");
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Đã xảy ra lỗi. Vui lòng thử lại.");
        }

        return result;
    }

    function normalizeAddress(address) {
        return {
            id: address.id ?? address.address_id ?? address.addressId,
            recipientName:
                address.recipient_name ?? address.recipientName ?? "",
            phone: address.phone ?? "",
            province: address.province ?? "",
            district: address.district ?? "",
            ward: address.ward ?? "",
            streetAddress:
                address.street_address ?? address.streetAddress ?? "",
            isDefault: Boolean(
                address.is_default ?? address.isDefault ?? false
            )
        };
    }

    function fillProfile(user) {
        $("#profile-full-name").value =
            user.full_name ?? user.fullName ?? "";

        $("#profile-email").value = user.email ?? "";

        $("#profile-phone").value = user.phone ?? "";
    }

    async function loadProfile() {
        const result = await apiRequest(API_BASE);
        const user = result.user;

        if (!user) {
            throw new Error("Không tìm thấy thông tin tài khoản.");
        }

        fillProfile(user);

        addresses = Array.isArray(result.addresses)
            ? result.addresses.map(normalizeAddress)
            : [];

        renderAddresses();
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;

        return element;
    }

    function renderAddresses() {
        addressesList.replaceChildren();

        if (addresses.length === 0) {
            addressesList.append(
                createElement(
                    "div",
                    "profile-empty",
                    "Bạn chưa lưu địa chỉ giao hàng nào. Hãy thêm địa chỉ bên dưới."
                )
            );
            return;
        }

        addresses.forEach((address) => {
            const card = createElement(
                "article",
                `profile-address-item${address.isDefault ? " is-default" : ""}`
            );

            const title = createElement("div", "profile-address-title");

            title.append(
                createElement("strong", "", address.recipientName || "Người nhận")
            );

            if (address.isDefault) {
                title.append(
                    createElement("span", "profile-default-label", "Mặc định")
                );
            }

            card.append(title);

            card.append(
                createElement("p", "", `Điện thoại: ${address.phone || "Chưa có"}`)
            );

            card.append(
                createElement(
                    "p",
                    "",
                    [
                        address.streetAddress,
                        address.ward,
                        address.district,
                        address.province
                    ].filter(Boolean).join(", ")
                )
            );

            const actions = createElement("div", "profile-address-actions");

            const editButton = createElement("button", "profile-btn secondary", "Sửa");
            editButton.type = "button";
            editButton.addEventListener("click", () => startEditAddress(address));

            actions.append(editButton);

            if (!address.isDefault) {
                const defaultButton = createElement(
                    "button",
                    "profile-btn secondary",
                    "Đặt mặc định"
                );

                defaultButton.type = "button";
                defaultButton.addEventListener("click", () => setDefaultAddress(address.id));

                actions.append(defaultButton);
            }

            const deleteButton = createElement("button", "profile-btn danger", "Xóa");
            deleteButton.type = "button";
            deleteButton.addEventListener("click", () => deleteAddress(address));

            actions.append(deleteButton);
            card.append(actions);
            addressesList.append(card);
        });
    }

    function resetAddressForm() {
        addressForm.reset();
        $("#address-id").value = "";
        $("#address-form-title").textContent = "Thêm địa chỉ mới";
        $("#address-save").textContent = "Lưu địa chỉ";
        $("#address-cancel-edit").hidden = true;
        editingAddressId = null;
    }

    function startEditAddress(address) {
        editingAddressId = String(address.id);

        $("#address-id").value = editingAddressId;
        $("#address-recipient-name").value = address.recipientName;
        $("#address-phone").value = address.phone;
        $("#address-province").value = address.province;
        $("#address-district").value = address.district;
        $("#address-ward").value = address.ward;
        $("#address-street-address").value = address.streetAddress;
        $("#address-is-default").checked = address.isDefault;

        $("#address-form-title").textContent = "Chỉnh sửa địa chỉ";
        $("#address-save").textContent = "Cập nhật địa chỉ";
        $("#address-cancel-edit").hidden = false;

        clearMessage($("#address-message"));

        $("#address-form-section").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        $("#address-recipient-name").focus({ preventScroll: true });
    }

    async function saveProfile(event) {
        event.preventDefault();

        const message = $("#profile-message");
        const button = $("#profile-save");

        clearMessage(message);
        button.disabled = true;

        const payload = {
            fullName: $("#profile-full-name").value.trim(),
            phone: $("#profile-phone").value.trim()
        };

        try {
            const result = await apiRequest(API_BASE, {
                method: "PUT",
                body: JSON.stringify(payload)
            });

            if (result.user) {
                fillProfile(result.user);

                try {
                    const savedUser = JSON.parse(
                        localStorage.getItem(USER_KEY) || "{}"
                    );

                    savedUser.fullName =
                        result.user.full_name ??
                        result.user.fullName ??
                        payload.fullName;

                    savedUser.phone = result.user.phone ?? payload.phone;

                    localStorage.setItem(USER_KEY, JSON.stringify(savedUser));
                } catch (storageError) {
                    console.warn("Không thể cập nhật dữ liệu người dùng lưu cục bộ.");
                }
            }

            showMessage(
                message,
                result.message || "Cập nhật thông tin cá nhân thành công."
            );
        } catch (error) {
            showMessage(message, error.message, "error");
        } finally {
            button.disabled = false;
        }
    }

    async function saveAddress(event) {
        event.preventDefault();

        const message = $("#address-message");
        const button = $("#address-save");

        clearMessage(message);
        button.disabled = true;

        const payload = {
            recipientName: $("#address-recipient-name").value.trim(),
            phone: $("#address-phone").value.trim(),
            province: $("#address-province").value.trim(),
            district: $("#address-district").value.trim(),
            ward: $("#address-ward").value.trim(),
            streetAddress: $("#address-street-address").value.trim(),
            isDefault: $("#address-is-default").checked
        };

        const isEditing = editingAddressId !== null;
        const url = isEditing
            ? `${API_BASE}/addresses/${encodeURIComponent(editingAddressId)}`
            : `${API_BASE}/addresses`;

        try {
            const result = await apiRequest(url, {
                method: isEditing ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });

            resetAddressForm();
            await loadProfile();

            showMessage(
                message,
                result.message ||
                    (isEditing
                        ? "Cập nhật địa chỉ thành công."
                        : "Thêm địa chỉ thành công.")
            );
        } catch (error) {
            showMessage(message, error.message, "error");
        } finally {
            button.disabled = false;
        }
    }

    async function setDefaultAddress(id) {
        if (id === undefined || id === null) {
            showMessage(
                $("#address-message"),
                "Không xác định được địa chỉ cần cập nhật.",
                "error"
            );
            return;
        }

        clearMessage($("#address-message"));

        try {
            const result = await apiRequest(
                `${API_BASE}/addresses/${encodeURIComponent(id)}/default`,
                { method: "PATCH" }
            );

            await loadProfile();

            showMessage(
                $("#address-message"),
                result.message || "Đã cập nhật địa chỉ mặc định."
            );
        } catch (error) {
            showMessage($("#address-message"), error.message, "error");
        }
    }

    async function deleteAddress(address) {
        if (!window.confirm(
            `Bạn có chắc muốn xóa địa chỉ của ${address.recipientName || "người nhận này"}?`
        )) {
            return;
        }

        clearMessage($("#address-message"));

        try {
            const result = await apiRequest(
                `${API_BASE}/addresses/${encodeURIComponent(address.id)}`,
                { method: "DELETE" }
            );

            resetAddressForm();
            await loadProfile();

            showMessage(
                $("#address-message"),
                result.message || "Đã xóa địa chỉ."
            );
        } catch (error) {
            showMessage($("#address-message"), error.message, "error");
        }
    }

    function logout() {
        // Xóa phiên đăng nhập hiện tại trên trình duyệt.
        // Không xóa dữ liệu tài khoản hay địa chỉ trong MySQL.
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        redirectToAccount();
    }

    async function init() {
        if (!getToken()) {
            redirectToAccount();
            return;
        }

        profileForm.addEventListener("submit", saveProfile);
        addressForm.addEventListener("submit", saveAddress);

        $("#address-cancel-edit").addEventListener("click", () => {
            resetAddressForm();
            clearMessage($("#address-message"));
        });

        $("#profile-logout").addEventListener("click", (event) => {
            event.preventDefault();
            logout();
        });

        try {
            await loadProfile();
        } catch (error) {
            showMessage($("#profile-message"), error.message, "error");
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})();

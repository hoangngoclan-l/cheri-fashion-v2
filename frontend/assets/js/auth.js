"use strict";

const CHERI_AUTH = {
    tokenKey: "cheri_auth_token",
    userKey: "cheri_auth_user",

    getToken() {
        return localStorage.getItem(this.tokenKey);
    },

    getUser() {
        try {
            return JSON.parse(localStorage.getItem(this.userKey) || "null");
        } catch {
            return null;
        }
    },

    saveSession(data) {
        if (!data || !data.success || !data.token || !data.user) {
            throw new Error("Phản hồi đăng nhập không hợp lệ.");
        }

        localStorage.setItem(this.tokenKey, data.token);
        localStorage.setItem(this.userKey, JSON.stringify(data.user));
    },

    logout() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        window.location.href = "account.html";
    }
};

function authShowMessage(message, type = "error") {
    const box = document.getElementById("auth-message");
    if (!box) return;

    box.textContent = message;
    box.hidden = false;
    box.dataset.type = type;
}

function authSetLoading(form, loading) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Đang xử lý...";
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Tiếp tục";
    }
}

async function authSendRequest(endpoint, payload) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
        throw new Error(data.message || "Có lỗi xảy ra. Vui lòng thử lại.");
    }

    return data;
}

function authBindLogin() {
    const form = document.getElementById("login-form");
    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        authShowMessage("");

        const formData = new FormData(form);
        const email = String(formData.get("email") || "").trim();
        const password = String(formData.get("password") || "");

        authSetLoading(form, true);

        try {
            const data = await authSendRequest("/api/auth/login", {
                email,
                password
            });

            CHERI_AUTH.saveSession(data);
            authShowMessage("Đăng nhập thành công. Đang chuyển trang...", "success");

            const params = new URLSearchParams(window.location.search);
            const next = params.get("next");

            // Chỉ cho phép chuyển đến đường dẫn nội bộ tương đối.
            const safeNext =
                next &&
                !next.startsWith("//") &&
                !next.includes("://") &&
                !next.startsWith("/") &&
                !next.includes("\\")
                    ? next
                    : "index.html";

            window.location.href = safeNext;
        } catch (error) {
            authShowMessage(error.message || "Không thể đăng nhập.");
        } finally {
            authSetLoading(form, false);
        }
    });
}

function authBindRegister() {
    const form = document.getElementById("register-form");
    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        authShowMessage("");

        const formData = new FormData(form);
        const fullName = String(formData.get("fullName") || "").trim();
        const email = String(formData.get("email") || "").trim();
        const phone = String(formData.get("phone") || "").trim();
        const password = String(formData.get("password") || "");
        const confirmPassword = String(formData.get("confirmPassword") || "");

        if (password !== confirmPassword) {
            authShowMessage("Mật khẩu xác nhận không khớp.");
            return;
        }

        if (password.length < 8 || password.length > 72) {
            authShowMessage("Mật khẩu phải có từ 8 đến 72 ký tự.");
            return;
        }

        authSetLoading(form, true);

        try {
            const data = await authSendRequest("/api/auth/register", {
                fullName,
                email,
                phone,
                password
            });

            CHERI_AUTH.saveSession(data);
            authShowMessage("Đăng ký thành công. Đang chuyển trang...", "success");

            window.location.href = "index.html";
        } catch (error) {
            authShowMessage(error.message || "Không thể đăng ký.");
        } finally {
            authSetLoading(form, false);
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    authBindLogin();
    authBindRegister();
});


/**
 * Đồng bộ menu tài khoản với Header CHERI.
 * Giữ nguyên cấu trúc và giao diện Header hiện tại.
 */



function updateCheriAccountMenu() {
    const menu = document.getElementById("account-menu");
    const trigger = document.getElementById("account-toggle");

    if (!menu || !trigger) return;

    const token = CHERI_AUTH.getToken();
    const user = CHERI_AUTH.getUser();
    const loggedIn = Boolean(token && user);

    const name = String(
        user?.fullName || user?.full_name || user?.name || ""
    ).trim();

    const email = String(user?.email || "").trim();

    const get = id => document.getElementById(id);

    const label = get("account-trigger-label");
    const heading = get("account-menu-heading");
    const userInfo = get("account-menu-user");
    const nameElement = get("account-menu-user-name");
    const emailElement = get("account-menu-user-email");
    const orders = get("account-orders-link");
    const profile = get("account-profile-link");
    const login = get("account-login-link");
    const logout = get("account-logout-button");

    if (label) {
        label.textContent = loggedIn ? (name || "Tài khoản") : "Tài khoản";
    }

    trigger.setAttribute(
        "aria-label",
        loggedIn && name ? `Tài khoản ${name}` : "Tài khoản"
    );

    if (heading) {
        heading.textContent = loggedIn
            ? `Xin chào, ${name || "Khách hàng"}!`
            : "Tài khoản của bạn";
    }

    if (userInfo) userInfo.hidden = !loggedIn;

    if (nameElement) {
        nameElement.textContent = loggedIn ? name : "";
    }

    if (emailElement) {
        emailElement.textContent = loggedIn ? email : "";
        emailElement.hidden = !loggedIn || !email;
    }

    if (orders) orders.hidden = !loggedIn;
    if (profile) profile.hidden = !loggedIn;
    if (login) login.hidden = loggedIn;
    if (logout) logout.hidden = !loggedIn;

    if (logout && logout.dataset.authBound !== "true") {
        logout.dataset.authBound = "true";
        logout.addEventListener("click", () => CHERI_AUTH.logout());
    }
}

window.updateCheriAccountMenu = updateCheriAccountMenu;


// Cập nhật nếu Header đã tồn tại khi trang tải.
document.addEventListener("DOMContentLoaded", () => {
    updateCheriAccountMenu();
});

// Đồng bộ khi tài khoản thay đổi ở tab khác.
window.addEventListener("storage", event => {
    if (
        event.key === CHERI_AUTH.tokenKey ||
        event.key === CHERI_AUTH.userKey
    ) {
        updateCheriAccountMenu();
    }
});


"use strict";

window.CheriCommerceAPI = {
    getToken() {
        return localStorage.getItem("cheri_auth_token") || "";
    },

    isLoggedIn() {
        return Boolean(this.getToken());
    },

    async request(endpoint, options = {}) {
        const token = this.getToken();

        const headers = {
            ...(options.headers || {})
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(endpoint, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(
                data.message || `Yêu cầu thất bại (${response.status})`
            );
        }

        return data;
    },

    async getCart() {
        return this.request("/api/cart");
    },

    async addToCart(item) {
        return this.request("/api/cart", {
            method: "POST",
            body: JSON.stringify({
                productId: Number(item.id),
                size: item.size || "",
                color: item.color || "",
                quantity: Number(item.quantity) || 1
            })
        });
    },

    async getWishlist() {
        return this.request("/api/wishlist");
    },

    async addToWishlist(productId) {
        return this.request("/api/wishlist", {
            method: "POST",
            body: JSON.stringify({
                productId: Number(productId)
            })
        });
    },

    async removeFromWishlist(productId) {
        return this.request(
            `/api/wishlist/${encodeURIComponent(productId)}`,
            { method: "DELETE" }
        );
    }
};

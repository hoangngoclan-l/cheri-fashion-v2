"use strict";

(() => {
    const STORAGE_PREFIX = "cheri_support_chat";
    const $ = (id) => document.getElementById(id);
    const authToken = () => localStorage.getItem("cheri_auth_token") || "";
    const user = () => {
        try { return JSON.parse(localStorage.getItem("cheri_auth_user") || "null"); }
        catch { return null; }
    };
    const identity = () => {
        const account = user();
        return account?.id || account?.userId || account?.user_id || "guest";
    };
    const storageKey = () => STORAGE_PREFIX + "_" + encodeURIComponent(identity());
    const readState = () => {
        try { return JSON.parse(localStorage.getItem(storageKey()) || "{}"); }
        catch { return {}; }
    };
    const saveState = state => localStorage.setItem(storageKey(), JSON.stringify(state));
    const headers = (state, json = false) => ({
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(authToken() ? { Authorization: "Bearer " + authToken() } : {}),
        ...(state.guestSession ? { "X-Cheri-Chat-Session": state.guestSession } : {})
    });
    const api = async (url, options = {}, state = readState()) => {
        const response = await fetch(url, { ...options, headers: { ...headers(state, Boolean(options.body)), ...(options.headers || {}) } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || "Không thể kết nối hỗ trợ CHERI.");
        return data;
    };

    function mount() {
        if (document.getElementById("cheri-chat-widget")) return;
        const style = document.createElement("link");
        style.rel = "stylesheet";
        style.href = "/frontend/assets/css/chat-widget.css";
        document.head.appendChild(style);
        const root = document.createElement("section");
        root.id = "cheri-chat-widget";
        root.innerHTML = `
            <button type="button" class="cheri-chat-launcher" id="cheri-chat-launcher" aria-expanded="false" aria-controls="cheri-chat-panel">
                <span class="cheri-chat-launcher-icon" aria-hidden="true">♡</span><span>CHERI tư vấn</span>
            </button>
            <div class="cheri-chat-panel" id="cheri-chat-panel" hidden>
                <header class="cheri-chat-header">
                    <div><strong>CHERI. Assistant</strong><small>Tư vấn mua sắm & hỗ trợ khách hàng</small></div>
                    <button type="button" id="cheri-chat-close" aria-label="Thu nhỏ">−</button>
                </header>
                <div class="cheri-chat-notice">AI tư vấn dựa trên dữ liệu cửa hàng. Tra cứu đơn hàng cần đăng nhập.</div>
                <div class="cheri-chat-messages" id="cheri-chat-messages" aria-live="polite">
                    <div class="cheri-chat-bubble assistant">Xin chào! Bạn cần tư vấn sản phẩm, size, màu sắc hay hỗ trợ mua hàng?</div>
                </div>
                <div class="cheri-chat-actions"><button type="button" id="cheri-chat-human">Gặp nhân viên</button><a href="/frontend/pages/account.html" id="cheri-chat-login" hidden>Đăng nhập để tra cứu đơn</a></div>
                <form class="cheri-chat-form" id="cheri-chat-form">
                    <input id="cheri-chat-input" maxlength="2000" placeholder="Nhập câu hỏi của bạn..." autocomplete="off" required>
                    <button type="submit" aria-label="Gửi tin nhắn">Gửi</button>
                </form>
                <div class="cheri-chat-error" id="cheri-chat-error" role="status"></div>
            </div>`;
        document.body.appendChild(root);
        bind();
        initialize().catch(showError);
    }

    function bubble(sender, content) {
        const node = document.createElement("div");
        node.className = "cheri-chat-bubble " + (sender === "customer" ? "customer" : "assistant");
        node.textContent = content;
        $("cheri-chat-messages").appendChild(node);
        $("cheri-chat-messages").scrollTop = $("cheri-chat-messages").scrollHeight;
    }
    function showError(error) { $("cheri-chat-error").textContent = error.message || "Đã xảy ra lỗi."; }
    function clearError() { $("cheri-chat-error").textContent = ""; }

    async function refreshHistory() {
        const state = readState();
        if (!state.conversationId || $("cheri-chat-panel")?.hidden) return;
        try {
            const data = await api("/api/chat/conversations/" + encodeURIComponent(state.conversationId) + "/messages", {}, state);
            const box = $("cheri-chat-messages");
            const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 70;
            box.innerHTML = "";
            data.messages.forEach(message => bubble(message.sender_type, message.content));
            if (nearBottom) box.scrollTop = box.scrollHeight;
        } catch (error) {
            // Không làm gián đoạn chat nếu mạng tạm thời mất kết nối.
        }
    }

    async function initialize() {
        const state = readState();
        if (state.conversationId) {
            try {
                const data = await api("/api/chat/conversations/" + encodeURIComponent(state.conversationId) + "/messages", {}, state);
                $("cheri-chat-messages").innerHTML = "";
                data.messages.forEach(message => bubble(message.sender_type, message.content));
                return;
            } catch {
                saveState({});
            }
        }
        const fresh = readState();
        const data = await api("/api/chat/conversations", { method: "POST", body: JSON.stringify({ subject: "Tư vấn mua sắm CHERI" }) }, fresh);
        saveState({ conversationId: data.conversationId, guestSession: data.guestSession || fresh.guestSession || null });
    }
    async function sendMessage(content) {
        clearError();
        const input = $("cheri-chat-input");
        const submit = $("cheri-chat-form").querySelector("button");
        input.disabled = true; submit.disabled = true;
        bubble("customer", content);
        try {
            let state = readState();
            if (!state.conversationId) {
                await initialize();
                state = readState();
            }
            const data = await api("/api/chat/conversations/" + encodeURIComponent(state.conversationId) + "/messages", {
                method: "POST", body: JSON.stringify({ content })
            }, state);
            bubble("assistant", data.answer);
            $("cheri-chat-login").hidden = !data.needsLogin;
        } catch (error) { showError(error); }
        finally { input.disabled = false; submit.disabled = false; input.focus(); }
    }
    function bind() {
        $("cheri-chat-launcher").addEventListener("click", () => {
            const panel = $("cheri-chat-panel");
            panel.hidden = !panel.hidden;
            $("cheri-chat-launcher").setAttribute("aria-expanded", String(!panel.hidden));
            if (!panel.hidden) $("cheri-chat-input").focus();
        });
        $("cheri-chat-close").addEventListener("click", () => {
            $("cheri-chat-panel").hidden = true;
            $("cheri-chat-launcher").setAttribute("aria-expanded", "false");
        });
        $("cheri-chat-form").addEventListener("submit", event => {
            event.preventDefault();
            const input = $("cheri-chat-input");
            const value = input.value.trim();
            if (!value) return;
            input.value = "";
            sendMessage(value);
        });
        $("cheri-chat-human").addEventListener("click", () => sendMessage("Tôi muốn gặp nhân viên tư vấn trực tiếp."));
        window.setInterval(refreshHistory, 7000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
})();

"use strict";

const express = require("express");
const crypto = require("crypto");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { pool } = require("../config/database");

const router = express.Router();
const SESSION_HEADER = "x-cheri-chat-session";
const ORDER_INTENT = /đơn hàng|mã đơn|đơn của tôi|đơn đã đặt|trạng thái đơn|đơn gần đây|theo dõi đơn/i;
const HUMAN_INTENT = /gặp nhân viên|nhân viên tư vấn|nói chuyện với người thật|gặp người thật|khiếu nại|hoàn tiền|tranh chấp|lỗi thanh toán/i;

function hash(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}
function cleanText(value, max = 2000) {
    return String(value || "").trim().slice(0, max);
}
function getBearer(req) {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");
    return parts.length === 2 && parts[0] === "Bearer" ? parts[1] : "";
}
function optionalCustomerAuth(req, res, next) {
    if (!req.headers.authorization) {
        req.user = null;
        return next();
    }
    return authMiddleware(req, res, next);
}
function sessionToken(req) {
    return cleanText(req.get(SESSION_HEADER), 160);
}
async function findConversation(req, id) {
    const token = sessionToken(req);
    const [rows] = await pool.execute(
        "SELECT * FROM chat_conversations WHERE id = ? LIMIT 1", [id]
    );
    if (!rows.length) return null;
    const conversation = rows[0];
    if (req.user) {
        return String(conversation.user_id || "") === String(req.user.id) ? conversation : null;
    }
    if (!token || conversation.user_id !== null || conversation.guest_session_hash !== hash(token)) return null;
    return conversation;
}
async function addMessage(executor, conversationId, senderType, content, senderUserId = null, metadata = null) {
    await executor.execute(
        "INSERT INTO chat_messages (conversation_id, sender_type, sender_user_id, content, metadata) VALUES (?, ?, ?, ?, ?)",
        [conversationId, senderType, senderUserId, content, metadata ? JSON.stringify(metadata) : null]
    );
    await executor.execute(
        "UPDATE chat_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?",
        [conversationId]
    );
}
async function getProductContext(message) {
    const terms = [...new Set(message.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(word => word.length >= 3))].slice(0, 6);
    const where = ["p.status = 'active'"];
    const params = [];
    if (terms.length) {
        where.push("(" + terms.map(() => "(p.name LIKE ? OR p.category LIKE ? OR p.description LIKE ?)").join(" OR ") + ")");
        for (const term of terms) params.push("%" + term + "%", "%" + term + "%", "%" + term + "%");
    }
    const [products] = await pool.execute(
        `SELECT p.id, p.name, p.category, p.price, p.old_price, p.stock, p.description
         FROM products p WHERE ${where.join(" AND ")}
         ORDER BY p.is_new DESC, p.id DESC LIMIT 8`,
        params
    );
    if (!products.length) return [];
    const ids = products.map(item => Number(item.id));
    const [variants] = await pool.query(
        "SELECT product_id, sku, size, color_name, price, stock FROM product_variants WHERE status = 'active' AND product_id IN (" + ids.map(() => "?").join(",") + ") ORDER BY product_id, id",
        ids
    );
    return products.map(product => ({
        ...product,
        variants: variants.filter(variant => Number(variant.product_id) === Number(product.id))
    }));
}
async function generateAssistantReply(message, products, orderContext) {
    if (!process.env.OPENAI_API_KEY) {
        return {
            answer: "Hiện hệ thống tư vấn AI chưa được cấu hình. Bạn có thể để lại yêu cầu để nhân viên CHERI hỗ trợ trực tiếp.",
            handoff: true,
            reason: "ai_not_configured"
        };
    }
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const system = [
        "Bạn là trợ lý tư vấn mua sắm chính thức của CHERI Fashion, trả lời bằng tiếng Việt, lịch sự và ngắn gọn.",
        "Chỉ được dùng dữ liệu sản phẩm và đơn hàng trong CONTEXT. Không suy đoán giá, tồn kho, màu, size, chính sách hay trạng thái đơn.",
        "Nếu không đủ dữ liệu để trả lời chắc chắn, hãy yêu cầu chuyển nhân viên bằng handoff=true.",
        "Không được yêu cầu khách gửi mật khẩu, OTP, số thẻ hoặc dữ liệu thanh toán nhạy cảm.",
        "Chỉ được trả về JSON hợp lệ đúng dạng: {\"answer\":\"...\",\"handoff\":false}.",
        "Nếu khách cần nhân viên, có khiếu nại, hoàn tiền hoặc lỗi thanh toán, handoff=true."
    ].join("\\n");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                { role: "user", content: "CONTEXT MYSQL:\\n" + JSON.stringify({ products, orderContext }) + "\\n\\nCÂU HỎI KHÁCH:\\n" + message }
            ]
        }),
        signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error("OpenAI chat error:", response.status, errorBody.slice(0, 500));
        return { answer: "Tôi chưa thể xác minh thông tin để trả lời chính xác. Tôi sẽ chuyển yêu cầu sang nhân viên CHERI.", handoff: true, reason: "ai_service_error" };
    }
    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content || "";
    try {
        const parsed = JSON.parse(raw);
        const answer = cleanText(parsed.answer, 3000);
        if (!answer || typeof parsed.handoff !== "boolean") throw new Error("Invalid AI response");
        return { answer, handoff: parsed.handoff, reason: parsed.handoff ? "ai_requested_handoff" : null };
    } catch {
        return { answer: "Tôi chưa thể xác minh thông tin này. Tôi sẽ chuyển yêu cầu sang nhân viên CHERI.", handoff: true, reason: "invalid_ai_response" };
    }
}

// Tạo cuộc trò chuyện. Khách vãng lai nhận một khóa phiên riêng, không phải khóa đăng nhập.
router.post("/conversations", optionalCustomerAuth, async (req, res) => {
    try {
        const id = crypto.randomUUID();
        const guestToken = req.user ? null : crypto.randomBytes(32).toString("hex");
        await pool.execute(
            "INSERT INTO chat_conversations (id, user_id, guest_session_hash, subject) VALUES (?, ?, ?, ?)",
            [id, req.user?.id || null, guestToken ? hash(guestToken) : null, cleanText(req.body.subject, 180) || null]
        );
        return res.status(201).json({ success: true, conversationId: id, guestSession: guestToken });
    } catch (error) {
        console.error("Create chat conversation failed:", error);
        return res.status(500).json({ success: false, message: "Không thể khởi tạo cuộc trò chuyện." });
    }
});

router.get("/conversations/:id/messages", optionalCustomerAuth, async (req, res) => {
    try {
        const conversation = await findConversation(req, req.params.id);
        if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy cuộc trò chuyện." });
        const [messages] = await pool.execute(
            "SELECT id, sender_type, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 200",
            [conversation.id]
        );
        return res.json({ success: true, status: conversation.status, messages });
    } catch (error) {
        console.error("Load chat messages failed:", error);
        return res.status(500).json({ success: false, message: "Không thể tải lịch sử trò chuyện." });
    }
});

router.post("/conversations/:id/messages", optionalCustomerAuth, async (req, res) => {
    const message = cleanText(req.body.content);
    if (!message || message.length < 1) return res.status(400).json({ success: false, message: "Tin nhắn không được để trống." });
    try {
        const conversation = await findConversation(req, req.params.id);
        if (!conversation) return res.status(404).json({ success: false, message: "Không tìm thấy cuộc trò chuyện." });
        if (conversation.status === "closed") return res.status(409).json({ success: false, message: "Cuộc trò chuyện đã kết thúc. Hãy mở cuộc trò chuyện mới." });
        await addMessage(pool, conversation.id, "customer", message, req.user?.id || null);

        if (ORDER_INTENT.test(message) && !req.user) {
            const answer = "Để tra cứu đơn hàng và thông tin cá nhân, bạn cần đăng nhập tài khoản CHERI trước. Chatbox không thể xác minh đơn hàng bằng phiên khách vãng lai.";
            await addMessage(pool, conversation.id, "assistant", answer);
            return res.json({ success: true, answer, needsLogin: true, handoff: false });
        }
        if (HUMAN_INTENT.test(message)) {
            const answer = "Tôi sẽ ghi nhận yêu cầu hỗ trợ trực tiếp. Nhân viên CHERI sẽ tiếp nhận khi có người nhận cuộc trò chuyện.";
            await pool.execute("UPDATE chat_conversations SET status = 'waiting_admin' WHERE id = ?", [conversation.id]);
            await addMessage(pool, conversation.id, "assistant", answer, null, { handoff: true, reason: "customer_requested_human" });
            return res.json({ success: true, answer, handoff: true });
        }
        if (conversation.status === "admin_active" || conversation.status === "waiting_admin") {
            const answer = "Yêu cầu của bạn đang ở hàng đợi hỗ trợ của nhân viên CHERI. Vui lòng chờ phản hồi trong cuộc trò chuyện này.";
            await addMessage(pool, conversation.id, "assistant", answer);
            return res.json({ success: true, answer, handoff: true });
        }

        const products = await getProductContext(message);
        let orderContext = [];
        if (req.user && ORDER_INTENT.test(message)) {
            const [orders] = await pool.execute(
                "SELECT id, order_code, order_status, payment_status, total_amount, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
                [req.user.id]
            );
            orderContext = orders;
        }
        const ai = await generateAssistantReply(message, products, orderContext);
        const [[latestConversation]] = await pool.execute(
            "SELECT status FROM chat_conversations WHERE id = ? LIMIT 1",
            [conversation.id]
        );
        // Nếu nhân viên vừa nhận cuộc trò chuyện trong lúc AI đang xử lý,
        // không ghi hoặc gửi câu trả lời AI để tránh hai bên trả lời đồng thời.
        if (!latestConversation || latestConversation.status === "admin_active" || latestConversation.status === "closed") {
            return res.json({ success: true, answer: "Cuộc trò chuyện đang được nhân viên CHERI tiếp nhận. Vui lòng chờ phản hồi.", handoff: true });
        }
        if (ai.handoff) await pool.execute("UPDATE chat_conversations SET status = 'waiting_admin' WHERE id = ? AND status = 'ai_active'", [conversation.id]);
        await addMessage(pool, conversation.id, "assistant", ai.answer, null, { handoff: ai.handoff, reason: ai.reason || null });
        return res.json({ success: true, answer: ai.answer, handoff: ai.handoff });
    } catch (error) {
        console.error("Send chat message failed:", error);
        return res.status(500).json({ success: false, message: "Không thể gửi tin nhắn lúc này." });
    }
});

// Admin inbox API. Tất cả endpoint bên dưới bắt buộc role admin.
router.use("/admin", adminMiddleware);
router.get("/admin/conversations", async (req, res) => {
    try {
        const status = cleanText(req.query.status, 30);
        const allowed = ["ai_active", "waiting_admin", "admin_active", "closed"];
        const where = allowed.includes(status) ? "WHERE c.status = ?" : "";
        const params = allowed.includes(status) ? [status] : [];
        const [rows] = await pool.execute(
            `SELECT c.id, c.user_id, c.status, c.subject, c.assigned_admin_id, c.last_message_at, c.created_at,
                    u.full_name AS customer_name, u.email AS customer_email,
                    (SELECT m.content FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message
             FROM chat_conversations c LEFT JOIN users u ON u.id = c.user_id
             ${where} ORDER BY c.last_message_at DESC LIMIT 100`,
            params
        );
        return res.json({ success: true, conversations: rows });
    } catch (error) {
        console.error("Admin chat inbox failed:", error);
        return res.status(500).json({ success: false, message: "Không thể tải hộp thư hỗ trợ." });
    }
});
router.get("/admin/conversations/:id/messages", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT id, sender_type, sender_user_id, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 300",
            [req.params.id]
        );
        return res.json({ success: true, messages: rows });
    } catch (error) {
        console.error("Admin chat history failed:", error);
        return res.status(500).json({ success: false, message: "Không thể tải nội dung trò chuyện." });
    }
});
router.patch("/admin/conversations/:id/claim", async (req, res) => {
    try {
        const [result] = await pool.execute(
            "UPDATE chat_conversations SET status = 'admin_active', assigned_admin_id = ? WHERE id = ? AND status IN ('waiting_admin','ai_active','admin_active') AND (assigned_admin_id IS NULL OR assigned_admin_id = ?)",
            [req.user.id, req.params.id, req.user.id]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Cuộc trò chuyện không tồn tại hoặc đã đóng." });
        return res.json({ success: true, message: "Đã nhận hỗ trợ cuộc trò chuyện." });
    } catch (error) {
        console.error("Claim chat failed:", error);
        return res.status(500).json({ success: false, message: "Không thể nhận cuộc trò chuyện." });
    }
});
router.post("/admin/conversations/:id/messages", async (req, res) => {
    const content = cleanText(req.body.content);
    if (!content) return res.status(400).json({ success: false, message: "Nội dung phản hồi không được để trống." });
    try {
        const [rows] = await pool.execute("SELECT id, status, assigned_admin_id FROM chat_conversations WHERE id = ? LIMIT 1", [req.params.id]);
        if (!rows.length || rows[0].status !== "admin_active" || String(rows[0].assigned_admin_id) !== String(req.user.id)) {
            return res.status(409).json({ success: false, message: "Bạn cần nhận cuộc trò chuyện trước khi phản hồi." });
        }
        await addMessage(pool, req.params.id, "admin", content, req.user.id);
        return res.json({ success: true, message: "Đã gửi phản hồi." });
    } catch (error) {
        console.error("Admin chat reply failed:", error);
        return res.status(500).json({ success: false, message: "Không thể gửi phản hồi." });
    }
});
router.patch("/admin/conversations/:id/status", async (req, res) => {
    const status = cleanText(req.body.status, 30);
    if (!["ai_active", "closed"].includes(status)) return res.status(400).json({ success: false, message: "Trạng thái hỗ trợ không hợp lệ." });
    try {
        const [result] = await pool.execute(
            "UPDATE chat_conversations SET status = ?, assigned_admin_id = NULL WHERE id = ? AND status <> 'closed'",
            [status, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Không tìm thấy cuộc trò chuyện đang mở." });
        return res.json({ success: true, message: status === "closed" ? "Đã kết thúc hỗ trợ." : "Đã chuyển cuộc trò chuyện về AI." });
    } catch (error) {
        console.error("Update chat status failed:", error);
        return res.status(500).json({ success: false, message: "Không thể cập nhật trạng thái hỗ trợ." });
    }
});

module.exports = router;

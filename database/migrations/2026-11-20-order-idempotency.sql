-- CHERI: chống tạo đơn hàng trùng khi client gửi lại cùng yêu cầu.
-- Chỉ tạo bảng; không tự động chạy migration.
-- Không lưu token truy cập khách ở dạng văn bản thuần.

CREATE TABLE IF NOT EXISTS order_idempotency (
    idempotency_key VARCHAR(100) NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    request_hash CHAR(64) NOT NULL,
    order_id BIGINT UNSIGNED NULL,
    guest_token_hash CHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idempotency_key),
    KEY idx_order_idempotency_order (order_id),
    KEY idx_order_idempotency_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

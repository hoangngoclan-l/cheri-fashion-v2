-- Lịch sử thay đổi trạng thái thanh toán, tách biệt với lịch sử trạng thái đơn hàng.
-- Chạy một lần trên database cheri_fashion trước khi sử dụng chức năng xác nhận COD.

USE cheri_fashion;

CREATE TABLE IF NOT EXISTS order_payment_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(30) NOT NULL,
    to_status VARCHAR(30) NOT NULL,
    note VARCHAR(500) NULL,
    changed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_order_payment_history_order_created (order_id, created_at),
    KEY idx_order_payment_history_admin (changed_by),
    CONSTRAINT fk_order_payment_history_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_order_payment_history_admin
        FOREIGN KEY (changed_by) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

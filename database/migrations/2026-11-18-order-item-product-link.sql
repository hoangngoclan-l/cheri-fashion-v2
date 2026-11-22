-- CHERI: liên kết từng dòng đơn hàng với sản phẩm để có thể hoàn kho khi hủy đơn.
-- Chạy một lần trên database hiện tại trước khi triển khai phiên bản backend mới.
ALTER TABLE order_items
    ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER variant_id,
    ADD KEY idx_order_items_product (product_id),
    ADD CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE SET NULL ON UPDATE CASCADE;

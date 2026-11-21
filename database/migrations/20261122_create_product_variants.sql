-- CHERI FASHION
-- Phase 1: product variants.
-- Run once on the CHERI trial database after taking a backup.
-- Existing products, carts and order items are preserved. No stock is fabricated.

USE cheri_fashion;

CREATE TABLE product_variants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(80) NOT NULL,
    size VARCHAR(40) NULL,
    color_name VARCHAR(80) NULL,
    color_code VARCHAR(20) NULL,
    price DECIMAL(12,2) NULL,
    stock INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_variants_sku (sku),
    KEY idx_product_variants_product_status (product_id, status),
    CONSTRAINT fk_product_variants_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_product_variants_price
        CHECK (price IS NULL OR price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nullable to preserve legacy cart rows until a real variant is selected.
ALTER TABLE cart_items
    ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER product_id,
    ADD KEY idx_cart_items_variant (variant_id),
    ADD CONSTRAINT fk_cart_items_variant
        FOREIGN KEY (variant_id) REFERENCES product_variants(id)
        ON DELETE SET NULL ON UPDATE CASCADE;

-- order_items.variant_id already exists and remains NULL for historical orders.
ALTER TABLE order_items
    ADD KEY idx_order_items_variant (variant_id),
    ADD CONSTRAINT fk_order_items_variant
        FOREIGN KEY (variant_id) REFERENCES product_variants(id)
        ON DELETE SET NULL ON UPDATE CASCADE;

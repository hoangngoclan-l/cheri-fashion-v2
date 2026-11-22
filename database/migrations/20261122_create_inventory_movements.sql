-- CHERI FASHION
-- Inventory movement ledger (schema only).
-- Safe to apply after taking a database backup.
-- This migration does not modify products, variants, orders, carts, or stock quantities.
-- Existing stock is NOT backfilled because historical movements cannot be reconstructed reliably.

USE cheri_fashion;

CREATE TABLE inventory_movements (
    id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id INT(11) NOT NULL,
    variant_id BIGINT(20) UNSIGNED NULL,
    movement_type ENUM(
        'adjustment_in',
        'adjustment_out',
        'order_out',
        'order_return'
    ) NOT NULL,
    quantity INT(10) UNSIGNED NOT NULL,
    stock_before INT(10) UNSIGNED NOT NULL,
    stock_after INT(10) UNSIGNED NOT NULL,
    reference_type VARCHAR(30) NULL,
    reference_id BIGINT(20) UNSIGNED NULL,
    note VARCHAR(500) NULL,
    actor_user_id INT(11) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_inventory_movements_product_created (product_id, created_at, id),
    KEY idx_inventory_movements_variant_created (variant_id, created_at, id),
    KEY idx_inventory_movements_type_created (movement_type, created_at, id),
    KEY idx_inventory_movements_reference (reference_type, reference_id),
    KEY idx_inventory_movements_actor (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deliberately no cascading foreign keys: audit history must survive soft/hard
-- deletion or archival of catalog/user records and remain queryable.

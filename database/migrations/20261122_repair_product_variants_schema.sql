-- CHERI FASHION | Repair existing variant schema
-- Target: MariaDB 10.4.32
-- Safe to re-run. Does not drop tables, delete rows, create variants, or alter orders.
-- BACK UP the database before running.

USE cheri_fashion;

DELIMITER //

DROP PROCEDURE IF EXISTS cheri_repair_variant_schema//
CREATE PROCEDURE cheri_repair_variant_schema()
BEGIN
    DECLARE v_exists INT DEFAULT 0;
    DECLARE v_stock_added INT DEFAULT 0;

    -- Ensure product_variants exists; stop rather than creating an unknown table shape.
    SELECT COUNT(*) INTO v_exists
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants';
    IF v_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'product_variants table is missing; stop and inspect database before repair';
    END IF;

    -- Add only columns missing from the currently existing table.
    SELECT COUNT(*) INTO v_exists FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'sku';
    IF v_exists = 0 THEN
        ALTER TABLE product_variants ADD COLUMN sku VARCHAR(80) NULL AFTER product_id;
    END IF;

    SELECT COUNT(*) INTO v_exists FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'price';
    IF v_exists = 0 THEN
        ALTER TABLE product_variants ADD COLUMN price DECIMAL(12,2) NULL AFTER color_code;
    END IF;

    SELECT COUNT(*) INTO v_exists FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'stock';
    IF v_exists = 0 THEN
        ALTER TABLE product_variants ADD COLUMN stock INT(10) UNSIGNED NOT NULL DEFAULT 0 AFTER price;
        SET v_stock_added = 1;
    END IF;

    -- Preserve any legacy stock_quantity values only when creating the new canonical stock column.
    IF v_stock_added = 1 THEN
        SELECT COUNT(*) INTO v_exists FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'stock_quantity';
        IF v_exists > 0 THEN
            UPDATE product_variants SET stock = stock_quantity;
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_exists FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'status';
    IF v_exists = 0 THEN
        ALTER TABLE product_variants
            ADD COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active' AFTER stock;
    END IF;

    SELECT COUNT(*) INTO v_exists FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'updated_at';
    IF v_exists = 0 THEN
        ALTER TABLE product_variants
            ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
    END IF;

    -- Align nullable fields with the admin API, which permits variants without size or color.
    ALTER TABLE product_variants
        MODIFY COLUMN size VARCHAR(40) NULL,
        MODIFY COLUMN color_name VARCHAR(80) NULL;

    -- SKU uniqueness; NULL is allowed for legacy rows, while the admin API requires SKU on new writes.
    SELECT COUNT(*) INTO v_exists FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants'
      AND INDEX_NAME = 'uq_product_variants_sku';
    IF v_exists = 0 THEN
        ALTER TABLE product_variants ADD UNIQUE KEY uq_product_variants_sku (sku);
    END IF;

    SELECT COUNT(*) INTO v_exists FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants'
      AND INDEX_NAME = 'idx_product_variants_product_status';
    IF v_exists = 0 THEN
        ALTER TABLE product_variants ADD KEY idx_product_variants_product_status (product_id, status);
    END IF;

    -- cart_items.variant_id is nullable so all existing cart rows remain valid and unchanged.
    SELECT COUNT(*) INTO v_exists FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart_items' AND COLUMN_NAME = 'variant_id';
    IF v_exists = 0 THEN
        ALTER TABLE cart_items ADD COLUMN variant_id BIGINT(20) UNSIGNED NULL AFTER product_id;
    END IF;

    SELECT COUNT(*) INTO v_exists FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart_items'
      AND INDEX_NAME = 'idx_cart_items_variant';
    IF v_exists = 0 THEN
        ALTER TABLE cart_items ADD KEY idx_cart_items_variant (variant_id);
    END IF;

    -- Add the FK only if variant_id is not already constrained to product_variants.
    SELECT COUNT(*) INTO v_exists
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'cart_items'
      AND COLUMN_NAME = 'variant_id'
      AND REFERENCED_TABLE_NAME = 'product_variants'
      AND REFERENCED_COLUMN_NAME = 'id';
    IF v_exists = 0 THEN
        ALTER TABLE cart_items
            ADD CONSTRAINT fk_cart_items_variant
            FOREIGN KEY (variant_id) REFERENCES product_variants(id)
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END//

CALL cheri_repair_variant_schema()//
DROP PROCEDURE cheri_repair_variant_schema//

DELIMITER ;

-- Read-only verification summary.
SELECT 'product_variants' AS table_name, COUNT(*) AS row_count FROM product_variants
UNION ALL
SELECT 'cart_items', COUNT(*) FROM cart_items;

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
      (TABLE_NAME = 'product_variants' AND COLUMN_NAME IN
          ('id','product_id','sku','size','color_name','color_code','price','stock','stock_quantity','status','created_at','updated_at'))
      OR
      (TABLE_NAME = 'cart_items' AND COLUMN_NAME IN ('id','product_id','variant_id','user_id','quantity'))
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cart_items','order_items','product_variants')
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, COLUMN_NAME;

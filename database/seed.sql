-- Dữ liệu khởi tạo tối thiểu cho CHERI FASHION.
-- INSERT IGNORE không ghi đè sản phẩm đã có trong cửa hàng.

USE cheri_fashion;

INSERT IGNORE INTO products
    (product_code, name, category, category_slug, price, old_price, image, description, is_new, is_sale, stock, status)
VALUES
    (
        'CHERI-ATK-001',
        'Áo kiểu tối giản',
        'Áo nữ',
        'ao',
        320000,
        390000,
        '../assets/images/products/ao-kieu.webp',
        'Thiết kế tối giản, dễ phối cùng quần jeans, chân váy hoặc quần âu.',
        1,
        1,
        20,
        'active'
    ),
    (
        'CHERI-VAY-001',
        'Váy nữ thanh lịch',
        'Váy & Đầm',
        'vay',
        490000,
        0,
        '../assets/images/products/vay-thanh-lich.webp',
        'Thiết kế nữ tính, thanh lịch, phù hợp nhiều hoàn cảnh.',
        1,
        0,
        15,
        'active'
    );

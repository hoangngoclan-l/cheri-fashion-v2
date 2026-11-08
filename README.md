# CHERI FASHION

Website thương mại điện tử thời trang nữ, xây dựng bằng Node.js, Express, MySQL, HTML, CSS và JavaScript thuần.

## Yêu cầu

- Node.js phiên bản 20 trở lên.
- MySQL 8.0 trở lên (có thể sử dụng MySQL đi kèm XAMPP).
- npm.

## Cài đặt lần đầu

1. Tạo database và các bảng bằng cách chạy toàn bộ `database/schema.sql` trong phpMyAdmin hoặc MySQL client.
2. Chạy `database/seed.sql` để thêm hai sản phẩm khởi tạo. Lệnh dùng `INSERT IGNORE`, không ghi đè sản phẩm đã có cùng mã.
3. Sao chép `.env.example` thành `.env`.
4. Điền thông tin kết nối MySQL và thay `JWT_SECRET` bằng một chuỗi bí mật dài, ngẫu nhiên.
5. Mở terminal tại thư mục gốc repository và chạy:

```bash
npm install
npm run dev
```

6. Mở website tại [http://localhost:3000](http://localhost:3000).

## Các địa chỉ chính

- Trang chủ: `/`
- Danh sách sản phẩm: `/frontend/pages/shop.html`
- Tài khoản: `/frontend/pages/account.html`
- Giỏ hàng: `/frontend/pages/cart.html`
- Thanh toán: `/frontend/pages/checkout.html`
- Danh sách yêu thích: `/frontend/pages/wishlist.html`
- Kiểm tra backend: `/api/health`
- Kiểm tra danh sách sản phẩm: `/api/products`

## Cấu trúc

- `backend/`: Express server, cấu hình database, middleware và API routes.
- `frontend/pages/`: các trang giao diện.
- `frontend/components/`: header và footer dùng chung.
- `frontend/assets/css/`: stylesheet.
- `frontend/assets/js/`: logic giao diện và kết nối API.
- `frontend/assets/images/`: hình ảnh website.
- `database/`: cấu trúc bảng và dữ liệu khởi tạo.

## Chức năng hiện có

- Đăng ký, đăng nhập và xác thực bằng JWT.
- Danh sách sản phẩm, tìm kiếm, lọc và sắp xếp.
- Giỏ hàng và danh sách yêu thích theo tài khoản; khách chưa đăng nhập dùng lưu trữ trên trình duyệt.
- Hồ sơ cá nhân và sổ địa chỉ.
- Đặt hàng, xem danh sách đơn và chi tiết đơn.
- Thanh toán khi nhận hàng (COD). Các phương thức trực tuyến chưa được kết nối cổng thanh toán và đang bị vô hiệu hóa trên giao diện.

## Lưu ý triển khai

- Không đưa file `.env`, mật khẩu database hoặc JWT secret lên GitHub.
- Ảnh sản phẩm phải có đường dẫn hợp lệ trong trường `products.image` và tồn tại trong thư mục frontend.
- Cần chạy website qua Express tại cổng 3000 để các đường dẫn `/api/...` hoạt động đúng.
- Các thao tác phụ thuộc MySQL cần được xác minh trên database thực tế; việc cập nhật mã nguồn trên GitHub không tự chạy migration trên máy cá nhân.

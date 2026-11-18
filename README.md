# CHERI FASHION

Website thương mại điện tử thời trang nữ, xây dựng bằng Node.js, Express, MySQL/MariaDB, HTML, CSS và JavaScript thuần.

## Kiến trúc chạy cùng Trạm tri thức

Cheri Fashion và Trạm tri thức có thể dùng chung **một dịch vụ MySQL/MariaDB trên máy** nhưng phải tách biệt database:

| Thành phần | Cheri Fashion | Trạm tri thức |
|---|---|---|
| Backend mặc định | `127.0.0.1:3000` | `127.0.0.1:3001` |
| Database | `cheri_fashion` | `online_lecture_library` |
| MySQL host | `127.0.0.1` | `127.0.0.1` |
| MySQL port | `3306` | `3306` |

Không đổi `DB_NAME` của dự án này sang `online_lecture_library`. Hai ứng dụng không chia sẻ bảng, dữ liệu nghiệp vụ, JWT secret hoặc file upload.

## Yêu cầu

- Node.js 20 trở lên.
- npm.
- MySQL 8 hoặc MariaDB tương thích với môi trường XAMPP đang sử dụng.
- Database `cheri_fashion` đã tồn tại và có schema tương ứng với mã nguồn.

## Cài đặt lần đầu

1. Mở terminal tại thư mục gốc repository.
2. Cài dependency:

   ```bash
   npm install
   ```

3. Sao chép `.env.example` thành `.env`.
4. Điền thông tin MySQL thực tế và tạo `JWT_SECRET` riêng, đủ dài, ngẫu nhiên.
5. Chỉ chạy `database/schema.sql` trên database mới hoặc sau khi đã xác nhận backup và kiểm tra tác động. Không chạy script reset/seed tùy tiện trên database đang có dữ liệu.
6. Khởi động:

   ```bash
   npm run dev
   ```

7. Mở:
   - Website: http://localhost:3000
   - Backend health: http://localhost:3000/api/health
   - Sản phẩm: http://localhost:3000/api/products

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng backend |
| `DB_HOST` | `127.0.0.1` | Máy chủ MySQL/MariaDB |
| `DB_PORT` | `3306` | Cổng MySQL/MariaDB |
| `DB_USER` | `root` | Tài khoản DB dùng khi phát triển |
| `DB_PASSWORD` | rỗng | Mật khẩu DB; không commit |
| `DB_NAME` | `cheri_fashion` | Database riêng của Cheri Fashion |
| `JWT_SECRET` | không có giá trị an toàn mặc định | Bí mật ký JWT |
| `JWT_EXPIRES_IN` | `1d` | Thời hạn token |

## Chức năng

- Đăng ký, đăng nhập và xác thực bằng JWT.
- Danh sách sản phẩm, tìm kiếm, lọc và sắp xếp.
- Giỏ hàng và danh sách yêu thích theo tài khoản; khách chưa đăng nhập dùng lưu trữ trên trình duyệt.
- Hồ sơ cá nhân và sổ địa chỉ.
- Đặt hàng, xem danh sách đơn và chi tiết đơn.
- Thanh toán khi nhận hàng (COD). Phương thức trực tuyến chỉ được bật khi đã tích hợp cổng thanh toán thực tế.

## Cấu trúc

- `backend/`: Express server, cấu hình database, middleware và API routes.
- `frontend/pages/`: các trang giao diện.
- `frontend/components/`: header và footer dùng chung.
- `frontend/assets/`: CSS, JavaScript và hình ảnh.
- `database/`: cấu trúc bảng và dữ liệu khởi tạo.

## Chạy đồng thời hai dự án

Mở hai terminal riêng:

**Terminal 1 — Cheri Fashion**
```bash
cd path/to/cheri-fashion-v2
npm run dev
```
Mặc định: http://localhost:3000

**Terminal 2 — Trạm tri thức**
```bash
cd path/to/online-lecture-library
npm run dev
```
Mặc định: http://127.0.0.1:3001

Cả hai kết nối cùng dịch vụ MySQL tại `127.0.0.1:3306`, nhưng mỗi ứng dụng dùng database riêng.

## Bảo vệ dữ liệu

- Không commit `.env`, mật khẩu, JWT secret, database dump hoặc file người dùng.
- GitHub quản lý mã nguồn và schema; GitHub không tự sao lưu database trên máy.
- Sao lưu bằng `mysqldump` khi MySQL hoạt động ổn định và kiểm tra khả năng khôi phục trên database thử nghiệm.
- Không trộn `ibdata1`, `ib_logfile*` hoặc file `.ibd` từ các thư mục data khác thế hệ.
- Không tự động chạy migration phá hủy dữ liệu khi ứng dụng khởi động.

## Ghi chú

Dự án dùng Express 4 và mysql2. Không nâng/hạ major version dependency trong đợt chuẩn hóa môi trường này để tránh thay đổi hành vi API ngoài phạm vi.

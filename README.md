# Đào tạo nhân sự Kama

Ứng dụng Next.js lưu bài học và khóa học trong Firebase, video trong Bunny Stream.

## Cấu hình Bunny Stream

1. Tạo một **Stream Video Library** tại [Bunny dashboard](https://panel.bunny.net/stream).
2. Sao chép `.env.example` thành `.env.local` và điền:
   - `BUNNY_STREAM_API_KEY`: **Library API Key** từ tab API của Video Library; chỉ dùng trên server.
   - `BUNNY_STREAM_LIBRARY_ID`: ID của cùng Video Library.
   - `NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID`: cùng ID (public) — dùng iframe embed phát video.
   - `NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME`: (tuỳ chọn) hostname CDN, ví dụ `vz-xxxx.b-cdn.net`. Copy đúng từ dashboard; hostname sai sẽ `ERR_NAME_NOT_RESOLVED`. Player mặc định dùng iframe nên có thể để trống.
3. Điền các biến Firebase hiện có, rồi chạy `npm install` và `npm run dev`.
4. Trên Vercel, đặt cùng các biến ở **Project Settings → Environment Variables** và triển khai lại. Cần đặt CDN hostname trước lúc build vì biến `NEXT_PUBLIC_` được đưa vào mã trình duyệt khi build.

Giáo viên tải video bài học và quản trị viên tải video giới thiệu khóa học từ giao diện. Server tạo video Bunny và cấp chữ ký upload có thời hạn; trình duyệt gửi file trực tiếp tới Bunny bằng TUS. Chờ upload đạt 100% và lưu bài học/khóa học. Bunny cần thêm thời gian xử lý video trước khi phát được.

**Bảo mật:** File `env.download` từng được commit vào repo công khai. Hãy thu hồi và tạo lại Bunny Stream Library API Key và Bunny Storage password. Xóa file khỏi commit mới không xóa được giá trị trong lịch sử Git. Các endpoint Bunny hiện chưa có xác thực phía server; cần bổ sung xác thực trước khi cho người lạ truy cập trang quản trị. Phần Bunny Storage dùng `NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD` ở mã cũ cũng cần chuyển sang server trước khi dùng khóa Storage mới.

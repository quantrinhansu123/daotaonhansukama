# Đào tạo nhân sự Kama

Ứng dụng Next.js lưu bài học và khóa học trong Firebase, video mới trong CloudFly Object Storage.

## Cấu hình CloudFly video

1. Tạo bucket riêng tư trong CloudFly Object Storage và lấy S3 access key/secret key.
2. Điền `CLOUDFLY_S3_BUCKET`, `CLOUDFLY_S3_ACCESS_KEY_ID`, `CLOUDFLY_S3_SECRET_ACCESS_KEY` vào `.env.local` cùng cấu hình Firebase.
3. Chạy `npm install` rồi `npm run dev`. Giáo viên tải video bài học và quản trị viên tải video giới thiệu bằng MP4/WebM tối đa 2 GB. Ứng dụng phát tệp gốc qua URL có thời hạn.

Video cũ chỉ có mã Bunny chưa được chuyển. Cần tải lại file gốc lên CloudFly cho từng bài học/khóa học. Ảnh và tài liệu cũ vẫn dùng Bunny Storage theo cấu hình hiện tại.

**Bảo mật:** Endpoint CloudFly chỉ bật ở môi trường development vì hệ thống đăng nhập hiện dùng session trong localStorage, chưa có xác thực phía server. Cần bổ sung xác thực và khóa Firestore rules trước khi phát hành công khai. Các khóa S3 không được đặt với tiền tố `NEXT_PUBLIC_`. Phần ảnh/tài liệu Bunny cũ vẫn dùng `NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD` trong trình duyệt; cần chuyển khóa này về server trước khi dùng trên môi trường công khai.

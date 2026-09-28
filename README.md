# Đào tạo nhân sự Kama

Ứng dụng Next.js đang chuyển tài khoản và dữ liệu khóa học từ Firebase sang Supabase. Video mới lưu trong CloudFly Object Storage; ảnh và tài liệu Bunny cũ được giữ lại.

## Cấu hình CloudFly video

1. Tạo bucket riêng tư trong CloudFly Object Storage và lấy S3 access key/secret key.
2. Điền `CLOUDFLY_S3_BUCKET`, `CLOUDFLY_S3_ACCESS_KEY_ID`, `CLOUDFLY_S3_SECRET_ACCESS_KEY` và các biến Supabase trong `.env.local`. Bật `NEXT_PUBLIC_SUPABASE_ENABLED=true` để dùng đăng nhập và dữ liệu Supabase.
3. Chạy `npm install` rồi `npm run dev`. Giáo viên tải video bài học và quản trị viên tải video giới thiệu tối đa 2 GB, không giới hạn thời lượng. Trình duyệt tải từng phần trực tiếp lên CloudFly và hiển thị tiến độ ở góc màn hình. Nên dùng MP4 H.264/AAC để phát trực tiếp và tua ổn định.

Video cũ chỉ có mã Bunny chưa được chuyển. Cần tải lại file gốc lên CloudFly cho từng bài học/khóa học. Ảnh và tài liệu cũ vẫn dùng Bunny Storage theo cấu hình hiện tại.

Xem [hướng dẫn chuyển sang Supabase](docs/supabase-cutover.md) trước khi triển khai production. `.env.local` không tự chuyển sang Vercel. API tải video yêu cầu Supabase Auth để xác thực quyền admin/giáo viên. Firestore cũ hiện vẫn cho đọc/ghi công khai và còn mật khẩu cũ; cần khóa và xóa sau khi chuyển production. Phần tải tài liệu Bunny cũ vẫn dùng `NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD` ở trình duyệt, vì vậy khóa Bunny này phải được thay và đưa ra khỏi mã trình duyệt trước khi coi hệ thống production là an toàn.

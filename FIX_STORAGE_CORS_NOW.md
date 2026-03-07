# Fix Firebase Storage CORS - HƯỚNG DẪN NHANH

## Vấn đề
Lỗi CORS khi upload banner/thumbnail lên Firebase Storage:
```
Access to XMLHttpRequest ... has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check
```

## Giải pháp

### Bước 1: Deploy Storage Rules mới

File `storage.rules` đã được cập nhật để cho phép:
- ✅ `courses/banners/` - Public read, authenticated write
- ✅ `courses/thumbnails/` - Public read, authenticated write
- ✅ `documents/` - Authenticated read/write
- ✅ `avatars/` - Public read, user can only upload their own
- ✅ `attendance/` - Authenticated read/write

**Cách deploy:**

**Option A: Qua Firebase Console (Dễ nhất)**
1. Mở: https://console.firebase.google.com/project/classroom-257dc/storage/rules
2. Copy nội dung file `storage.rules`
3. Paste vào editor
4. Nhấn "Publish"

**Option B: Qua Firebase CLI**
```bash
firebase deploy --only storage
```

### Bước 2: Cấu hình CORS

**Cần cài Google Cloud SDK:**
1. Download: https://cloud.google.com/sdk/docs/install
2. Cài đặt và khởi động lại terminal

**Chạy lệnh:**
```bash
# Đăng nhập
gcloud auth login

# Set project
gcloud config set project classroom-257dc

# Deploy CORS
gsutil cors set cors.json gs://classroom-257dc.firebasestorage.app
```

**Hoặc nếu đã có gsutil:**
```bash
gsutil cors set cors.json gs://classroom-257dc.firebasestorage.app
```

### Bước 3: Kiểm tra

1. Refresh trang (Ctrl + F5)
2. Thử upload banner/thumbnail mới
3. Kiểm tra Console không còn lỗi CORS

### Bước 4: Verify

Kiểm tra file đã upload:
https://console.firebase.google.com/project/classroom-257dc/storage/files

Bạn sẽ thấy:
- `courses/banners/` - Banner images
- `courses/thumbnails/` - Thumbnail images
- `documents/` - Lesson documents
- `avatars/` - User avatars

## Troubleshooting

### Lỗi: "gsutil: command not found"
→ Cần cài Google Cloud SDK

### Lỗi: "Permission denied"
→ Cần đăng nhập: `gcloud auth login`

### Lỗi: "Bucket not found"
→ Kiểm tra storage bucket name: `classroom-257dc.firebasestorage.app`

### Vẫn lỗi CORS sau khi deploy
→ Đợi 1-2 phút để CORS rules propagate, sau đó thử lại

## Lưu ý

- Storage rules đã cho phép public read cho banners/thumbnails (cần cho hiển thị)
- Chỉ authenticated users mới có thể upload
- CORS rules đã bao gồm OPTIONS method cho preflight requests

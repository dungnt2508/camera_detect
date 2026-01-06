# Phase 4 - AR Try-On Application

## Yêu cầu chạy ứng dụng

Ứng dụng này sử dụng ES Modules nên **bắt buộc phải chạy qua HTTP server**, không thể mở trực tiếp file HTML.

## Cách chạy

### Cách 1: Sử dụng Python (Khuyến nghị)

**Windows:**
```bash
cd phase 4
start-server.bat
```

**Mac/Linux:**
```bash
cd phase\ 4
chmod +x start-server.sh
./start-server.sh
```

Sau đó mở trình duyệt và truy cập: `http://localhost:8000`

### Cách 2: Sử dụng Python thủ công

```bash
cd phase 4
python -m http.server 8000
```

Hoặc với Python 3:
```bash
python3 -m http.server 8000
```

### Cách 3: Sử dụng Node.js (nếu đã cài)

```bash
cd phase 4
npx serve
```

### Cách 4: Sử dụng VS Code Live Server

1. Cài đặt extension "Live Server" trong VS Code
2. Click chuột phải vào `index.html`
3. Chọn "Open with Live Server"

## Cấu trúc thư mục

```
phase 4/
├── index.html
├── app.js
├── start-server.bat (Windows)
├── start-server.sh (Mac/Linux)
└── README.md

assets/
├── 1.glb (Ring model)
└── ball_bearing.glb (Bracelet model)
```

## Lưu ý

- Đảm bảo thư mục `assets` nằm cùng cấp với `phase 4` hoặc điều chỉnh đường dẫn trong code
- Nếu gặp lỗi CORS, chắc chắn bạn đang chạy qua HTTP server, không phải mở file trực tiếp


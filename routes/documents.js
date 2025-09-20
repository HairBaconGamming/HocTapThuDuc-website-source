// routes/documents.js

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { Readable } = require("stream");
const { isLoggedIn, isTeacher } = require("../middlewares/auth"); // Dùng isTeacher để chỉ giáo viên mới được upload

const router = express.Router();

// Sử dụng một kết nối MongoDB riêng cho GridFS để tránh xung đột
const conn = mongoose.createConnection(process.env.MONGO_URI);

let bucket;
conn.once("open", () => {
  bucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "lessonDocuments", // Tạo một bucket mới riêng cho tài liệu bài học
  });
  console.log("GridFS for documents is ready.");
});

// Cấu hình Multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Giới hạn 10MB
  fileFilter: (req, file, cb) => {
    // Chỉ cho phép các loại file tài liệu phổ biến
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(file.originalname.split('.').pop().toLowerCase());

    if (mimetype || extname) {
      return cb(null, true);
    }
    cb(new Error("Loại file không được hỗ trợ! Chỉ chấp nhận Word, Excel, PowerPoint, PDF."));
  },
});


// API Endpoint: POST /api/documents/upload
// SỬA LẠI TOÀN BỘ ROUTE NÀY THÀNH ASYNC/AWAIT VÀ DÙNG PROMISE
router.post("/upload", isLoggedIn, isTeacher, upload.single("documentFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Không có file nào được chọn." });
  }
  if (!bucket) {
    return res.status(500).json({ error: "Dịch vụ lưu trữ chưa sẵn sàng, vui lòng thử lại." });
  }

  try {
    const filename = `${Date.now()}-${req.file.originalname}`;
    const readableStream = Readable.from(req.file.buffer);

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: {
        originalName: req.file.originalname,
        uploaderId: req.user._id.toString(),
      },
    });

    // Bọc quá trình pipe vào một Promise để có thể "await"
    const uploadedFile = await new Promise((resolve, reject) => {
      readableStream.pipe(uploadStream)
        .on("error", (err) => reject(err))
        .on("finish", () => resolve(uploadStream));
    });

    // Chỉ gửi phản hồi sau khi upload đã hoàn tất
    res.status(201).json({
      message: "Tải file lên thành công!",
      fileId: uploadedFile.id,
      filename: uploadedFile.filename,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      url: `/documents/view/${uploadedFile.filename}`
    });

  } catch (error) {
    console.error("GridFS upload error:", error);
    res.status(500).json({ error: "Lỗi khi lưu file." });
  }
});

// ===== THÊM ROUTE MỚI NÀY VÀO CUỐI FILE =====
// Route CÔNG KHAI để xem file, xác thực bằng token
// KHÔNG có middleware isLoggedIn
router.get("/public-view/:filename", async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(401).send("Access token is missing.");
    }
    if (!bucket) {
        return res.status(500).send("Storage service is not ready.");
    }

    try {
        // 1. Xác thực token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_fallback_secret');

        // 2. Kiểm tra xem filename trong token có khớp với filename trong URL không
        if (decoded.filename !== req.params.filename) {
            return res.status(403).send("Invalid token for this file.");
        }

        // 3. Nếu token hợp lệ, tiến hành stream file
        const files = await bucket.find({ filename: req.params.filename }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).send("File not found.");
        }

        const file = files[0];
        res.set("Content-Type", file.contentType);
        res.set("Content-Disposition", `inline; filename="${file.metadata.originalName}"`);

        const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
        downloadStream.pipe(res);

    } catch (error) {
        // Lỗi nếu token hết hạn hoặc không hợp lệ
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(403).send("Access link has expired. Please reload the lesson page.");
        }
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(403).send("Invalid access token.");
        }
        console.error("Error streaming public document:", error);
        res.status(500).send("Server error while accessing the file.");
    }
});
// ===============================================


module.exports = router;
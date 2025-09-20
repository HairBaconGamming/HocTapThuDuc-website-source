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
router.post("/upload", isLoggedIn, isTeacher, upload.single("documentFile"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Không có file nào được chọn." });
  }
  if (!bucket) {
    return res.status(500).json({ error: "Dịch vụ lưu trữ chưa sẵn sàng, vui lòng thử lại." });
  }

  const filename = `${Date.now()}-${req.file.originalname}`;
  const readableStream = Readable.from(req.file.buffer);

  const uploadStream = bucket.openUploadStream(filename, {
    contentType: req.file.mimetype,
    metadata: {
      originalName: req.file.originalname,
      uploaderId: req.user._id.toString(),
    },
  });

  readableStream.pipe(uploadStream)
    .on("error", (err) => {
      console.error("GridFS upload error:", err);
      res.status(500).json({ error: "Lỗi khi lưu file." });
    })
    .on("finish", (file) => {
      res.status(201).json({
        message: "Tải file lên thành công!",
        fileId: file._id,
        filename: file.filename,
        originalName: file.metadata.originalName,
        contentType: file.contentType,
        size: file.length,
        // URL để truy cập file sau này
        url: `/documents/view/${file.filename}`
      });
    });
});

// Route để xem/tải file: GET /documents/view/:filename
router.get("/view/:filename", isLoggedIn, async (req, res) => {
    if (!bucket) {
        return res.status(500).send("Dịch vụ lưu trữ chưa sẵn sàng.");
    }
    try {
        const files = await bucket.find({ filename: req.params.filename }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).send("Không tìm thấy tài liệu.");
        }

        const file = files[0];
        res.set("Content-Type", file.contentType);
        // 'inline' sẽ cố gắng hiển thị file trên trình duyệt (PDF), 'attachment' sẽ luôn tải xuống
        res.set("Content-Disposition", `inline; filename="${file.metadata.originalName}"`);

        const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
        downloadStream.pipe(res);
    } catch (error) {
        console.error("Error streaming document:", error);
        res.status(500).send("Lỗi khi truy cập tài liệu.");
    }
});


module.exports = router;
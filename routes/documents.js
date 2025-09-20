// routes/documents.js

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { Readable } = require("stream");
const { isLoggedIn, isTeacher } = require("../middlewares/auth");
const jwt = require('jsonwebtoken');

const router = express.Router();

const conn = mongoose.createConnection(process.env.MONGO_URI);

let bucket;
conn.once("open", () => {
  bucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "lessonDocuments",
  });
  console.log("GridFS for documents is ready.");
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt/; // Thêm các loại file bạn muốn
    const extname = file.originalname.split('.').pop().toLowerCase();
    if (allowedTypes.test(extname)) {
      return cb(null, true);
    }
    cb(new Error("Loại file không được hỗ trợ!"));
  },
});

// === API UPLOAD: Trả về _id thay vì filename trong URL ===
router.post("/upload", isLoggedIn, isTeacher, upload.single("documentFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Không có file nào được chọn." });
  if (!bucket) return res.status(500).json({ error: "Dịch vụ lưu trữ chưa sẵn sàng." });

  try {
    // Tên file trong GridFS giờ chỉ là timestamp để đảm bảo duy nhất, không dùng trong URL nữa
    const filename = `${Date.now()}`;
    const readableStream = Readable.from(req.file.buffer);

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: {
        originalName: req.file.originalname,
        uploaderId: req.user._id.toString(),
      },
    });

    const uploadedFile = await new Promise((resolve, reject) => {
      readableStream.pipe(uploadStream)
        .on("error", reject)
        .on("finish", () => resolve(uploadStream));
    });

    res.status(201).json({
      message: "Tải file lên thành công!",
      fileId: uploadedFile.id.toString(), // QUAN TRỌNG: Trả về fileId dạng chuỗi
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      // URL mới sử dụng fileId
      url: `/documents/view/${uploadedFile.id.toString()}`
    });

  } catch (error) {
    console.error("GridFS upload error:", error);
    res.status(500).json({ error: "Lỗi khi lưu file." });
  }
});

// === ROUTE XEM FILE (YÊU CẦU LOGIN) SỬ DỤNG _id ===
router.get("/view/:id", isLoggedIn, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).send("ID tài liệu không hợp lệ.");
    }
    if (!bucket) return res.status(500).send("Dịch vụ lưu trữ chưa sẵn sàng.");

    try {
        const fileId = new mongoose.Types.ObjectId(req.params.id);
        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).send("Không tìm thấy tài liệu.");
        }

        const file = files[0];
        res.set("Content-Type", file.contentType);
        res.set("Content-Disposition", `inline; filename="${file.metadata.originalName}"`);

        const downloadStream = bucket.openDownloadStream(fileId);
        downloadStream.pipe(res);
    } catch (error) {
        console.error("Error streaming document:", error);
        res.status(500).send("Lỗi khi truy cập tài liệu.");
    }
});

// === ROUTE XEM FILE CÔNG KHAI SỬ DỤNG _id VÀ TOKEN ===
router.get("/public-view/:id", async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(401).send("Access token is missing.");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).send("ID tài liệu không hợp lệ.");
    }
    if (!bucket) return res.status(500).send("Storage service is not ready.");

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_fallback_secret');
        
        // Token giờ sẽ chứa fileId
        if (decoded.fileId !== req.params.id) {
            return res.status(403).send("Invalid token for this file.");
        }

        const fileId = new mongoose.Types.ObjectId(req.params.id);
        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) return res.status(404).send("File not found.");

        const file = files[0];
        res.set("Content-Type", file.contentType);
        res.set("Content-Disposition", `inline; filename="${file.metadata.originalName}"`);
        
        bucket.openDownloadStream(fileId).pipe(res);

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) return res.status(403).send("Access link has expired.");
        if (error instanceof jwt.JsonWebTokenError) return res.status(403).send("Invalid access token.");
        console.error("Error streaming public document:", error);
        res.status(500).send("Server error while accessing the file.");
    }
});

module.exports = router;
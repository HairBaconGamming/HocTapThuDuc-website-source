// routes/proImages.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { Readable } = require("stream");
const path = require("path");
const { isPro } = require("../middlewares/auth");

const router = express.Router();

const mongoURI = process.env.IMAGE_MONGO_URI;
const conn = mongoose.createConnection(mongoURI);

let bucket;
conn.once("open", () => {
  bucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "pro-images",
  });
  console.log("GridFS Bucket initialized.");
});

// Hàm để sanitize tên file: chỉ cho phép chữ và số
function sanitizeFilename(originalName) {
  // Generate a unique filename using timestamp and a random string
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Cấu hình Multer với memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit to 10MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
      "image/svg+xml",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Chỉ cho phép upload ảnh (JPEG, PNG, GIF, WEBP, BMP, TIFF, SVG)!"));
    }
    cb(null, true);
  },
});

// POST /api/pro-images/upload - Upload ảnh mới và lưu vào GridFS
router.post("/upload", isPro, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Không có file được upload!" });
  }
  
  if (!bucket) {
    return res.status(500).json({ error: "Kết nối tới DB chưa sẵn sàng." });
  }

  // Sinh tên file URL an toàn
  const sanitizedFilename = sanitizeFilename(req.file.originalname);

  // Tạo readableStream từ buffer của file
  const readableStream = Readable.from(req.file.buffer);

  const uploadStream = bucket.openUploadStream(sanitizedFilename, {
    contentType: req.file.mimetype,
    metadata: {
      user: req.user._id.toString(), // Ensure user ID is stored as string
      displayName: req.file.originalname,
    },
  });

  readableStream
    .pipe(uploadStream)
    .on("error", (err) => {
      console.error("Lỗi khi upload file:", err);
      return res.status(500).json({ error: "Lỗi khi upload file." });
    })
    .on("finish", () => {
      const imageUrl = `${req.protocol}://${req.get("host")}/api/pro-images/${
        uploadStream.filename
      }`;
      res.json({ url: imageUrl, fileId: uploadStream.id });
    });
});

// GET /api/pro-images/list - Lấy danh sách ảnh của user hiện tại từ GridFS files
router.get("/list", isPro, async (req, res) => {
  if (!conn || !conn.db) {
    return res.status(500).json({ error: "Kết nối cơ sở dữ liệu chưa sẵn sàng" });
  }
  
  // Ensure req.user and req.user._id are present
  if (!req.user || !req.user._id) {
    return res.status(401).json({ error: "Người dùng chưa xác thực." });
  }

  const userIdString = req.user._id.toString(); // Always work with the string representation

  try {
    const filesCollection = conn.db.collection("pro-images.files");
    
    // Querying based on metadata.user string
    const files = await filesCollection
      .find({ "metadata.user": userIdString })
      .sort({ uploadDate: -1 }) // Sort by upload date descending
      .toArray();

    if (files.length === 0) {
      // This is a normal situation if the user hasn't uploaded anything yet.
      // console.log(`Không tìm thấy ảnh nào cho user ID: ${userIdString}`);
      return res.json([]);
    }

    // Map thêm thuộc tính displayName và URL vào mỗi file
    const filesWithDetails = files.map((file) => ({
      _id: file._id,
      filename: file.filename,
      displayName: file.metadata?.displayName || file.filename,
      size: file.length,
      uploadDate: file.uploadDate,
      contentType: file.contentType,
      url: `${req.protocol}://${req.get("host")}/api/pro-images/${file.filename}`
    }));

    res.json(filesWithDetails);
  } catch (err) {
    console.error("Lỗi truy vấn danh sách ảnh:", err);
    res.status(500).json({ error: "Lỗi truy vấn ảnh!" });
  }
});

// GET /api/pro-images/:filename - Lấy file ảnh theo filename
router.get("/:filename", (req, res) => {
  if (!bucket) {
    return res.status(500).send("Server error: GridFS Bucket not ready.");
  }
  
  const filename = req.params.filename;

  bucket.find({ filename: filename }).toArray((err, files) => {
    if (err) {
      console.error("Lỗi truy xuất file:", err);
      return res.status(500).send("Error retrieving file.");
    }
    
    if (!files || files.length === 0) {
      return res.status(404).send("Image not found.");
    }
    
    const file = files[0];
    
    // Set Cache-Control headers for better performance
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.set("Content-Type", file.contentType);
    
    const downloadStream = bucket.openDownloadStreamByName(filename);
    
    downloadStream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
            res.status(500).send('Error streaming file.');
        }
    });
    
    downloadStream.pipe(res);
  });
});

// DELETE /api/pro-images/:id - Xóa ảnh theo _id (chỉ chủ sở hữu được xóa)
router.delete("/:id", isPro, async (req, res) => {
  if (!bucket) {
    return res.status(500).json({ error: "Kết nối DB chưa sẵn sàng." });
  }

  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    
    // Find the file metadata first to verify ownership
    const filesCollection = conn.db.collection("pro-images.files");
    const file = await filesCollection.findOne({ _id: fileId });

    if (!file) {
      return res.status(404).json({ error: "File not found." });
    }

    // Check ownership
    if (file.metadata?.user !== req.user._id.toString()) {
      return res.status(403).json({ error: "Bạn không có quyền xóa file này." });
    }

    // Delete the file using GridFSBucket
    bucket.delete(fileId, (err) => {
      if (err) {
        console.error("Lỗi xóa file từ GridFS:", err);
        return res.status(500).json({ error: "Lỗi xóa ảnh." });
      }
      res.json({ success: true, message: "Xóa ảnh thành công!" });
    });
    
  } catch (err) {
    console.error("Lỗi xử lý yêu cầu xóa:", err);
    res.status(500).json({ error: "Lỗi xử lý yêu cầu xóa ảnh." });
  }
});

module.exports = router;
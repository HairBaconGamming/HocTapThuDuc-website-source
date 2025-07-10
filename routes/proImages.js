// routes/proImages.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { Readable } = require("stream");
const path = require("path");
const { isPro } = require("../middlewares/auth");

const router = express.Router();

const mongoURI = process.env.IMAGE_MONGO_URI;
const conn = mongoose.createConnection(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let bucket;
conn.once("open", () => {
  bucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "pro-images",
  });
});

// Hàm để sanitize tên file: chỉ cho phép chữ và số
function sanitizeFilename(originalName) {
  return Date.now().toString();
}

// Cấu hình Multer với memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".tiff",
      ".svg",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedTypes.includes(ext)) {
      return cb(new Error("Chỉ cho phép upload ảnh!"));
    }
    cb(null, true);
  },
});

// POST /api/pro-images/upload - Upload ảnh mới và lưu vào GridFS
router.post("/upload", isPro, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Không có file được upload!" });
  }

  // Sinh tên file URL an toàn: chỉ chứa chữ và số
  const sanitizedFilename = sanitizeFilename(req.file.originalname);

  // Tạo readableStream từ buffer của file
  const readableStream = new Readable();
  readableStream.push(req.file.buffer);
  readableStream.push(null);

  if (!bucket) {
    return res.status(500).json({ error: "Kết nối tới DB chưa sẵn sàng." });
  }

  // Sử dụng filename đã sanitize và lưu displayName vào metadata
  const uploadStream = bucket.openUploadStream(sanitizedFilename, {
    contentType: req.file.mimetype,
    metadata: {
      user: req.user._id.toString(),
      displayName: req.file.originalname, // Lưu tên gốc của file
    },
  });

  readableStream
    .pipe(uploadStream)
    .on("error", (err) => {
      console.error("Lỗi khi upload file:", err);
      return res.status(500).json({ error: "Lỗi khi upload file." });
    })
    .on("finish", () => {
      // Tạo URL dùng tên file đã sanitize, ví dụ: http://domain/api/pro-images/...
      const imageUrl = `${req.protocol}://${req.get("host")}/api/pro-images/${
        uploadStream.filename
      }`;
      res.json({ url: imageUrl, fileId: uploadStream.id });
    });
});

// GET /api/pro-images/list - Lấy danh sách ảnh của user hiện tại từ GridFS files
router.get("/list", isPro, async (req, res) => {
  if (!conn || !conn.db) {
    return res
      .status(500)
      .json({ error: "Kết nối cơ sở dữ liệu chưa sẵn sàng" });
  }
  try {
    const files = await conn.db
      .collection("pro-images.files")
      .find({ "metadata.user": req.user._id.toString() })
      .toArray();

    if (files.length === 0) {
      console.log(
        `Không tìm thấy ảnh nào cho user ID: ${req.user._id.toString()}`
      );
      return res.json([]);
    }

    // Map thêm thuộc tính displayName vào mỗi file: nếu metadata.displayName có thì dùng, nếu không thì dùng filename
    const filesWithDisplay = files.map((file) => ({
      ...file,
      displayName:
        file.metadata && file.metadata.displayName
          ? file.metadata.displayName
          : file.filename,
    }));

    res.json(filesWithDisplay);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi truy vấn ảnh!" });
  }
});

// GET /api/pro-images/:filename - Lấy file ảnh theo filename
router.get("/:filename", (req, res) => {
  if (!bucket) {
    return res.status(500).json({ error: "Kết nối DB chưa sẵn sàng." });
  }
  bucket.find({ filename: req.params.filename }).toArray((err, files) => {
    if (err) {
      console.error("Lỗi truy xuất file:", err);
      return res.status(500).json({ error: "Lỗi truy xuất file." });
    }
    if (!files || files.length === 0) {
      return res.status(404).json({ error: "Ảnh không tồn tại!" });
    }
    const file = files[0];
    res.set("Content-Type", file.contentType);
    bucket.openDownloadStreamByName(req.params.filename).pipe(res);
  });
});

// DELETE /api/pro-images/:id - Xóa ảnh theo _id (chỉ chủ sở hữu được xóa)
router.delete("/:id", isPro, (req, res) => {
  if (!bucket) {
    return res.status(500).json({ error: "Kết nối DB chưa sẵn sàng." });
  }
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    bucket.delete(fileId, (err) => {
      if (err) {
        console.error("Lỗi xóa file:", err);
        return res.status(500).json({ error: "Lỗi xóa ảnh." });
      }
      res.json({ message: "Xóa ảnh thành công!" });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi xóa ảnh." });
  }
});

module.exports = router;

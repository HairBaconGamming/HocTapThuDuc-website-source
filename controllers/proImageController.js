const mongoose = require("mongoose");
const multer = require("multer");
const { Readable } = require("stream");
const path = require("path");

// 1. Cấu hình URI và Kết nối GridFS
let mongoURI = process.env.IMAGE_MONGO_URI;
if (typeof mongoURI === 'string') mongoURI = mongoURI.replace(/^"(.*)"$/, '$1');
if (!mongoURI) {
  console.warn('IMAGE_MONGO_URI not set; using mongodb://localhost:27017/studypro as fallback for pro-images');
  mongoURI = 'mongodb://localhost:27017/studypro';
}

const conn = mongoose.createConnection(mongoURI);

let bucket;
conn.once("open", () => {
  bucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "pro-images",
  });
  console.log("GridFS connection is ready.");
});

function sanitizeFilename(originalName) {
  const fileExt = path.extname(originalName);
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${Date.now()}-${randomString}${fileExt}`;
}

// 2. Cấu hình Multer (Memory Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|tiff|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Chỉ cho phép upload file ảnh!"));
    }
  },
});

// Middleware xử lý upload để dùng trong router
exports.uploadMiddleware = upload.single("image");

// 3. Các hàm xử lý (Handlers)

// Upload ảnh
exports.uploadImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Không có file được upload!" });
  }

  if (!bucket) {
    return res.status(500).json({ error: "Kết nối tới DB chưa sẵn sàng." });
  }

  const sanitizedFilename = sanitizeFilename(req.file.originalname);
  const readableStream = Readable.from(req.file.buffer);

  const uploadStream = bucket.openUploadStream(sanitizedFilename, {
    contentType: req.file.mimetype,
    metadata: {
      user: req.user._id.toString(),
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
      const imageUrl = `/api/pro-images/${uploadStream.filename}`;
      res.status(201).json({ url: imageUrl, fileId: uploadStream.id });
    });
};

// Lấy danh sách ảnh
exports.getList = async (req, res) => {
  if (!bucket) {
    return res.status(500).json({ error: "Kết nối DB chưa sẵn sàng." });
  }

  try {
    const files = await bucket.find({ "metadata.user": req.user._id.toString() }).toArray();

    if (!files || files.length === 0) {
      return res.json([]);
    }

    const filesWithDisplay = files.map((file) => ({
      ...file,
      url: `/api/pro-images/${file.filename}`,
      displayName: file.metadata?.displayName || file.filename,
    }));

    res.json(filesWithDisplay);
  } catch (err) {
    console.error("Lỗi truy vấn danh sách ảnh:", err);
    res.status(500).json({ error: "Lỗi máy chủ khi truy vấn ảnh." });
  }
};

// Xem ảnh (Render file từ GridFS)
exports.getImage = async (req, res) => {
  if (!bucket) {
    return res.status(500).json({ error: "Kết nối DB chưa sẵn sàng." });
  }

  try {
    const files = await bucket.find({ filename: req.params.filename }).toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ error: "Ảnh không tồn tại!" });
    }

    const file = files[0];
    res.set("Content-Type", file.contentType);
    res.set("Content-Disposition", `inline; filename="${file.metadata?.displayName || file.filename}"`);

    const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
    downloadStream.pipe(res);
  } catch (err) {
    console.error("Lỗi truy xuất file:", err);
    res.status(500).json({ error: "Lỗi máy chủ khi truy xuất file." });
  }
};

// Xóa ảnh
exports.deleteImage = async (req, res) => {
  if (!bucket) {
    return res.status(500).json({ error: "Kết nối DB chưa sẵn sàng." });
  }

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID file không hợp lệ." });
    }

    const fileId = new mongoose.Types.ObjectId(req.params.id);

    // Kiểm tra quyền sở hữu
    const file = await conn.db.collection("pro-images.files").findOne({
      _id: fileId,
      "metadata.user": req.user._id.toString()
    });

    if (!file) {
      return res.status(404).json({ error: "Ảnh không tồn tại hoặc bạn không có quyền xóa." });
    }

    await bucket.delete(fileId);
    res.status(200).json({ message: "Xóa ảnh thành công!" });
  } catch (err) {
    console.error("Lỗi xóa file:", err);
    res.status(500).json({ error: "Lỗi máy chủ khi xóa ảnh." });
  }
};
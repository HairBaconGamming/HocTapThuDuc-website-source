const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const ProImage = require("../models/ProImage");

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const LEGACY_BUCKET_NAME = "pro-images";

function stripWrappingQuotes(value) {
  return typeof value === "string" ? value.replace(/^\"(.*)\"$/, "$1") : value;
}

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn(
    "Cloudinary credentials are missing. /api/pro-images/upload will be unavailable until env vars are configured."
  );
}

const storage = hasCloudinaryConfig
  ? new CloudinaryStorage({
      cloudinary,
      params: async () => ({
        folder: "hoctapthuduc/pro-images",
        allowed_formats: ["jpeg", "jpg", "png", "gif", "webp", "bmp", "tiff", "svg"],
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      }),
    })
  : multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|tiff|svg/;
    const originalName = file?.originalname || "";
    const mimeType = file?.mimetype || "";
    const extname = allowedTypes.test(originalName.toLowerCase());
    const mimetype = allowedTypes.test(mimeType.toLowerCase());

    if (extname && mimetype) {
      return cb(null, true);
    }

    cb(new Error("Chi cho phep upload file anh!"));
  },
});

exports.uploadMiddleware = upload.single("image");

const legacyMongoUri = stripWrappingQuotes(
  process.env.IMAGE_MONGO_URI || process.env.MONGO_URI || "mongodb://localhost:27017/studypro"
);

let legacyConn;
let legacyBucket;

function ensureLegacyBucket() {
  if (legacyConn) return;

  legacyConn = mongoose.createConnection(legacyMongoUri);
  legacyConn.once("open", () => {
    legacyBucket = new mongoose.mongo.GridFSBucket(legacyConn.db, {
      bucketName: LEGACY_BUCKET_NAME,
    });
    console.log("Legacy GridFS connection is ready for pro-images compatibility.");
  });
  legacyConn.on("error", (err) => {
    console.warn("Legacy GridFS connection error for pro-images:", err.message);
  });
}

ensureLegacyBucket();

function buildImagePayload(image) {
  const payload = image && typeof image.toObject === "function" ? image.toObject() : image;
  const fallbackName =
    payload?.displayName || payload?.filename || payload?.public_id || "Anh da tai len";

  return {
    _id: payload?._id,
    url: payload?.url || "",
    public_id: payload?.public_id || null,
    filename: payload?.filename || payload?.public_id || null,
    displayName: fallbackName,
    size: Number(payload?.size) || 0,
    createdAt: payload?.createdAt || null,
    source: payload?.source || "cloudinary",
    legacyFileId: payload?.legacyFileId || null,
  };
}

async function getLegacyGridFsFiles(userId, migratedLegacyIds = new Set()) {
  if (!legacyBucket) return [];

  try {
    const files = await legacyBucket.find({ "metadata.user": String(userId) }).toArray();
    return files
      .filter((file) => !migratedLegacyIds.has(String(file._id)))
      .map((file) =>
        buildImagePayload({
          _id: file._id,
          url: `/api/pro-images/${file.filename}`,
          filename: file.filename,
          displayName: file.metadata?.displayName || file.filename,
          size: file.length,
          createdAt: file.uploadDate,
          source: "gridfs",
          legacyFileId: String(file._id),
        })
      );
  } catch (err) {
    console.warn("Could not read legacy GridFS images:", err.message);
    return [];
  }
}

exports.uploadImage = async (req, res) => {
  if (!hasCloudinaryConfig) {
    return res.status(503).json({ error: "Cloudinary chua duoc cau hinh tren server." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Khong co file duoc upload!" });
  }

  try {
    const newImage = await ProImage.create({
      user: req.user._id,
      url: req.file.path,
      public_id: req.file.filename,
      filename: req.file.filename,
      displayName: req.file.originalname,
      size: Number(req.file.size || req.file.bytes) || 0,
      source: "cloudinary",
    });

    res.status(201).json({
      url: newImage.url,
      fileId: newImage._id,
      image: buildImagePayload(newImage),
    });
  } catch (err) {
    console.error("Loi khi upload file len Cloudinary:", err);
    res.status(500).json({ error: "Loi khi upload file." });
  }
};

exports.getList = async (req, res) => {
  try {
    const cloudinaryFiles = await ProImage.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    const migratedLegacyIds = new Set(
      cloudinaryFiles.map((file) => String(file.legacyFileId || "")).filter(Boolean)
    );
    const legacyFiles = await getLegacyGridFsFiles(req.user._id, migratedLegacyIds);

    const merged = [
      ...cloudinaryFiles.map((file) => buildImagePayload({ ...file, source: "cloudinary" })),
      ...legacyFiles,
    ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    res.json(merged);
  } catch (err) {
    console.error("Loi truy van danh sach anh:", err);
    res.status(500).json({ error: "Loi may chu khi truy van anh." });
  }
};

exports.getImage = async (req, res) => {
  if (!legacyBucket) {
    return res.status(404).json({ error: "Anh khong ton tai!" });
  }

  try {
    const files = await legacyBucket.find({ filename: req.params.filename }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: "Anh khong ton tai!" });
    }

    const file = files[0];
    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Content-Disposition", `inline; filename="${file.metadata?.displayName || file.filename}"`);
    legacyBucket.openDownloadStreamByName(req.params.filename).pipe(res);
  } catch (err) {
    console.error("Loi truy xuat legacy GridFS image:", err);
    res.status(500).json({ error: "Loi may chu khi truy xuat anh." });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID file khong hop le." });
    }

    const imageId = new mongoose.Types.ObjectId(req.params.id);

    const cloudinaryImage = await ProImage.findOne({
      _id: imageId,
      user: req.user._id,
    });

    if (cloudinaryImage) {
      if (cloudinaryImage.public_id) {
        if (!hasCloudinaryConfig) {
          return res.status(503).json({ error: "Cloudinary chua duoc cau hinh tren server." });
        }
        await cloudinary.uploader.destroy(cloudinaryImage.public_id, { resource_type: "image" });
      }

      await cloudinaryImage.deleteOne();
      return res.status(200).json({ message: "Xoa anh thanh cong!" });
    }

    if (!legacyBucket || !legacyConn) {
      return res.status(404).json({ error: "Anh khong ton tai hoac ban khong co quyen xoa." });
    }

    const legacyFile = await legacyConn.db.collection(`${LEGACY_BUCKET_NAME}.files`).findOne({
      _id: imageId,
      "metadata.user": String(req.user._id),
    });

    if (!legacyFile) {
      return res.status(404).json({ error: "Anh khong ton tai hoac ban khong co quyen xoa." });
    }

    await legacyBucket.delete(imageId);
    res.status(200).json({ message: "Xoa anh thanh cong!" });
  } catch (err) {
    console.error("Loi xoa file:", err);
    res.status(500).json({ error: "Loi may chu khi xoa anh." });
  }
};

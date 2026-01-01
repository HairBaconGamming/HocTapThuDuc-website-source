const express = require("express");
const router = express.Router();
const controller = require("../controllers/proImageController");
const { isPro, isLoggedIn } = require("../middlewares/auth");

// GET /api/pro-images/list - Lấy danh sách ảnh
router.get("/list", isLoggedIn, isPro, controller.getList);

// POST /api/pro-images/upload - Upload ảnh
router.post("/upload", isLoggedIn, isPro, controller.uploadMiddleware, controller.uploadImage);

// GET /api/pro-images/:filename - Hiển thị ảnh (Public để thẻ <img> truy cập được)
router.get("/:filename", controller.getImage);

// DELETE /api/pro-images/:id - Xóa ảnh
router.delete("/:id", isLoggedIn, isPro, controller.deleteImage);

module.exports = router;
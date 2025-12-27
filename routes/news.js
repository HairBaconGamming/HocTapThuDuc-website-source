// routes/news.js
const express = require("express");
const marked = require("marked");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const News = require("../models/News");
const Subject = require("../models/Subject");
const { isLoggedIn, isPro } = require("../middlewares/auth");

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer to store files on disk under public/uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Basic sanitization for filename
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(async (req, res, next) => {
  const errorMessages = req.flash('error');
  const successMessages = req.flash('success');

  if (errorMessages.length > 0) {
    res.locals.message = { type: 'error', message: errorMessages[0] };
  } else if (successMessages.length > 0) {
    res.locals.message = { type: 'success', message: successMessages[0] };
  } else {
    res.locals.message = { type: null, message: '' };
  }
  next();
});

// GET /news - Display list of news with optional filters
router.get("/", async (req, res) => {
  try {
    let { subject, category, sort, q } = req.query;
    const sortOrder = sort === "asc" ? 1 : -1;

    let filter = {};
    if (subject) filter.subject = subject;
    if (category) filter.category = category;
    if (q) filter.title = { $regex: q, $options: "i" };

    // Nếu không phải user PRO, không lấy các tin thuộc "Tài khoản PRO"
    if (!(req.user && req.user.isPro)) {
      filter.category = { $ne: "Tài khoản PRO" };
    }

    const newsItems = await News.find(filter)
      .populate("subject", "name")
      .populate("postedBy", "username avatar _id") // Include avatar for poster
      .sort({ createdAt: sortOrder })
      .limit(10);

    // For filter dropdown, get subjects
    const subjects = await Subject.find({});

    // Map newsItems into the shape expected by the template (`newsList`)
    const newsList = newsItems.map(n => ({
      _id: n._id,
      title: n.title,
      content: n.content,
      category: n.category,
      createdAt: n.createdAt,
      image: n.image || '',
      author: n.postedBy || null
    }));

    res.render("news", {
      user: req.user,
      newsItems,
      newsList,
      subjects,
      currentSubject: subject || "",
      currentCategory: category || "",
      currentQuery: q || "",
      currentSort: sort === "asc" ? "asc" : "desc",
      marked,
    });
  } catch (err) {
    console.error(err);
    res.send("Lỗi khi tải tin tức.");
  }
});

// GET /news/post - Page for posting news (only for PRO users)
router.get("/post", isLoggedIn, isPro, (req, res) => {
  res.render("newsPost", {
    user: req.user,
    editMode: false,
    mode: 'create',
    newsItem: null
  });
});

// GET /news/:id/edit - Page for editing a news post (only for PRO users)
router.get("/:id/edit", isLoggedIn, isPro, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) {
      req.flash("error", "Tin tức không tồn tại.");
      return res.redirect("/news");
    }
    // Chỉ cho phép tác giả của tin mới được chỉnh sửa
    if (newsItem.postedBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền chỉnh sửa tin tức này.");
      return res.redirect("/news");
    }
    res.render("newsPost", {
      user: req.user,
      editMode: true,
      mode: 'edit',
      newsItem,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Có lỗi xảy ra khi tải trang chỉnh sửa tin.");
    res.redirect("/news");
  }
});

// POST /news/post - Handle posting news (only for PRO users)
router.post("/post", isLoggedIn, isPro, upload.single("image"), async (req, res) => {
  try {
    const { title, content, category, imageUrl } = req.body;

    // Determine final image: prefer uploaded file, fall back to provided URL
    let finalImage = imageUrl || "";

    if (req.file) {
      // Backend guard: do not accept uploaded files from non-PRO users
      if (!req.user || !req.user.isPro) {
        // remove the uploaded file from disk if present
        try {
          if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error("Error removing unauthorized upload:", unlinkErr);
        }
        if (req.flash) req.flash("error", "Chỉ tài khoản PRO mới được upload ảnh!");
        return res.status(403).redirect("/news/post");
      }

      // If allowed, set the finalImage to the public URL path
      finalImage = "/uploads/" + req.file.filename;
    }

    const newNews = new News({
      title,
      content,
      category,
      postedBy: req.user._id,
      image: finalImage,
    });
    await newNews.save();
    if (req.flash) req.flash("success", "Tin tức đã được đăng thành công!");
    res.redirect("/news");
  } catch (err) {
    console.error(err);
    if (req.flash) req.flash("error", "Có lỗi xảy ra khi đăng tin.");
    res.redirect("/news/post");
  }
});

// POST /news/:id/edit - Handle updating an existing news post
router.post("/:id/edit", isLoggedIn, isPro, upload.single("image"), async (req, res) => {
  try {
    const { title, content, category, imageUrl } = req.body;
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) {
      req.flash("error", "Tin tức không tồn tại.");
      return res.redirect("/news");
    }
    // Chỉ cho phép tác giả của tin mới được cập nhật
    if (newsItem.postedBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền chỉnh sửa tin tức này.");
      return res.redirect("/news");
    }
    // Nếu tin hoặc cập nhật sang "Tài khoản PRO", kiểm tra quyền PRO
    if (category === "Tài khoản PRO" && !(req.user && req.user.isPro)) {
      req.flash("error", "Tính năng này chỉ dành cho tài khoản PRO.");
      return res.redirect("/news");
    }

    // Determine final image
    let finalImage = imageUrl || newsItem.image || '';

    if (req.file) {
      if (!req.user || !req.user.isPro) {
        // remove uploaded file
        try {
          if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error("Error removing unauthorized upload:", unlinkErr);
        }
        if (req.flash) req.flash("error", "Chỉ tài khoản PRO mới được upload ảnh!");
        return res.redirect(`/news/${req.params.id}/edit`);
      }
      finalImage = "/uploads/" + req.file.filename;
    }

    // Cập nhật thông tin tin tức
    newsItem.title = title;
    newsItem.content = content;
    newsItem.category = category;
    newsItem.image = finalImage;
    await newsItem.save();
    req.flash("success", "Tin tức đã được cập nhật thành công.");
    res.redirect(`/news/${req.params.id}`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Có lỗi xảy ra khi cập nhật tin.");
    res.redirect(`/news/${req.params.id}/edit`);
  }
});

// POST /news/:id/delete - Immediately handle deletion of a news post
router.post("/:id/delete", isLoggedIn, async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id);
    if (!newsItem) {
      req.flash("error", "Tin tức không tồn tại.");
      return res.redirect("/news");
    }
    // Chỉ cho phép xóa tin nếu người dùng là tác giả đăng tin.
    if (newsItem.postedBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền xóa tin tức này.");
      return res.redirect("/news");
    }
    // Nếu tin thuộc "Tài khoản PRO", kiểm tra nếu người dùng là PRO
    if (newsItem.category === "Tài khoản PRO" && !(req.user && req.user.isPro)) {
      req.flash("error", "Tính năng này chỉ dành cho tài khoản PRO.");
      return res.redirect("/news");
    }
    // Xóa tin tức ngay lập tức
    await newsItem.remove();
    req.flash("success", "Tin tức đã được xóa thành công.");
    res.redirect("/news");
  } catch (err) {
    console.error(err);
    req.flash("error", "Có lỗi xảy ra khi xóa tin tức.");
    res.redirect("/news");
  }
});

// GET /news/:id - News detail page
router.get("/:id", async (req, res) => {
  try {
    const newsItem = await News.findById(req.params.id)
      .populate("subject", "name")
      .populate("postedBy", "username avatar _id");
    if (!newsItem) return res.send("Tin tức không tồn tại.");

    // Nếu tin thuộc "Tài khoản PRO", chỉ hiển thị nếu user là PRO
    if (newsItem.category === "Tài khoản PRO" && !(req.user && req.user.isPro)) {
      req.flash("error", "Tính năng này chỉ dành cho tài khoản PRO.");
      return res.redirect("/news");
    }

    res.render("newsDetail", { user: req.user, newsItem, marked });
  } catch (err) {
    console.error(err);
    res.send("Lỗi khi tải tin chi tiết.");
  }
});

module.exports = router;

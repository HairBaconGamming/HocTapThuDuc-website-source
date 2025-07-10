// routes/news.js
const express = require("express");
const marked = require("marked");
const router = express.Router();
const News = require("../models/News");
const Subject = require("../models/Subject");
const { isLoggedIn, isPro } = require("../middlewares/auth");

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
      .populate("postedBy", "username") // Populate posting user's username
      .sort({ createdAt: sortOrder })
      .limit(10);

    // For filter dropdown, get subjects
    const subjects = await Subject.find({});

    res.render("news", {
      user: req.user,
      newsItems,
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
      newsItem,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Có lỗi xảy ra khi tải trang chỉnh sửa tin.");
    res.redirect("/news");
  }
});

// POST /news/post - Handle posting news (only for PRO users)
router.post("/post", isLoggedIn, isPro, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    // Save the ID of the user posting the news
    const newNews = new News({
      title,
      content,
      category,
      postedBy: req.user._id,
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
router.post("/:id/edit", isLoggedIn, isPro, async (req, res) => {
  try {
    const { title, content, category } = req.body;
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
    // Cập nhật thông tin tin tức
    newsItem.title = title;
    newsItem.content = content;
    newsItem.category = category;
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
      .populate("postedBy", "username");
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

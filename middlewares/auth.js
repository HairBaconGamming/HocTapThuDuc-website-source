// middlewares/auth.js

// Kiểm tra xem người dùng đã đăng nhập hay chưa
module.exports.isLoggedIn = function (req, res, next) {
  if (req.user) {
    // Người dùng đã đăng nhập, tiếp tục xử lý
    return next();
  } else {
    // Người dùng chưa đăng nhập
    if (req.accepts('html')) {
      // Trả về trang đăng nhập nếu là HTML request
      return res.redirect('/login');
    } else {
      // Trả về lỗi JSON với mã 401 cho API hoặc AJAX
      return res.status(401).json({ error: "Bạn cần đăng nhập để truy cập tính năng này" });
    }
  }
};

// Kiểm tra xem người dùng đã đăng nhập và có tài khoản Pro không
module.exports.isPro = function (req, res, next) {
  // Kiểm tra đăng nhập trước
  if (!req.user) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    } else {
      return res.status(403).json({ error: "Bạn cần đăng nhập để truy cập tính năng này" });
    }
  }

  // Kiểm tra quyền tài khoản Pro
  if (req.user.isPro) {
    return next();
  } else {
    if (req.accepts('html')) {
      return res.redirect('/upgrade');
    } else {
      return res.status(403).json({ error: "Tính năng này chỉ dành cho tài khoản PRO" });
    }
  }
};

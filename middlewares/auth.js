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

const User = require('../models/User');


// ===== MIDDLEWARES PHÂN QUYỀN ADMIN PANEL MỚI =====
// =======================================================

// Middleware: Chỉ cho phép ADMIN cấp cao nhất
module.exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
       return res.status(403).json({ error: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.' });
    }
    req.flash('error', 'Bạn không có quyền truy cập khu vực này.');
    return res.redirect('/');
};

// Middleware: Cho phép GIÁO VIÊN hoặc ADMIN
module.exports.isTeacher = (req, res, next) => {
    if (req.user && (req.user.isTeacher || req.user.isAdmin)) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
       return res.status(403).json({ error: 'Quyền truy cập bị từ chối. Chỉ dành cho Giáo viên hoặc Admin.' });
    }
    req.flash('error', 'Bạn không có quyền truy cập khu vực này.');
    return res.redirect('/');
};

// Middleware phức tạp: Kiểm tra quyền quản lý người dùng
// Admin có thể quản lý mọi user.
// Teacher chỉ có thể quản lý user thường, không thể quản lý Teacher khác hoặc Admin.
module.exports.canManageUsers = async (req, res, next) => {
    // Admin có toàn quyền
    if (req.user.isAdmin) {
        return next();
    }

    // Teacher có quyền hạn chế
    if (req.user.isTeacher) {
        try {
            const targetUser = await User.findById(req.params.id).lean();
            if (!targetUser) {
                return res.status(404).json({ error: 'Không tìm thấy người dùng mục tiêu.' });
            }
            // Teacher không thể tác động lên Admin hoặc Teacher khác
            if (targetUser.isAdmin || targetUser.isTeacher) {
                return res.status(403).json({ error: 'Giáo viên không có quyền quản lý tài khoản cấp cao hơn hoặc ngang cấp.' });
            }
            return next(); // Cho phép quản lý user thường
        } catch (error) {
            console.error("Error in canManageUsers middleware:", error);
            return res.status(500).json({ error: 'Lỗi máy chủ khi kiểm tra quyền.' });
        }
    }

    // Nếu không phải cả hai, từ chối
    return res.status(403).json({ error: 'Quyền truy cập bị từ chối.' });
};
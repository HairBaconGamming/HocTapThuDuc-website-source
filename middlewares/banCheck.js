// middlewares/banCheck.js

async function banCheck(req, res, next) {
  try {
    // Nếu route là /logout, cho phép tiếp tục để người dùng có thể đăng xuất
    if (req.path === '/logout') {
      return next();
    }

    if (req.user && req.user.isBanned) {
      if (req.path.startsWith('/api') || req.xhr) {
          return res.status(403).json({ error: "Tài khoản của bạn đã bị khóa." });
      }
      return res.status(403).render("banned", { title: "Tài khoản bị khóa", user: req.user, activePage: 'banned' });
    }

    next();
  } catch (err) {
    console.error("❌ Error checking ban:", err.message);
    next(); // Continue anyway to avoid blocking users
  }
}

module.exports = { banCheck };

const express = require("express");
const router = express.Router();
const passport = require("passport");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Models & Middlewares
const User = require("../models/User");
const { isLoggedIn, hasProAccess } = require("../middlewares/auth");

// Utils
const { getJwtSecret } = require("../utils/secrets");
const { achievementChecker } = require("../utils/achievementUtils");
const { getGoogleOAuthConfig } = require("../utils/googleOAuth");
const { classifyGoogleOAuthCallbackFailure } = require("../utils/googleOAuthCallback");
const {
  sanitizeInternalRedirect,
  getSafeRefererPath,
  rememberReturnTo,
  getRememberedReturnTo,
  consumeReturnTo
} = require("../utils/authRedirect");

// Constants
const JWT_SECRET = getJwtSecret();
const googleOAuthConfig = getGoogleOAuthConfig();

// Danh sách trường học (Nên đưa ra file config/constants riêng)
// Danh sách trường THCS và THPT tại TP Thủ Đức (Cập nhật mới nhất)
const validSchools = [
    // ================= CÁC TRƯỜNG THPT CÔNG LẬP =================
    "THPT Nguyễn Hữu Huân",
    "THPT Thủ Đức",
    "THPT Phước Long",
    "THPT Linh Trung",
    "THPT Tam Phú",
    "THPT Bình Chiểu",
    "THPT Thủ Thiêm",
    "THPT Giồng Ông Tố",
    "THPT Long Trường",
    "THPT Nguyễn Huệ",
    "THPT Nguyễn Văn Tăng",
    "THPT Đào Sơn Tây",
    "THPT Dương Văn Thì",
  
    // ================= CÁC TRƯỜNG THCS CÔNG LẬP =================
    "THCS Trần Quốc Toản",
    "THCS Trần Quốc Toản 1",
    "THCS Hoa Lư",
    "THCS Bình Thọ",
    "THCS Lê Quý Đôn",
    "THCS Lương Định Của",
    "THCS Phước Bình",
    "THCS Hiệp Phú",
    "THCS Xuân Trường",
    "THCS Trường Thọ",
    "THCS An Phú",
    "THCS Nguyễn Văn Bá",
    "THCS Thái Văn Lung",
    "THCS Linh Trung",
    "THCS Đặng Tấn Tài",
    "THCS Phú Hữu",
    "THCS Phước Long",
    "THCS Long Bình",
    "THCS Phước Long B",
  
    // ====== TRƯỜNG CHUYÊN / NĂNG KHIẾU CÓ CƠ SỞ TẠI THỦ ĐỨC ======
    "Phổ thông Năng Khiếu - ĐHQG TP.HCM",
  
    // ============ CÁC TRƯỜNG TƯ THỤC / LIÊN CẤP / QUỐC TẾ ============
    "TH - THCS - THPT Ngô Thời Nhiệm",
    "TH - THCS - THPT Hoa Sen",
    "TH - THCS - THPT Hồng Đức",
    "TH - THCS - THPT Nguyễn Khuyến",
    "TH - THCS - THPT Bách Việt",
    "TH - THCS - THPT Việt Úc (VAS)",
    "THCS - THPT Đông Dương",
    "TH - THCS - THPT Quốc tế Á Châu",
    "TH - THCS - THPT Inspire Khai Nguyên",
    "Trường Song ngữ Quốc tế EMASI Vạn Phúc",
    "TH - THCS Pathway Tuệ Đức",
    "THCS - THPT Trí Đức",
    "THCS - THPT Ngọc Viễn Đông",
    "THCS - THPT Quốc tế APU"
  ];

/* =======================================================
 * ==================== HELPER FUNCTIONS =================
 * ======================================================= */

const isValidUsername = (username) => /^(?=.{8,})[A-Za-z0-9]+$/.test(username);

const buildAuthViewModel = (req, activePage) => ({
  user: req.user || null,
  activePage,
  googleAuthEnabled: googleOAuthConfig.enabled,
  authRedirect: getRememberedReturnTo(req) || '',
  validSchools,
});

const captureAuthReturnTo = (req) => {
  const candidates = [
    req.query.redirect, req.query.returnTo,
    req.body?.redirect, req.body?.returnTo,
    getRememberedReturnTo(req), getSafeRefererPath(req)
  ];

  for (const candidate of candidates) {
    const safe = sanitizeInternalRedirect(candidate);
    if (safe) {
      rememberReturnTo(req, safe);
      return safe;
    }
  }
  return null;
};

const verifyCaptcha = async (req) => {
  const turnstileToken = req.body["cf-turnstile-response"];
  const hToken = req.body["h-captcha-response"];

  try {
    if (turnstileToken) {
      const res = await axios.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
        new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken, remoteip: req.ip })
      );
      if (res.data.success) return true;
    }
    
    // Fallback to hCaptcha
    if (hToken) {
      const res = await axios.post("https://hcaptcha.com/siteverify",
        new URLSearchParams({ secret: process.env.HCAPTCHA_SECRET_KEY, response: hToken, remoteip: req.ip })
      );
      if (res.data.success) return true;
    }
  } catch (error) {
    console.error("Captcha verification error:", error.message);
  }
  
  return false;
};

const finalizeLogin = async (req, res, user, options = {}) => {
  try {
    user.lastLoginIP = req.ip;
    user.lastLoginUA = req.get("User-Agent") || "Unknown";
    await user.save();

    const newAchievements = [];
    if (options.isNewUser) {
      const regAchievements = await achievementChecker.onUserRegistered(user._id);
      if (regAchievements?.length) newAchievements.push(...regAchievements);
    }

    const loginAchievements = await achievementChecker.onUserLogin(user._id);
    if (loginAchievements?.length) newAchievements.push(...loginAchievements);

    if (newAchievements.length > 0) req.session.newAchievements = newAchievements;
  } catch (error) {
    console.error("Error finalizing login:", error);
  }

  const redirectToForum = options.redirectToForum || req.session.oauthRedirectToForum === true;
  delete req.session.oauthRedirectToForum;

  if (redirectToForum && process.env.FORUM_APP_URL) {
    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email, isPro: user.isPro, isAdmin: user.isAdmin, isTeacher: user.isTeacher },
      JWT_SECRET,
      { expiresIn: "1d" }
    );
    return res.redirect(`${process.env.FORUM_APP_URL}#token=${token}`);
  }

  req.flash("success", options.successMessage || "Đăng nhập thành công!");
  const safeRedirect = sanitizeInternalRedirect(options.redirectTo) || consumeReturnTo(req) || "/";
  return res.redirect(safeRedirect);
};


/* =======================================================
 * ======================= ROUTES ========================
 * ======================================================= */

// --- LOGIN ---
router.get("/login", (req, res) => {
  captureAuthReturnTo(req);
  return res.render("login", buildAuthViewModel(req, "login"));
});

router.post("/login", (req, res, next) => {
  captureAuthReturnTo(req);
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash("error", info.message || "Đăng nhập thất bại.");
      return res.redirect("/login");
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return finalizeLogin(req, res, user, {
        redirectToForum: req.body.redirect_to_forum === "true",
        successMessage: "Đăng nhập thành công!",
      });
    });
  })(req, res, next);
});

// --- GOOGLE OAUTH ---
router.get("/auth/google", (req, res, next) => {
  if (!googleOAuthConfig.enabled) {
    req.flash("error", "Đăng nhập Google chưa được cấu hình hoàn chỉnh.");
    return res.redirect("/login");
  }

  captureAuthReturnTo(req);
  req.session.oauthRedirectToForum = req.query.redirect_to_forum === "true";

  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })(req, res, next);
});

router.get("/auth/google/callback", (req, res, next) => {
  if (!googleOAuthConfig.enabled) {
    req.flash("error", "Đăng nhập Google chưa được cấu hình hoàn chỉnh.");
    return res.redirect("/login");
  }

  const preflightFailure = classifyGoogleOAuthCallbackFailure({ query: req.query });
  if (preflightFailure) {
    console[preflightFailure.logLevel || "warn"](`[auth/google/callback] ${preflightFailure.logMessage}`);
    req.flash("error", preflightFailure.userMessage);
    return res.redirect("/login");
  }

  passport.authenticate("google", (err, user, info = {}) => {
    const callbackFailure = classifyGoogleOAuthCallbackFailure({ query: req.query, err });
    if (callbackFailure) {
      console[callbackFailure.logLevel || "warn"](`[auth/google/callback] ${callbackFailure.logMessage}`);
      req.flash("error", callbackFailure.userMessage);
      return res.redirect("/login");
    }

    if (err) return next(err);
    
    if (!user) {
      if (info?.isNewGoogleUser) {
        req.session.pendingGoogleUser = info.profileData;
        return res.redirect("/register/google-setup");
      }
      req.flash("error", info.message || "Đăng nhập Google thất bại.");
      return res.redirect("/login");
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);

      const successMessage = info.isNewUser ? "Tạo tài khoản bằng Google thành công!" 
                           : info.linkedGoogle ? "Đã liên kết Google và đăng nhập thành công!" 
                           : "Đăng nhập Google thành công!";

      return finalizeLogin(req, res, user, {
        isNewUser: Boolean(info.isNewUser),
        successMessage,
      });
    });
  })(req, res, next);
});

// --- REGISTER ---
router.get("/register", (req, res) => {
  captureAuthReturnTo(req);
  return res.render("register", buildAuthViewModel(req, "register"));
});

router.post("/register", async (req, res) => {
  captureAuthReturnTo(req);
  const { username, password, class: userClass, school } = req.body;

  if (!isValidUsername(username)) {
    req.flash("error", "Username tối thiểu 8 ký tự, chỉ gồm chữ và số.");
    return res.redirect("/register");
  }

  /* Uncomment if strict school validation is needed
  if (!validSchools.includes(school)) {
    req.flash("error", "Trường học không hợp lệ.");
    return res.redirect("/register");
  } */

  const isCaptchaValid = await verifyCaptcha(req);
  if (!isCaptchaValid) {
    req.flash("error", "Vui lòng xác thực Captcha thành công.");
    return res.redirect("/register");
  }

  try {
    const newUser = new User({ username, password, class: userClass, school });
    await newUser.save();

    try { await achievementChecker.onUserRegistered(newUser._id); } 
    catch (err) { console.error("Achievement error:", err); }

    req.app.locals.io.emit("liveAccess", { username: newUser.username, time: new Date().toLocaleString("vi-VN"), type: "register" });
    
    req.flash("success", "Đăng ký thành công!");
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    req.flash("error", "Đăng ký thất bại (Username có thể đã tồn tại).");
    res.redirect("/register");
  }
});

// --- GOOGLE SETUP (New Users) ---
router.get("/register/google-setup", (req, res) => {
  if (!req.session.pendingGoogleUser) return res.redirect("/register");
  
  const viewModel = buildAuthViewModel(req, "register");
  viewModel.pendingGoogleUser = req.session.pendingGoogleUser;
  return res.render("googleSetup", viewModel);
});

router.post("/register/google-setup", async (req, res, next) => {
  if (!req.session.pendingGoogleUser) return res.redirect("/register");
  
  const { username, class: userClass, school } = req.body;
  
  if (!isValidUsername(username)) {
    req.flash("error", "Username tối thiểu 8 ký tự, chỉ gồm chữ và số.");
    return res.redirect("/register/google-setup");
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      req.flash("error", "Username đã tồn tại, vui lòng chọn tên khác.");
      return res.redirect("/register/google-setup");
    }

    const profileData = req.session.pendingGoogleUser;
    const newUser = new User({
      username,
      password: crypto.randomBytes(24).toString("hex"), // Random secure password
      email: profileData.email,
      googleId: profileData.googleId,
      avatar: profileData.avatar || undefined,
      class: userClass,
      school: school
    });

    await newUser.save();
    delete req.session.pendingGoogleUser;

    try { await achievementChecker.onUserRegistered(newUser._id); } 
    catch (err) { console.error(err); }

    req.app.locals.io.emit("liveAccess", { username: newUser.username, time: new Date().toLocaleString("vi-VN"), type: "register" });

    req.logIn(newUser, (loginErr) => {
      if (loginErr) return next(loginErr);
      return finalizeLogin(req, res, newUser, {
        isNewUser: true,
        successMessage: "Tạo tài khoản bằng Google thành công!",
      });
    });

  } catch (err) {
    console.error(err);
    req.flash("error", "Đăng ký thất bại.");
    res.redirect("/register/google-setup");
  }
});

// --- LOGOUT ---
router.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// --- UPGRADE PRO ---
router.get("/upgrade", isLoggedIn, (req, res) => {
  if (hasProAccess(req.user)) return res.redirect("/dashboard");
  res.render("upgrade", { user: req.user, activePage: "upgrade" });
});

router.post("/upgrade/activate", isLoggedIn, async (req, res) => {
  const { secretKey } = req.body;

  if (!req.user.proSecretKey) {
    req.flash("error", "Tài khoản này chưa được cấp mã kích hoạt. Vui lòng liên hệ Admin/GV.");
    return res.redirect("/upgrade");
  }

  if (secretKey.trim() === req.user.proSecretKey.trim()) {
    req.user.isPro = true;
    // req.user.proSecretKey = null; // Xóa key nếu chỉ cho dùng 1 lần
    await req.user.save();
    
    req.flash("success", "Chúc mừng! Bạn đã trở thành VIP Member.");
  } else {
    req.flash("error", "Mã kích hoạt không chính xác.");
  }
  
  res.redirect("/upgrade");
});

module.exports = router;
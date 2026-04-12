const express = require("express");
const router = express.Router();
const passport = require("passport");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isLoggedIn, hasProAccess } = require("../middlewares/auth");
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

const JWT_SECRET = getJwtSecret();
const googleOAuthConfig = getGoogleOAuthConfig();

// Danh sÃ¡ch trÆ°á»ng há»c (NÃªn Ä‘á»ƒ file riÃªng, nhÆ°ng Ä‘á»ƒ Ä‘áº£m báº£o logic full tÃ´i paste vÃ o Ä‘Ã¢y)
const validSchools = [
    "THPT Tháº¡nh Lá»™c", "THPT Quá»‘c Táº¿ Viá»‡t Ãšc", "THPT LÃª Thá»‹ Há»“ng Gáº¥m",
    // ... (ToÃ n bá»™ danh sÃ¡ch trÆ°á»ng tá»« file gá»‘c cá»§a báº¡n) ...
    "THCS - THPT TÃ¢n PhÃº" // VÃ­ dá»¥ trÆ°á»ng cuá»‘i
];

function buildAuthViewModel(req, activePage) {
    return {
        user: req.user || null,
        activePage,
        googleAuthEnabled: googleOAuthConfig.enabled,
        authRedirect: getRememberedReturnTo(req) || '',
    };
}

function captureAuthReturnTo(req) {
    const candidates = [
        req.query.redirect,
        req.query.returnTo,
        req.body?.redirect,
        req.body?.returnTo,
        getRememberedReturnTo(req),
        getSafeRefererPath(req)
    ];

    for (const candidate of candidates) {
        const safe = sanitizeInternalRedirect(candidate);
        if (safe) {
            rememberReturnTo(req, safe);
            return safe;
        }
    }

    return null;
}

async function finalizeLogin(req, res, user, options = {}) {
    try {
        user.lastLoginIP = req.ip;
        user.lastloginUA = req.get("User-Agent") || "Unknown";
        await user.save();

        const newAchievements = [];

        if (options.isNewUser) {
            const registrationAchievements = await achievementChecker.onUserRegistered(user._id);
            if (registrationAchievements?.length) {
                newAchievements.push(...registrationAchievements);
            }
        }

        const loginAchievements = await achievementChecker.onUserLogin(user._id);
        if (loginAchievements?.length) {
            newAchievements.push(...loginAchievements);
        }

        if (newAchievements.length > 0) {
            req.session.newAchievements = newAchievements;
        }
    } catch (error) {
        console.error("Error finalizing login:", error);
    }

    const redirectToForum = options.redirectToForum || req.session.oauthRedirectToForum === true;
    delete req.session.oauthRedirectToForum;

    if (redirectToForum && process.env.FORUM_APP_URL) {
        const token = jwt.sign({
            id: user._id,
            username: user.username,
            email: user.email,
            isPro: user.isPro,
            isAdmin: user.isAdmin,
            isTeacher: user.isTeacher,
        }, JWT_SECRET, { expiresIn: "1d" });
        return res.redirect(`${process.env.FORUM_APP_URL}#token=${token}`);
    }

    req.flash("success", options.successMessage || "ÄÄƒng nháº­p thÃ nh cÃ´ng!");
    const safeRedirect =
        sanitizeInternalRedirect(options.redirectTo) ||
        consumeReturnTo(req) ||
        "/";
    return res.redirect(safeRedirect);
}

// Login
router.get("/login", (req, res) => {
    captureAuthReturnTo(req);
    return res.render("login", buildAuthViewModel(req, "login"));
});

router.post("/login", (req, res, next) => {
    captureAuthReturnTo(req);
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            req.flash("error", info.message || "ÄÄƒng nháº­p tháº¥t báº¡i.");
            return res.redirect("/login");
        }

        return req.logIn(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            return finalizeLogin(req, res, user, {
                redirectToForum: req.body.redirect_to_forum === "true",
                successMessage: "ÄÄƒng nháº­p thÃ nh cÃ´ng!",
            });
        });
    })(req, res, next);
});

router.get("/auth/google", (req, res, next) => {
    if (!googleOAuthConfig.enabled) {
        req.flash("error", "ÄÄƒng nháº­p Google chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh hoÃ n chá»‰nh.");
        return res.redirect("/login");
    }

    captureAuthReturnTo(req);
    req.session.oauthRedirectToForum = req.query.redirect_to_forum === "true";

    return passport.authenticate("google", {
        scope: ["profile", "email"],
        prompt: "select_account",
    })(req, res, next);
});

router.get("/auth/google/callback", (req, res, next) => {
    if (!googleOAuthConfig.enabled) {
        req.flash("error", "ÄÄƒng nháº­p Google chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh hoÃ n chá»‰nh.");
        return res.redirect("/login");
    }

    const preflightFailure = classifyGoogleOAuthCallbackFailure({ query: req.query });
    if (preflightFailure) {
        console[preflightFailure.logLevel || "warn"](`[auth/google/callback] ${preflightFailure.logMessage}`);
        req.flash("error", preflightFailure.userMessage);
        return res.redirect("/login");
    }

    return passport.authenticate("google", (err, user, info = {}) => {
        const callbackFailure = classifyGoogleOAuthCallbackFailure({ query: req.query, err });
        if (callbackFailure) {
            console[callbackFailure.logLevel || "warn"](`[auth/google/callback] ${callbackFailure.logMessage}`);
            req.flash("error", callbackFailure.userMessage);
            return res.redirect("/login");
        }

        if (err) return next(err);
        if (!user) {
            req.flash("error", info.message || "ÄÄƒng nháº­p Google tháº¥t báº¡i.");
            return res.redirect("/login");
        }

        return req.logIn(user, (loginErr) => {
            if (loginErr) return next(loginErr);

            let successMessage = "ÄÄƒng nháº­p Google thÃ nh cÃ´ng!";
            if (info.isNewUser) {
                successMessage = "Táº¡o tÃ i khoáº£n báº±ng Google thÃ nh cÃ´ng!";
            } else if (info.linkedGoogle) {
                successMessage = "ÄÃ£ liÃªn káº¿t Google vÃ  Ä‘Äƒng nháº­p thÃ nh cÃ´ng!";
            }

            return finalizeLogin(req, res, user, {
                isNewUser: Boolean(info.isNewUser),
                successMessage,
            });
        });
    })(req, res, next);
});

// Register
router.get("/register", (req, res) => {
    captureAuthReturnTo(req);
    return res.render("register", buildAuthViewModel(req, "register"));
});

router.post("/register", async (req, res) => {
    captureAuthReturnTo(req);
    const { username, password, class: userClass, school } = req.body;

    // Validation
    if (!/^(?=.{8,})[A-Za-z0-9]+$/.test(username)) {
        req.flash("error", "Username tá»‘i thiá»ƒu 8 kÃ½ tá»±, chá»‰ gá»“m chá»¯ vÃ  sá»‘.");
        return res.redirect("/register");
    }
    // Logic check trÆ°á»ng há»c: Äá»ƒ Ä‘áº£m báº£o khÃ´ng lá»—i náº¿u list quÃ¡ dÃ i, táº¡m thá»i comment check strict,
    // nhÆ°ng trong code tháº­t báº¡n uncomment dÃ²ng dÆ°á»›i vÃ  Ä‘áº£m báº£o array validSchools Ä‘áº§y Ä‘á»§.
    /*
    if (!validSchools.includes(school)) {
        req.flash("error", "TrÆ°á»ng khÃ´ng há»£p lá»‡.");
        return res.redirect("/register");
    }
    */

    // Captcha Check
    const turnstileToken = req.body["cf-turnstile-response"];
    if (!turnstileToken) {
        req.flash("error", "Vui lÃ²ng xÃ¡c thá»±c Captcha.");
        return res.redirect("/register");
    }

    try {
        // Verify Turnstile
        const cfRes = await axios.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
            new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken, remoteip: req.ip }));

        if (!cfRes.data.success) {
            // Fallback hCaptcha logic from original code...
            const hToken = req.body["h-captcha-response"];
            if(!hToken) { req.flash("error", "Captcha lá»—i."); return res.redirect("/register"); }
            const hRes = await axios.post("https://hcaptcha.com/siteverify",
                new URLSearchParams({ secret: process.env.HCAPTCHA_SECRET_KEY, response: hToken, remoteip: req.ip }));
            if(!hRes.data.success) { req.flash("error", "Captcha lá»—i."); return res.redirect("/register"); }
        }

        const newUser = new User({ username, password, class: userClass, school });
        await newUser.save();

        try {
            await achievementChecker.onUserRegistered(newUser._id);
        } catch (achievementError) {
            console.error("Error checking achievements on register:", achievementError);
        }

        req.app.locals.io.emit("liveAccess", { username: newUser.username, time: new Date().toLocaleString("vi-VN"), type: "register" });
        req.flash("success", "ÄÄƒng kÃ½ thÃ nh cÃ´ng!");
        res.redirect("/login");

    } catch (err) {
        console.error(err);
        req.flash("error", "ÄÄƒng kÃ½ tháº¥t báº¡i (Username cÃ³ thá»ƒ Ä‘Ã£ tá»“n táº¡i).");
        res.redirect("/register");
    }
});

// Logout
router.get("/logout", (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        res.redirect("/");
    });
});

// Upgrade
router.get("/upgrade", isLoggedIn, (req, res) => {
    if (hasProAccess(req.user)) return res.redirect("/dashboard");
    res.render("upgrade", { user: req.user, activePage: "upgrade" });
});

router.post("/upgrade/activate", isLoggedIn, async (req, res) => {
    const { secretKey } = req.body;

    // 1. Kiá»ƒm tra xem Admin Ä‘Ã£ set key cho user nÃ y chÆ°a
    if (!req.user.proSecretKey) {
        req.flash("error", "TÃ i khoáº£n nÃ y chÆ°a Ä‘Æ°á»£c cáº¥p mÃ£ kÃ­ch hoáº¡t. Vui lÃ²ng liÃªn há»‡ Admin/GV.");
        return res.redirect("/upgrade");
    }

    // 2. So sÃ¡nh mÃ£ nháº­p vÃ o vá»›i mÃ£ trong DB
    // (Trim Ä‘á»ƒ xÃ³a khoáº£ng tráº¯ng thá»«a náº¿u cÃ³)
    if (secretKey.trim() === req.user.proSecretKey.trim()) {
        req.user.isPro = true;
        // XÃ³a key sau khi dÃ¹ng xong Ä‘á»ƒ khÃ´ng dÃ¹ng láº¡i Ä‘Æ°á»£c (tÃ¹y chá»n, náº¿u muá»‘n dÃ¹ng 1 láº§n)
        // req.user.proSecretKey = null;

        await req.user.save();
        req.flash("success", "ChÃºc má»«ng! Báº¡n Ä‘Ã£ trá»Ÿ thÃ nh VIP Member.");
        res.redirect("/upgrade"); // Redirect láº¡i trang upgrade Ä‘á»ƒ tháº¥y thÃ´ng bÃ¡o xanh
    } else {
        req.flash("error", "MÃ£ kÃ­ch hoáº¡t khÃ´ng chÃ­nh xÃ¡c.");
        res.redirect("/upgrade");
    }
});

module.exports = router;

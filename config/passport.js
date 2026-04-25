const crypto = require("crypto");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const LocalStrategy = require("passport-local").Strategy;
const slugify = require("slugify");
const User = require("../models/User");
const { getGoogleOAuthConfig } = require("../utils/googleOAuth");

async function generateUniqueUsername(source) {
    const slug = slugify(source || "hoc-vien", {
        lower: true,
        strict: true,
        locale: "vi",
        trim: true,
    }).replace(/-/g, "");

    const base = (slug || "hocvien").slice(0, 18);

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const suffix = crypto.randomBytes(3).toString("hex");
        const candidate = `${base}${suffix}`.slice(0, 24);
        const exists = await User.exists({ username: candidate });
        if (!exists) return candidate;
    }

    return `hocvien${Date.now().toString().slice(-8)}`;
}

module.exports = function(passport) {
    passport.use(new LocalStrategy(async (username, password, done) => {
        try {
            const user = await User.findOne({ username });
            if (!user) return done(null, false, { message: "TÃªn ngÆ°á»i dÃ¹ng khÃ´ng tá»“n táº¡i." });

            const isMatch = await new Promise((resolve, reject) => {
                user.comparePassword(password, (err, match) => {
                    if (err) return reject(err);
                    resolve(match);
                });
            });

            if (!isMatch) return done(null, false, { message: "Máº­t kháº©u khÃ´ng chÃ­nh xÃ¡c." });
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }));

    const googleConfig = getGoogleOAuthConfig();
    if (googleConfig.enabled) {
        passport.use(new GoogleStrategy({
            clientID: googleConfig.clientId,
            clientSecret: googleConfig.clientSecret,
            callbackURL: googleConfig.callbackURL,
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                const googleId = profile.id;
                const email = (profile.emails?.[0]?.value || "").trim().toLowerCase();
                const emailVerified = profile._json?.email_verified !== false;
                const avatar = profile.photos?.[0]?.value || "";

                if (!email || !emailVerified) {
                    return done(null, false, { message: "TÃ i khoáº£n Google chÆ°a cÃ³ email há»£p lá»‡ hoáº·c chÆ°a xÃ¡c minh." });
                }

                const existingGoogleUser = await User.findOne({ googleId });
                if (existingGoogleUser) {
                    if (avatar && existingGoogleUser.avatar !== avatar) {
                        existingGoogleUser.avatar = avatar;
                        await existingGoogleUser.save();
                    }
                    return done(null, existingGoogleUser, { isNewUser: false });
                }

                const existingEmailUser = await User.findOne({ email });
                if (existingEmailUser) {
                    existingEmailUser.googleId = googleId;
                    existingEmailUser.email = email;
                    if (avatar && (!existingEmailUser.avatar || existingEmailUser.avatar.includes("default-avatar"))) {
                        existingEmailUser.avatar = avatar;
                    }
                    await existingEmailUser.save();
                    return done(null, existingEmailUser, { isNewUser: false, linkedGoogle: true });
                }

                // Return information to prompt for a custom username instead of auto-creating
                const usernameSeed = email.split("@")[0] || profile.displayName || "";
                
                return done(null, false, {
                    isNewGoogleUser: true,
                    profileData: {
                        email,
                        googleId,
                        avatar: avatar || undefined,
                        suggestedUsername: usernameSeed
                    }
                });
            } catch (err) {
                return done(err);
            }
        }));
    } else {
        console.warn("Google OAuth is disabled because GOOGLE_ID/GOOGLE_SECRET (or GOOGLE_OAUTH_CONFIG_PATH) is missing.");
    }

    passport.serializeUser((user, done) => done(null, user.id));

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
};

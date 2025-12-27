const LocalStrategy = require("passport-local").Strategy;
const User = require("../models/User");

module.exports = function(passport) {
    passport.use(new LocalStrategy(async (username, password, done) => {
        try {
            const user = await User.findOne({ username: username });
            if (!user) return done(null, false, { message: "Tên người dùng không tồn tại." });
            
            const isMatch = await new Promise((resolve, reject) => {
                user.comparePassword(password, (err, match) => {
                    if (err) return reject(err);
                    resolve(match);
                });
            });

            if (!isMatch) return done(null, false, { message: "Mật khẩu không chính xác." });
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }));

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
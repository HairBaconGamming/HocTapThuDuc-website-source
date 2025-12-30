const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, default: "" },
    bio: { type: String, default: "" },
    class: { type: String, default: "" },
    school: { type: String, default: "" },
    isPro: { type: Boolean, default: false },
    isTeacher: { type: Boolean, default: false }, 
    isAdmin: { type: Boolean, default: false },   
    proSecretKey: { type: String, default: "" },
    isBanned: { type: Boolean, default: false },
    lastLoginIP: { type: String, default: "" },
    // --- NEW FIELD ---
    avatar: { type: String, default: "https://cdn.glitch.global/b34fd7c6-dd60-4242-a917-992503c79a1f/7915522.png?v=1745082805191" }, // Default avatar
    points: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Hash password and other hooks remain the same...
UserSchema.pre("save", function (next) {
  const user = this;
  if (!user.isModified("password")) return next();
  bcrypt.hash(user.password, 10, function (err, hash) {
    if (err) return next(err);
    user.password = hash;
    next();
  });
});

UserSchema.methods.comparePassword = function (candidatePassword, cb) {
  bcrypt.compare(candidatePassword, this.password, function (err, isMatch) {
    if (err) return cb(err);
    cb(null, isMatch);
  });
};

module.exports = mongoose.model("User", UserSchema);
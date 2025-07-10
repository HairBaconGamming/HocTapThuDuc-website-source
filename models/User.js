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
    proSecretKey: { type: String, default: "" },
    isBanned: { type: Boolean, default: false },
    lastLoginIP: { type: String, default: "" },
    points: { type: Number, default: 0 }, // Thêm điểm thưởng cho gamification
    // --- Tree Gamification Fields ---
    treeLevel: { type: Number, default: 0, min: 0 }, // Current visual stage of the tree (0 = seed, 1=sprout, etc.)
    growthPoints: { type: Number, default: 0, min: 0 }, // Accumulated points towards the next level
    lastGrowthActivity: { type: Date, default: Date.now }, // Timestamp of the last activity contributing to growth
  },
  {
    timestamps: true, // <-- This automatically adds createdAt and updatedAt
  }
);

// Hash password và các hooks khác giữ nguyên...
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

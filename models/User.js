const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    googleId: { type: String, unique: true, sparse: true },
    bio: { type: String, default: "" },
    class: { type: String, default: "" },
    school: { type: String, default: "" },
    isPro: { type: Boolean, default: false },
    isTeacher: { type: Boolean, default: false }, 
    isAdmin: { type: Boolean, default: false },   
    proSecretKey: { type: String, default: "" },
    isBanned: { type: Boolean, default: false },
    lastLoginIP: { type: String, default: "" },
    lastLoginUA: { type: String, default: "" },
    // --- NEW FIELD ---
    avatar: { type: String, default: "https://static.vecteezy.com/system/resources/previews/013/360/247/non_2x/default-avatar-photo-icon-social-media-profile-sign-symbol-vector.jpg" }, // Default avatar
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', default: null, index: true },
    guildRole: { type: String, enum: ['leader', 'co_leader', 'elder', 'member', 'officer'], default: 'member' },
    joinedGuildAt: { type: Date, default: null },
    points: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    lastStudyRewardAt: { type: Date, default: null },
    currentStreak: { type: Number, default: 0 }, // Chuỗi học liên tiếp (ngày)
    lastStudyDate: { type: Date, default: null }, // Ngày học cuối cùng
    // --- NEW FIELDS FOR IDENTITY & CULTIVATION ---
    displayName: { type: String, default: "" },
    showCultivation: { type: Boolean, default: true },
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

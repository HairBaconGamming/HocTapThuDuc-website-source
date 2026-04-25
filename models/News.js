// models/News.js
const mongoose = require("mongoose");

const NewsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, required: true }, // e.g., "Học tập", "Tuyển sinh", "Tài khoản PRO"
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  image: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 },
  reactions: {
    like: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    heart: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    haha: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    sad: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    angry: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] }
  }
});

module.exports = mongoose.model("News", NewsSchema);

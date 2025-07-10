// models/News.js
const mongoose = require("mongoose");

const NewsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, required: true }, // e.g., "Học tập", "Tuyển sinh", "Tài khoản PRO"
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("News", NewsSchema);

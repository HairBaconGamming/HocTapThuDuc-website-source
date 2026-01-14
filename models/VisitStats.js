// models/VisitStats.js
const mongoose = require("mongoose");

const visitStatsSchema = new mongoose.Schema({
  // Dùng chuỗi ngày (VD: "2023-10-25") để làm khóa chính tìm kiếm cho chính xác
  dateStr: { type: String, unique: true, required: true }, 
  date: { type: Date, default: Date.now }, // Lưu để biết thời điểm tạo
  count: { type: Number, default: 0 }
});

module.exports = mongoose.model("VisitStats", visitStatsSchema);
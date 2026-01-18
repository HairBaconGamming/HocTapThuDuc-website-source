// models/VisitStats.js
const mongoose = require("mongoose");

const visitStatsSchema = new mongoose.Schema({
  // Dùng chuỗi ngày (VD: "2023-10-25") để làm khóa chính tìm kiếm cho chính xác
  dateStr: { type: String, required: true }, 
  date: { type: Date, default: Date.now }, // Lưu để biết thời điểm tạo
  count: { type: Number, default: 0 }
});

// Tạo unique index chỉ cho dateStr (không dùng unique field property)
visitStatsSchema.index({ dateStr: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("VisitStats", visitStatsSchema);
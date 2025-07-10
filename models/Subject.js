// models/Subject.js
const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  image: { type: String } // URL ảnh minh họa (tùy chọn)
});

module.exports = mongoose.model('Subject', SubjectSchema);

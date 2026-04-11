const express = require("express");
const { askTutor } = require("../controllers/aiTutorController");

const router = express.Router();

router.post("/ask", askTutor);

module.exports = router;

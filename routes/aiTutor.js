const express = require("express");
const { askTutor, streamTutor } = require("../controllers/aiTutorController");

const router = express.Router();

router.post("/ask", askTutor);
router.post("/stream", streamTutor);

module.exports = router;

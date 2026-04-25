const express = require("express");
const { askTutor, streamTutor } = require("../controllers/aiTutorController");
const { isLoggedIn } = require("../middlewares/auth");

const router = express.Router();

router.post("/ask", isLoggedIn, askTutor);
router.post("/stream", isLoggedIn, streamTutor);

module.exports = router;

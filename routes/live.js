// routes/live.js
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { isLoggedIn } = require("../middlewares/auth");
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

// Hàm tiện ích để tạo token cho người dùng
function createToken(user) {
  // Chỉ lưu thông tin cơ bản: userId và username, token sống 15 phút
  return jwt.sign(
    { userId: user._id, username: user.username },
    SECRET_KEY,
    { expiresIn: "6h" }
  );
}

// Hiển thị trang tạo live stream
router.get("/create", isLoggedIn, (req, res) => {
  res.render("liveStream", {
    title: "Tạo Live Stream",
    user: req.user,
    activePage: "live"
  });
});

// Route để tạo live stream link cho user chủ phòng
router.post("/create", isLoggedIn, async (req, res) => {
  const roomOwnerId = req.user._id;
  const roomOwnerName = req.user.username;
  try {
    const title = req.body.title || `Live Stream của ${roomOwnerName}`;

    if (!roomOwnerId || !roomOwnerName) {
      return res.status(400).json({ error: "Thiếu thông tin đăng nhập người dùng." });
    }

    // Kiểm tra xem user đã có phòng live chưa bằng cách gọi API lấy danh sách phòng
    const roomListResponse = await axios.get("https://live-hoctap-9a3.glitch.me/api/rooms");
    const existingRoom = roomListResponse.data.find(room => room.ownerid === roomOwnerId);

    
    if (existingRoom) {
      return res.json({
        error: "Bạn đã có một phòng live đang hoạt động.",
        existingRoomUrl: existingRoom.liveStreamUrl,
        roomId: existingRoom.id
      });
    }

    // Nếu chưa có, gọi API tạo phòng live stream
    const payload = { roomOwnerId, roomOwnerName, title };
    const apiResponse = await axios.post("https://live-hoctap-9a3.glitch.me/api/createStream", payload);
    
    if (apiResponse.data.existingRoomUrl) {
      const token = createToken(req.user);
      const urlWithToken = `${apiResponse.data.existingRoomUrl}?token=${token}`;
      return res.status(400).json({
        error: "Bạn đã có một phòng live đang hoạt động.",
        existingRoomUrl: urlWithToken,
        roomId: apiResponse.data.roomId
      });
    }

    if (!apiResponse.data || !apiResponse.data.liveStreamUrl) {
      return res.status(500).json({ error: "Không nhận được URL phòng live từ máy chủ." });
    }

    // Tạo token JWT rút gọn (không chứa IP, UA)
    const token = createToken(req.user);

    const liveStreamUrlWithToken = `${apiResponse.data.liveStreamUrl}?token=${token}`;
    return res.json({ success: true, liveStreamUrl: liveStreamUrlWithToken });
  } catch (error) {
    console.error("❌ Lỗi khi tạo live stream:", error.message);
    console.log(error.existingRoomUrl);
    if (error.existingRoomUrl) {
      return res.status(400).json({
        error: "Bạn đã có một phòng live đang hoạt động.",
        existingRoomUrl: error.existingRoomUrl,
        roomId: error.roomId
      });
    }
    if (error.response && error.response.status === 400) {
      const errorMessage = error.response?.data?.error || "Yêu cầu không hợp lệ.";
      return res.status(400).json({ error: errorMessage });
    }
    return res.status(500).json({ error: "Lỗi không xác định khi tạo live stream." });
  }
});

// Route cho việc tham gia phòng live (redirect sang URL phòng)
router.get("/joinLive/:roomId", isLoggedIn, async (req, res) => {
  const user = req.user;
  try {
    // Tạo token cho người tham gia phòng live (rút gọn payload)
    const token = createToken(user);
    const liveUrl = `https://live-hoctap-9a3.glitch.me/room/${req.params.roomId}?token=${token}`;
    return res.redirect(liveUrl);
  } catch (error) {
    console.error("Lỗi khi lấy token:", error.message);
    return res.status(500).send("Lỗi khi lấy token, vui lòng thử lại.");
  }
});

// Trang danh sách live stream
router.get("/", isLoggedIn, (req, res) => {
  res.render("liveList", { user: req.user, activePage: "live" });
});

// Route lấy token (nếu cần cho việc xác thực thêm) – tạo token rút gọn
router.get("/getToken", isLoggedIn, (req, res) => {
  const roomId = req.query.roomId;
  if (!roomId) {
    return res.status(400).json({ error: "RoomId không hợp lệ." });
  }
  const token = createToken(req.user);
  res.json({ token });
});

module.exports = router;

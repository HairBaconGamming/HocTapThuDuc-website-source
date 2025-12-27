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
  res.render("liveCreate", {
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
    const roomListResponse = await axios.get("https://live-hoctapthuduc.onrender.com/api/rooms");
    const roomsFromApi = Array.isArray(roomListResponse.data) ? roomListResponse.data : [];
    const existingRoom = roomsFromApi.find(room => (room.ownerid === roomOwnerId || room.ownerId === roomOwnerId || room.owner === roomOwnerId));

    if (existingRoom) {
      const token = createToken(req.user);
      const existingUrl = existingRoom.liveStreamUrl || existingRoom.url || existingRoom.liveUrl || null;
      const urlWithToken = existingUrl ? `${existingUrl}${existingUrl.includes('?') ? '&' : '?'}token=${token}` : null;
      return res.status(409).json({
        error: "Bạn đã có một phòng live đang hoạt động.",
        existingRoomUrl: urlWithToken,
        roomId: existingRoom.id || existingRoom._id || existingRoom.roomId
      });
    }

    // Nếu chưa có, gọi API tạo phòng live stream
    const payload = { roomOwnerId, roomOwnerName, title };
    const apiResponse = await axios.post("https://live-hoctapthuduc.onrender.com/api/createStream", payload);
    
    if (apiResponse.data && apiResponse.data.existingRoomUrl) {
      const token = createToken(req.user);
      const existingUrl = apiResponse.data.existingRoomUrl;
      const urlWithToken = `${existingUrl}${existingUrl.includes('?') ? '&' : '?'}token=${token}`;
      return res.status(409).json({
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
    console.error("❌ Lỗi khi tạo live stream:", error?.message || error);

    // Nếu API trả về 409 (Conflict) thì lấy URL phòng hiện có kèm roomId (nếu có)
    if (error.response && error.response.status === 409) {
      const existingUrl = error.response?.data?.existingRoomUrl || error.response?.data?.url || null;
      const roomId = error.response?.data?.roomId || error.response?.data?.id || null;
      if (existingUrl) {
        const token = createToken(req.user);
        const urlWithToken = `${existingUrl}${existingUrl.includes('?') ? '&' : '?'}token=${token}`;
        return res.status(409).json({ error: "Bạn đã có một phòng live đang hoạt động.", existingRoomUrl: urlWithToken, roomId });
      }
      return res.status(409).json({ error: error.response?.data?.error || "Bạn đã có một phòng live đang hoạt động." });
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
    const liveUrl = `https://live-hoctapthuduc.onrender.com/room/${req.params.roomId}?token=${token}`;
    return res.redirect(liveUrl);
  } catch (error) {
    console.error("Lỗi khi lấy token:", error.message);
    return res.status(500).send("Lỗi khi lấy token, vui lòng thử lại.");
  }
});

// Trang danh sách live stream
router.get("/", isLoggedIn, async (req, res) => {
  try {
    const response = await axios.get("https://live-hoctapthuduc.onrender.com/api/rooms");
    const roomsRaw = Array.isArray(response.data) ? response.data : [];
    const rooms = roomsRaw.map(room => ({
      roomId: room.id || room._id || room.roomId,
      roomName: room.title || room.name || room.roomName || 'Phòng Live',
      host: {
        username: room.ownername || room.ownerName || room.username || (room.host && room.host.username) || 'Ẩn danh',
        avatar: room.ownerAvatar || room.avatar || (room.host && room.host.avatar) || 'https://cdn-icons-png.flaticon.com/512/847/847969.png'
      },
      viewers: room.viewers || room.viewerCount || 0
    }));
    res.render("liveList", { user: req.user, activePage: "live", rooms });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách phòng live:", error.message);
    res.render("liveList", { user: req.user, activePage: "live", rooms: [] });
  }
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

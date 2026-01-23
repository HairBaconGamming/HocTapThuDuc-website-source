// utils/realmHelper.js

// Danh sách Cảnh giới (Copy chuẩn từ level.js để đồng bộ)
const REALM_NAMES = [
    // 0-9: Phàm Nhân (Tu Chân)
    "Luyện Khí", "Trúc Cơ", "Kết Đan", "Nguyên Anh", "Hóa Thần", 
    "Luyện Hư", "Hợp Thể", "Đại Thừa", "Độ Kiếp", "Phi Thăng",
    // 10-19: Tiên Đạo
    "Tán Tiên", "Địa Tiên", "Thiên Tiên", "Chân Tiên", "Huyền Tiên",
    "Kim Tiên", "Thái Ất", "Đại La", "Tiên Quân", "Tiên Đế",
    // 20-29: Thần Đạo
    "Thần Nhân", "Chân Thần", "Thiên Thần", "Thần Tướng", "Thần Vương",
    "Thần Hoàng", "Thần Tôn", "Thần Đế", "Cổ Thần", "Tổ Thần",
    // 30-39: Thánh Đạo
    "Bán Thánh", "Sơ Thánh", "Chân Thánh", "Đại Thánh", "Thánh Vương",
    "Thánh Hoàng", "Thánh Tôn", "Thánh Đế", "Thánh Tổ", "Chí Thánh",
    // 40-49: Đạo Cảnh
    "Nhập Đạo", "Ngộ Đạo", "Hợp Đạo", "Chân Đạo", "Đại Đạo",
    "Đạo Quân", "Đạo Tôn", "Đạo Tổ", "Vô Cực", "Thái Cực",
    // 50-59: Hỗn Độn
    "Hỗn Độn Sơ", "Hỗn Độn Trung", "Hỗn Độn Hậu", "Hỗn Độn Viên Mãn", "Hồng Mông",
    "Hư Vô", "Vĩnh Hằng", "Bất Diệt", "Chúa Tể", "Sáng Thế",
    // 60-69: Hư Không
    "Phá Toái", "Lăng Hư", "Quy Khư", "Tịch Diệt", "Niết Bàn",
    "Bỉ Ngạn", "Khổ Hải", "Chân Ngã", "Duy Nhất", "Siêu Thoát",
    // 70-79: Khởi Nguyên
    "Thái Dịch", "Thái Sơ", "Thái Thủy", "Thái Tố", "Thái Cổ",
    "Nguyên Điểm", "Nhân Quả", "Mệnh Số", "Chân Lý", "Bản Nguyên",
    // 80-89: Chí Cao
    "Toàn Tri", "Toàn Năng", "Vô Thượng", "Bất Hủ", "Khái Niệm",
    "Chưởng Khống", "Phán Xét", "Quan Sát", "Hóa Vô", "Tác Giả",
    // 90-99: Vượt Ngưỡng
    "Siêu Việt", "Vô Hạn", "Đa Chiều", "Hư Ảo", "Thực Tại",
    "Lập Trình", "Dữ Liệu", "Mã Nguồn", "Admin", "The One"
];

// Cấu hình Visual cho 10 Kỷ Nguyên (Mỗi kỷ nguyên gồm 10 Đại Cảnh Giới)
const SAGAS = [
    { id: 0, name: "Tu Chân Giới", color: "#38bdf8", icon: "fas fa-wind", desc: "Nghịch thiên cải mệnh, cầu trường sinh." }, // Blue
    { id: 1, name: "Tiên Giới", color: "#facc15", icon: "fas fa-cloud", desc: "Tiên khí phiêu miểu, tiêu dao tự tại." },   // Gold
    { id: 2, name: "Thần Giới", color: "#ef4444", icon: "fas fa-sun", desc: "Thần uy như ngục, chúng sinh quỳ lạy." },     // Red
    { id: 3, name: "Thánh Vực", color: "#c084fc", icon: "fas fa-crown", desc: "Siêu phàm nhập thánh, vạn kiếp bất diệt." }, // Purple
    { id: 4, name: "Đạo Nguyên", color: "#10b981", icon: "fas fa-yin-yang", desc: "Ngộ đạo trường tồn, chưởng khống quy tắc." }, // Green
    { id: 5, name: "Hỗn Độn", color: "#64748b", icon: "fas fa-dragon", desc: "Hỗn độn sơ khai, vạn vật quy nhất." },       // Grey/Slate
    { id: 6, name: "Hư Không", color: "#1e3a8a", icon: "fas fa-meteor", desc: "Hư không tịch diệt, vạn pháp giai không." },  // Dark Blue
    { id: 7, name: "Khởi Nguyên", color: "#ec4899", icon: "fas fa-atom", desc: "Nguồn gốc vạn vật, khởi điểm nhân quả." },   // Pink
    { id: 8, name: "Chí Cao", color: "#f59e0b", icon: "fas fa-eye", desc: "Toàn tri toàn năng, quan sát thế gian." },        // Amber
    { id: 9, name: "Siêu Thoát", color: "#00ff00", icon: "fas fa-code", desc: "Phá vỡ bức tường thứ 4, thao túng thực tại." } // Matrix Green
];

exports.getRealmData = (level) => {
    // Level 0: Phàm Nhân (Trường hợp đặc biệt)
    if (level <= 0) {
        return {
            id: 'pham-nhan',
            name: 'Phàm Nhân',
            color: '#94a3b8',
            icon: 'fas fa-user',
            desc: 'Duyên phận chưa đến, tâm vẫn còn vương vấn hồng trần.',
            progressPercent: 0,
            currentLayer: 0,
            fullName: 'Phàm Nhân',
            sagaId: -1
        };
    }

    // Tính toán index dựa trên level.js: (level - 1) / 10
    const realmIndex = Math.floor((level - 1) / 10);
    
    // Lấy tên cảnh giới (nếu vượt quá max thì lấy cái cuối)
    const name = REALM_NAMES[realmIndex] || REALM_NAMES[REALM_NAMES.length - 1];
    
    // Tính tầng hiện tại (1-10)
    const currentLayer = (level - 1) % 10 + 1;
    
    // Xác định Kỷ Nguyên (Saga) - Mỗi 10 cảnh giới là 1 Saga
    const sagaIndex = Math.floor(realmIndex / 10);
    const saga = SAGAS[sagaIndex] || SAGAS[SAGAS.length - 1];

    // Tính % tiến độ trong tầng này (dùng để hiển thị thanh exp)
    const progressPercent = Math.round((currentLayer / 10) * 100);

    return {
        id: `realm-${realmIndex}`,
        name: name,
        color: saga.color, // Màu sắc theo Kỷ Nguyên
        icon: saga.icon,   // Icon theo Kỷ Nguyên
        desc: saga.desc,   // Mô tả theo Kỷ Nguyên
        level: level,
        progressPercent: progressPercent,
        currentLayer: currentLayer,
        fullName: `${name} - Tầng ${currentLayer}`,
        sagaId: saga.id,
        sagaName: saga.name
    };
};
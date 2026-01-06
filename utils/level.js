// utils/level.js

// --- CẤU HÌNH ĐỘ KHÓ (BALANCED FOR 10^19 MAX XP) ---
const INITIAL_BASE_XP = 200;       // Khởi đầu lv 1 cần 200 XP
const SUB_LEVEL_EXPONENT = 1.2;    // Lũy thừa tăng nhẹ trong cùng 1 cảnh giới (1->9)
const BREAKTHROUGH_MULTIPLIER = 3; // Đột phá tầng 10: Nhân 3 (Thay vì 5)
const NEXT_REALM_DIVISOR = 2;      // Qua cảnh giới mới: Chia 2

/* GIẢI THÍCH SCALING:
   Mỗi Đại Cảnh Giới khó hơn cảnh giới trước khoảng 1.5 lần (3 / 2).
   Sau 100 Đại Cảnh Giới: 1.5^100 ≈ 4 x 10^17 lần.
   Kết hợp với Base XP, Lv 999 sẽ yêu cầu khoảng ~50 Tỷ Tỷ XP.
*/

const MAJOR_REALMS = [
    // 1-10: Phàm Nhân
    "Luyện Khí", "Trúc Cơ", "Kết Đan", "Nguyên Anh", "Hóa Thần", 
    "Luyện Hư", "Hợp Thể", "Đại Thừa", "Độ Kiếp", "Phi Thăng",
    // 11-20: Tiên Đạo
    "Tán Tiên", "Địa Tiên", "Thiên Tiên", "Chân Tiên", "Huyền Tiên",
    "Kim Tiên", "Thái Ất", "Đại La", "Tiên Quân", "Tiên Đế",
    // 21-30: Thần Đạo
    "Thần Nhân", "Chân Thần", "Thiên Thần", "Thần Tướng", "Thần Vương",
    "Thần Hoàng", "Thần Tôn", "Thần Đế", "Cổ Thần", "Tổ Thần",
    // 31-40: Thánh Đạo
    "Bán Thánh", "Sơ Thánh", "Chân Thánh", "Đại Thánh", "Thánh Vương",
    "Thánh Hoàng", "Thánh Tôn", "Thánh Đế", "Thánh Tổ", "Chí Thánh",
    // 41-50: Đạo Cảnh
    "Nhập Đạo", "Ngộ Đạo", "Hợp Đạo", "Chân Đạo", "Đại Đạo",
    "Đạo Quân", "Đạo Tôn", "Đạo Tổ", "Vô Cực", "Thái Cực",
    // 51-60: Hỗn Độn
    "Hỗn Độn Sơ", "Hỗn Độn Trung", "Hỗn Độn Hậu", "Hỗn Độn Viên Mãn", "Hồng Mông",
    "Hư Vô", "Vĩnh Hằng", "Bất Diệt", "Chúa Tể", "Sáng Thế",
    // 61-70: Hư Không
    "Phá Toái", "Lăng Hư", "Quy Khư", "Tịch Diệt", "Niết Bàn",
    "Bỉ Ngạn", "Khổ Hải", "Chân Ngã", "Duy Nhất", "Siêu Thoát",
    // 71-80: Khởi Nguyên
    "Thái Dịch", "Thái Sơ", "Thái Thủy", "Thái Tố", "Thái Cổ",
    "Nguyên Điểm", "Nhân Quả", "Mệnh Số", "Chân Lý", "Bản Nguyên",
    // 81-90: Chí Cao
    "Toàn Tri", "Toàn Năng", "Vô Thượng", "Bất Hủ", "Khái Niệm",
    "Chưởng Khống", "Phán Xét", "Quan Sát", "Hóa Vô", "Tác Giả",
    // 91-100: Vượt Ngưỡng
    "Siêu Việt", "Vô Hạn", "Đa Chiều", "Hư Ảo", "Thực Tại",
    "Lập Trình", "Dữ Liệu", "Mã Nguồn", "Admin", "The One"
];

/**
 * Tính Base XP cho một Đại Cảnh Giới.
 * Sử dụng vòng lặp để tránh tràn stack đệ quy với số lượng lớn.
 */
const getRealmBaseXP = (realmIndex) => {
    let currentBase = INITIAL_BASE_XP;
    // Hệ số tăng trưởng trung bình giữa các Realm = Multiplier / Divisor
    // Để tối ưu hiệu năng, ta không loop từng bước mà dùng công thức mũ gần đúng cho các realm xa,
    // nhưng để chính xác tuyệt đối theo logic game (làm tròn số), ta nên loop.
    
    for (let i = 0; i < realmIndex; i++) {
        // XP đỉnh cao của Realm trước (Tầng 10)
        // Công thức: Base * (10 ^ 1.2) * 3
        const prevPeakXP = Math.floor(currentBase * Math.pow(10, SUB_LEVEL_EXPONENT) * BREAKTHROUGH_MULTIPLIER);
        
        // Base mới = Peak cũ / 2
        currentBase = Math.floor(prevPeakXP / NEXT_REALM_DIVISOR);
    }
    
    return currentBase;
};

/**
 * Tính XP yêu cầu cho 1 level cụ thể
 */
const getRequiredXP = (level) => {
    if (level <= 0) return 10; // Level 0 không cần XP
    const realmIndex = Math.floor((level - 1) / 10);
    const subLevel = (level - 1) % 10 + 1; // 1 -> 10
    
    const realmBaseXP = getRealmBaseXP(realmIndex);
    
    let reqXP;
    if (subLevel < 10) {
        // Tầng 1-9: Tăng nhẹ (Lũy thừa 1.2)
        reqXP = Math.floor(realmBaseXP * Math.pow(subLevel, SUB_LEVEL_EXPONENT));
    } else {
        // Tầng 10: Đột phá (Nhân 3)
        reqXP = Math.floor(realmBaseXP * Math.pow(10, SUB_LEVEL_EXPONENT) * BREAKTHROUGH_MULTIPLIER);
    }
    
    return reqXP;
};

/**
 * Lấy thông tin hiển thị
 */
const getLevelInfo = (level, currentXP = 0) => {
    const realmIndex = Math.floor((level - 1) / 10);
    const subLevel = (level - 1) % 10 + 1;
    
    let realmName = realmIndex < MAJOR_REALMS.length 
        ? MAJOR_REALMS[realmIndex] 
        : `Vô Cực Cảnh Giới ${(realmIndex - MAJOR_REALMS.length + 1)}`;

    let subRealmName = `Tầng ${subLevel}`;
    if (subLevel === 1) subRealmName = "Sơ Kỳ";
    if (subLevel >= 4 && subLevel <= 6) subRealmName = `Trung Kỳ (${subLevel})`;
    if (subLevel >= 7 && subLevel <= 9) subRealmName = `Hậu Kỳ (${subLevel})`;
    if (subLevel === 10) subRealmName = "Viên Mãn";

    let reqXP = getRequiredXP(level);

    if (level == 0) {
        realmName = "Phàm Nhân";
        subRealmName = "";
    }
    
    // Định dạng số lớn (Ví dụ: 1.5B, 10T) nếu cần, hoặc để nguyên số
    // Ở đây trả về số nguyên gốc để logic game xử lý
    
    return {
        level: level,
        realmIndex: realmIndex,
        realmName: realmName,
        subRealmName: subRealmName,
        fullName: `${realmName} ${subRealmName}`,
        currentXP: currentXP,
        requiredXP: reqXP,
        progress: reqXP > 0 ? Math.floor((currentXP / reqXP) * 100) : 100
    };
};

/**
 * Tính toán Level Up
 */
const calculateLevelUp = (currentLevel, currentXP, gainedXP) => {
    let level = currentLevel;
    let xp = currentXP + gainedXP;
    let required = getRequiredXP(level);
    let levelUpCount = 0;

    // Chặn vòng lặp vô tận nếu XP quá lớn hoặc max level
    const MAX_LEVEL = 1000; 

    while (xp >= required && level < MAX_LEVEL) {
        xp -= required;
        level++;
        levelUpCount++;
        required = getRequiredXP(level);
    }

    return {
        newLevel: level,
        newXP: xp,
        levelUpCount: levelUpCount,
        hasLeveledUp: levelUpCount > 0
    };
};

module.exports = {
    getRequiredXP,
    getLevelInfo,
    calculateLevelUp,
    MAJOR_REALMS
};
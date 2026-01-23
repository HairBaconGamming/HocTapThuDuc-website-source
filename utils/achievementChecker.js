const User = require('../models/User');
const UserAchievement = require('../models/Achievement').UserAchievement;
const Achievement = require('../models/Achievement').Achievement;
const LessonCompletion = require('../models/LessonCompletion');
const Garden = require('../models/Garden');

const achievementChecker = {
    /**
     * Hàm kiểm tra và mở khóa thành tích
     * @param {String} userId - ID người dùng
     * @param {String} type - Loại kiểm tra ('lesson_count', 'streak', 'garden', 'custom')
     * @param {Object} data - Dữ liệu bổ sung (vd: count, triggerType)
     */
    checkAndUnlockAchievements: async (userId, type, data = {}) => {
        try {
            // 1. Lấy tất cả thành tích thuộc loại hình này mà user CHƯA đạt được
            // Trước tiên lấy danh sách ID đã đạt
            const userUnlocked = await UserAchievement.find({ user: userId }).distinct('achievementId');
            
            // Tìm các thành tích chưa đạt thuộc loại này
            // Lưu ý: type 'custom' dùng cho các logic đặc biệt (login, special event)
            const query = { 
                _id: { $nin: userUnlocked },
                type: type 
            };

            // Nếu là custom trigger (vd: login), cần khớp thêm condition.trigger
            if (type === 'custom' && data.triggerType) {
                query['condition.trigger'] = data.triggerType;
            }

            const availableAchievements = await Achievement.find(query);

            if (availableAchievements.length === 0) return { unlocked: false };

            const newUnlocks = [];

            // 2. Kiểm tra điều kiện từng thành tích
            for (const ach of availableAchievements) {
                let isUnlocked = false;
                const cond = ach.condition;

                switch (type) {
                    case 'lesson_count':
                        // data.count là số bài đã học
                        if (cond.value && data.count >= cond.value) isUnlocked = true;
                        break;

                    case 'streak':
                        // data.streak là chuỗi ngày
                        if (cond.value && data.streak >= cond.value) isUnlocked = true;
                        break;
                    
                    case 'garden':
                        // data.level hoặc data.action
                        // Ví dụ: Trồng cây đầu tiên
                        if (cond.code === 'GARDEN_FIRST_PLANT' && data.action === 'plant') isUnlocked = true;
                        break;

                    case 'custom':
                        // Logic riêng
                        if (cond.trigger === 'login') isUnlocked = true; // Login lần đầu mỗi ngày check
                        break;
                        
                    default:
                        break;
                }

                if (isUnlocked) {
                    newUnlocks.push({
                        user: userId,
                        achievementId: ach._id,
                        unlockedAt: new Date()
                    });
                }
            }

            // 3. Lưu vào DB và Trả về kết quả
            if (newUnlocks.length > 0) {
                // Insert các bản ghi mới
                const insertedDocs = await UserAchievement.insertMany(newUnlocks);
                
                // [QUAN TRỌNG] Populate ngược lại để lấy thông tin Name/Icon/Points
                // insertMany trả về documents, nhưng để chắc chắn có full info từ bảng Achievement, ta populate
                // Mongoose insertMany không hỗ trợ populate trực tiếp, phải query lại hoặc populate trên doc trả về (tùy version).
                // Cách an toàn nhất là query lại theo ID vừa tạo.
                
                const insertedIds = insertedDocs.map(doc => doc._id);
                
                const populatedAchievements = await UserAchievement.find({ _id: { $in: insertedIds } })
                    .populate('achievementId'); // <--- FIX LỖI THIẾU TÊN/ICON TẠI ĐÂY

                // Cộng điểm cho User luôn
                let totalPointsToAdd = 0;
                populatedAchievements.forEach(ua => {
                    if (ua.achievementId && ua.achievementId.points) {
                        totalPointsToAdd += ua.achievementId.points;
                    }
                });

                if (totalPointsToAdd > 0) {
                    await User.findByIdAndUpdate(userId, { $inc: { points: totalPointsToAdd } });
                }

                console.log(`✅ User ${userId} unlocked ${newUnlocks.length} achievements! (+${totalPointsToAdd} pts)`);

                return { 
                    unlocked: true, 
                    newAchievements: populatedAchievements // Trả về array đầy đủ thông tin
                };
            }

            return { unlocked: false };

        } catch (error) {
            console.error("Achievement Check Error:", error);
            return { unlocked: false, error: error.message };
        }
    },

    // Shortcut helper: Check khi hoàn thành bài học
    onLessonCompleted: async (userId) => {
        try {
            const count = await LessonCompletion.countDocuments({ user: userId });
            return await achievementChecker.checkAndUnlockAchievements(userId, 'lesson_count', { count });
        } catch (e) {
            console.error(e);
        }
    }
};

module.exports = { achievementChecker };
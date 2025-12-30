const Flashcard = require('../models/Flashcard');
const Garden = require('../models/Garden');
const Lesson = require('../models/Lesson');

// 1. Lấy danh sách thẻ cần ôn tập hôm nay (Daily Review)
exports.getReviewSession = async (req, res) => {
    try {
        const today = new Date();
        const limitPerSession = 30; // CHỈA KHÓA: Giới hạn số lượng để không bị ngộp

        // Lấy thẻ từ TẤT CẢ các môn học
        const cards = await Flashcard.find({
            user: req.user._id,
            nextReviewDate: { $lte: today } // Chỉ lấy thẻ đã ĐẾN HẠN
        })
        .sort({ nextReviewDate: 1 }) // Ưu tiên thẻ bị trễ hạn lâu nhất
        .limit(limitPerSession)      // Cắt bớt, chỉ đưa 30 thẻ
        .populate({
            path: 'lesson',
            select: 'title subject', // Lấy tên bài và môn
            populate: { path: 'subject', select: 'name' } // Lấy tên môn học
        });

        // Trộn ngẫu nhiên danh sách này để học đỡ chán (Toán -> Văn -> Anh -> Toán)
        const shuffledCards = cards.sort(() => Math.random() - 0.5);

        res.json({ 
            success: true, 
            cards: shuffledCards,
            remaining: Math.max(0, cards.length - limitPerSession) // Báo cho user biết còn bao nhiêu thẻ tồn đọng
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

// 2. Xử lý kết quả ôn tập (Thuật toán SRS Simplified)
exports.processReview = async (req, res) => {
    try {
        const { cardId, quality } = req.body;
        // quality: 0 (Quên), 1 (Khó), 2 (Vừa), 3 (Dễ), 4 (Rất dễ) - Scale 0-5
        // Ở đây mình dùng scale đơn giản: 0 (Quên), 3 (Nhớ/Dễ) cho dễ code
        
        const card = await Flashcard.findById(cardId);
        if (!card) return res.status(404).json({ error: "Thẻ không tồn tại" });

        // --- THUẬT TOÁN SM-2 (SuperMemo-2) ---
        let q = parseInt(quality); // 0 -> 5
        
        if (q >= 3) {
            // Nếu nhớ đúng
            if (card.repetition === 0) {
                card.interval = 1;
            } else if (card.repetition === 1) {
                card.interval = 6;
            } else {
                card.interval = Math.round(card.interval * card.efactor);
            }
            card.repetition += 1;
        } else {
            // Nếu quên hoặc thấy quá khó
            card.repetition = 0;
            card.interval = 1; // Ôn lại vào ngày mai
        }

        // Cập nhật E-Factor (Độ khó của thẻ)
        card.efactor = card.efactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
        if (card.efactor < 1.3) card.efactor = 1.3;

        // Tính ngày review tiếp theo
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + card.interval);
        card.nextReviewDate = nextDate;

        await card.save();

        // --- PHẦN THƯỞNG: PHÂN BÓN ---
        // Cơ chế: Cứ ôn đúng (quality >= 3) là có tỉ lệ rớt Phân Bón
        let bonusFertilizer = 0;
        if (q >= 3) {
            // Tỷ lệ 30% nhận phân bón mỗi thẻ đúng (để tránh lạm phát)
            if (Math.random() < 0.3) {
                bonusFertilizer = 1;
                await Garden.findOneAndUpdate(
                    { user: req.user._id },
                    { $inc: { fertilizer: 1 } }
                );
            }
        }

        res.json({ success: true, nextDate, bonusFertilizer });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

// 3. Tạo thẻ mới (Admin/GV tạo hoặc User tự tạo)
exports.createCard = async (req, res) => {
    try {
        const { lessonId, front, back } = req.body;
        await Flashcard.create({
            user: req.user._id,
            lesson: lessonId,
            front, back
        });
        res.json({ success: true, message: "Đã tạo thẻ!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
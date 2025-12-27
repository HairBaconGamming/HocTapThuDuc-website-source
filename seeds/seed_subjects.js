// seed_subjects.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const slugify = require('slugify'); // Cần cài: npm install slugify

// Load biến môi trường
dotenv.config();

// Import Models
const Subject = require('../models/Subject');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');

// Dữ liệu Môn học (Kèm ảnh bìa đại diện đẹp)
const subjectList = [
    { 
        name: "Toán học", 
        image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80",
        description: "Đại số, Hình học và Giải tích."
    },
    { 
        name: "Giáo dục quốc phòng", 
        image: "https://cdnphoto.dantri.com.vn/sikiCqDTHAP1S-IkgYR1Q1A_Dfg=/thumb_w/960/2020/03/22/quan-doi-1584849224456.jpg", 
        description: "Kiến thức quốc phòng và an ninh."
    },
    { 
        name: "Văn học", 
        image: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80", 
        description: "Khám phá vẻ đẹp ngôn ngữ và văn chương."
    },
    { 
        name: "Anh ngữ", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRTBP3ZSWQMAVQNLLChGHuW2wj4we-VqdjVDA&s", 
        description: "English for High School."
    },
    { 
        name: "Vật lí", 
        image: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&w=800&q=80", 
        description: "Cơ học, Điện từ và Quang học."
    },
    { 
        name: "Hóa học", 
        image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80", 
        description: "Phản ứng hóa học và bảng tuần hoàn."
    },
    { 
        name: "Sinh học", 
        image: "https://images.unsplash.com/photo-1530210124550-912dc1381cb8?auto=format&fit=crop&w=800&q=80", 
        description: "Di truyền, Tế bào và Hệ sinh thái."
    },
    { 
        name: "Tin học", 
        image: "https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&w=800&q=80", 
        description: "Lập trình và Khoa học máy tính."
    },
    { 
        name: "Tiếng Trung", 
        image: "https://vj-prod-website-cms.s3.ap-southeast-1.amazonaws.com/g1-1716175937240.jpg", 
        description: "Học tiếng Trung cơ bản và nâng cao."
    },
    { 
        name: "Lịch sử", 
        image: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=800&q=80", 
        description: "Dòng chảy lịch sử Việt Nam và Thế giới."
    },
    { 
        name: "STEM", 
        image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=800&q=80", 
        description: "Khoa học, Công nghệ, Kỹ thuật và Toán học."
    },
    { 
        name: "Giáo dục địa phương", 
        image: "https://image.plo.vn/Uploaded/2025/awvbpciv/2025_04_13/tphcm-50-nam-vuon-minh-but-pha-9771-9873.jpg", 
        description: "Văn hóa và Lịch sử địa phương."
    }
];

const seedDB = async () => {
    try {
        // 1. Kết nối DB
        await mongoose.connect(process.env.MONGO_URI); // Đảm bảo biến này đúng trong .env
        console.log("🔌 Connected to MongoDB...");

        // 2. Xóa dữ liệu cũ (RESET)
        console.log("🧹 Cleaning old data...");
        await Lesson.deleteMany({});
        await Unit.deleteMany({});
        await Subject.deleteMany({});
        console.log("✅ Cleared: Lessons, Units, Subjects");

        // 3. Tạo Môn học mới
        console.log("🌱 Seeding Subjects...");
        
        // Map dữ liệu để thêm slug thủ công (nếu chưa có plugin)
        const subjectsToInsert = subjectList.map(s => ({
            ...s,
            slug: slugify(s.name, { lower: true, locale: 'vi' })
        }));

        const createdSubjects = await Subject.insertMany(subjectsToInsert);
        console.log(`✅ Created ${createdSubjects.length} subjects.`);

        console.log("🎉 SEEDING COMPLETED SUCCESSFULLY!");
        process.exit();

    } catch (err) {
        console.error("❌ Seeding Error:", err);
        process.exit(1);
    }
};

// Chạy hàm seed
seedDB();
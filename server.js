// server.js - OPTIMIZED & SECURED v2.0
require('dotenv').config();

const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const passport = require("passport");
const session = require("express-session");
const flash = require("express-flash");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const cors = require('cors');
const compression = require('compression');
const helmet = require("helmet"); // [NEW] Security Headers
const socketio = require("socket.io");
const moment = require("moment-timezone");

// Models & Utils
const News = require("./models/News");
const VisitStats = require("./models/VisitStats");
const { banCheck } = require("./middlewares/banCheck");
require("./config/passport")(passport);

const trackVisits = require('./middlewares/trackVisits');
const searchRouter = require('./routes/search');         

// App Setup
const app = express();
const server = http.createServer(app);
const io = socketio(server);
app.locals.io = io;

// DB Connection
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/studypro';
mongoose.connect(uri.replace(/^"(.*)"$/, '$1'))
  .then(() => console.log('✅ MongoDB connected.'))
  .catch(err => { console.error(err); process.exit(1); });

// Helpers
const marked = require("marked");
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const purify = DOMPurify(new JSDOM('').window);
app.locals.marked = (text) => purify.sanitize(marked.parse(text || ""));
app.locals.markedInline = (text) => purify.sanitize(marked.parseInline(text || ""));

/* ======================================================
   MIDDLEWARE CONFIGURATION
   ====================================================== */

app.use(compression());

// [SECURITY] Helmet - Cấu hình "nới lỏng" để tránh vỡ giao diện dev
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.set("view engine", "ejs");
app.set("trust proxy", 1);

const corsOptions = {
    origin: (origin, cb) => {
        // [DEV MODE]
        if (process.env.NODE_ENV !== 'production') {
            return cb(null, true); 
        }

        const allowed = ['https://hoctapthuduc.onrender.com'];
        
        // CẬP NHẬT LOGIC TẠI ĐÂY:
        // 1. !origin: Cho phép request không có origin (Postman, Server-to-Server)
        // 2. origin === 'null': Cho phép origin là chuỗi "null" (thường gặp khi redirect, local file, hoặc sandbox iframe)
        // 3. allowed.includes(origin): Domain nằm trong whitelist
        if (!origin || origin === 'null' || allowed.includes(origin)) {
            return cb(null, true);
        }
        
        console.log(`🚫 Blocked CORS Origin: ${origin}`);
        cb(new Error('CORS blocked this request'));
    },
    credentials: true
};
app.use(cors(corsOptions));
app.use(cookieParser());

// [OPTIMIZE] Dùng Express Native thay vì body-parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));
app.use(rateLimit({ windowMs: 1*60000, max: 1000 })); // 1000 req/min

app.use(session({
    secret: process.env.SESSION_SECRET || "s3cret",
    resave: false, saveUninitialized: false,
    cookie: { secure: 'auto', httpOnly: true, maxAge: 30*24*3600000 }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

/* ======================================================
   GLOBAL VARIABLES & LOGIC (CRITICAL ORDER)
   ====================================================== */

// [FIX] Đưa Globals lên TRƯỚC banCheck để tránh lỗi 'activePage is not defined'
app.use(async (req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.activePage = ''; // Default value an toàn
    
    const err = req.flash("error"), succ = req.flash("success");
    res.locals.message = err.length ? { type: "error", message: err[0] } : 
                         succ.length ? { type: "success", message: succ[0] } : { type: null, message: "" };
    
    if (req.user) {
        try { res.locals.latestNews = await News.find({}).sort({ createdAt: -1 }).limit(3).lean(); } 
        catch { res.locals.latestNews = []; }
    } else { res.locals.latestNews = []; }
    next();
});

// Kiểm tra Ban user (sau khi đã có res.locals đầy đủ)
app.use(banCheck);

// [OPTIMIZE] Visit Stats - Non-blocking (Fire-and-forget)
app.use((req, res, next) => { // Bỏ async để không chặn request chính
    if(req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/static')) {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        // Chạy ngầm trong background
        Promise.all([
            VisitStats.findOneAndUpdate({ key: "totalVisits" }, { $inc: { count: 1 } }, { upsert: true }).exec(),
            VisitStats.findOneAndUpdate({ key: `dailyVisits_${today}` }, { $inc: { count: 1 } }, { upsert: true }).exec()
        ]).catch(err => console.error("Stats Error:", err.message));
    }
    next();
});

app.use(trackVisits);

/* ======================================================
   ROUTES
   ====================================================== */
app.use("/", require("./routes/index"));
app.use("/", require("./routes/auth"));
app.use("/my-garden", require('./routes/garden'));

app.use("/lesson", require("./routes/lesson"));
app.use("/api", require("./routes/api"));
app.use("/api", require("./routes/course"));
app.use("/news", require("./routes/news"));
app.use("/admin", require("./routes/admin"));
app.use("/documents", require("./routes/documents"));
app.use("/live", require("./routes/live"));
app.use('/search', searchRouter);        
app.use("/api/pro-images", require("./routes/proImages"));
app.use("/api/quiz-generator", require("./routes/quizGenerator"));
app.use('/api/flashcards', require('./routes/flashcard'));

// 404 Handler
app.use((req, res) => res.status(404).render("404", { 
    title: "404", 
    user: req.user || null,
    activePage: '404' // <--- Thêm dòng này (Safety net)
}));

// Error Handler
app.use((err, req, res, next) => {
    console.error("🔥 Server Error:", err); // Log rõ hơn tí cho dễ debug
    
    // Nếu header đã gửi rồi thì thôi, để Express tự xử lý
    if (res.headersSent) {
        return next(err);
    }

    res.status(500).render("error", { 
        title: "Lỗi Server", 
        message: "Đã có lỗi xảy ra", 
        user: req.user || null, // Phòng trường hợp req.user chưa kịp có
        activePage: 'error',    // <--- QUAN TRỌNG: Cứu tinh của bạn đây
        error: process.env.NODE_ENV === 'development' ? err : {} // Chỉ hiện chi tiết lỗi khi dev
    });
});

/* ======================================================
   START SERVER
   ====================================================== */
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`🚀 Server on port ${port}`));

// [OPTIMIZE] Slug Fixer - Chạy sau 5s để server khởi động nhanh hơn
setTimeout(async () => {
    try {
        const Lesson = require('./models/Lesson');
        const count = await Lesson.countDocuments({ slug: { $exists: false } });
        if(count > 0) {
            console.log(`🧹 Cleaning up: Fixing slugs for ${count} lessons...`);
            const missing = await Lesson.find({ slug: { $exists: false } }).limit(50);
            for(const l of missing) { l.slug = undefined; await l.save(); }
        }
    } catch(e) { console.error("Slug Fixer Warn:", e.message); }
}, 5000);
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

// Models & Utils
const News = require("./models/News");
const { banCheck } = require("./middlewares/banCheck");
const { getSessionSecret } = require("./utils/secrets");
const { corsOptionsDelegate } = require("./utils/corsPolicy");
const { setIo } = require("./utils/realtime");
const { startGuildJobs } = require("./jobs/guildJobs");
require("./config/passport")(passport);

const trackVisits = require('./middlewares/trackVisits');
const searchRouter = require('./routes/search');         

// App Setup
const app = express();
const server = http.createServer(app);
const io = socketio(server);
app.locals.io = io;
setIo(io);

io.on("connection", (socket) => {
  socket.on("userConnect", (userId) => {
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });
});

// DB Connection with Enhanced Configuration
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/studypro';
const mongooseOptions = {
  serverSelectionTimeoutMS: 15000,     // Tăng lên 15s
  socketTimeoutMS: 25000,              // Socket timeout 25s
  maxPoolSize: 10,                     // Tối đa 10 connection
  minPoolSize: 2,                      // Tối thiểu 2 connection
  retryWrites: true,
  retryReads: true,
  connectTimeoutMS: 15000,
};

mongoose.connect(uri.replace(/^"(.*)"$/, '$1'), mongooseOptions)
  .then(() => console.log('✅ MongoDB connected.'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️  TROUBLESHOOTING:');
    console.log('   1. Check if IP is whitelisted in MongoDB Atlas');
    console.log('   2. Verify MONGO_URI in .env file');
    console.log('   3. Check if MongoDB cluster is running');
    console.log('   4. Try adding 0.0.0.0/0 temporarily for testing (not for production!)');
    // Don't exit on first error - allow graceful degradation
  });

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 MongoDB Error:', err.message);
});

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

app.use(cors(corsOptionsDelegate));
app.options('*', cors(corsOptionsDelegate));
app.use(cookieParser());

// [OPTIMIZE] Dùng Express Native thay vì body-parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));
app.use(rateLimit({ windowMs: 1*60000, max: 1000 })); // 1000 req/min

app.use(session({
    secret: getSessionSecret(),
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
    
    res.locals.pendingAchievements = req.session?.newAchievements || [];
    if (req.session?.newAchievements?.length) {
        delete req.session.newAchievements;
    }
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


app.use(trackVisits);

/* ======================================================
   ROUTES
   ====================================================== */
app.use("/", require("./routes/index"));
app.use("/", require("./routes/auth"));
app.use("/my-garden", require('./routes/garden'));
app.use("/guilds", require('./routes/guild'));

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
app.use('/api/achievements', require('./routes/achievements'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/annotations', require('./routes/annotations'));
app.use('/api/lesson-rewards', require('./routes/lessonRewards'));

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
startGuildJobs();

// [OPTIMIZE] Slug Fixer - Chạy sau 5s để server khởi động nhanh hơn
setTimeout(async () => {
    try {
        if(mongoose.connection.readyState !== 1) {
            console.warn("⏭️  Slug Fixer: Skipped (DB not ready)");
            return;
        }
        const Lesson = require('./models/Lesson');
        const count = await Lesson.countDocuments({ slug: { $exists: false } });
        if(count > 0) {
            console.log(`🧹 Cleaning up: Fixing slugs for ${count} lessons...`);
            const missing = await Lesson.find({ slug: { $exists: false } }).limit(50);
            for(const l of missing) { l.slug = undefined; await l.save(); }
        }
    } catch(e) { 
        console.warn("⚠️  Slug Fixer Warn:", e.message); 
    }
}, 5000);

if (process.env.NODE_ENV === 'production') {
    const https = require('https');
    
    setInterval(() => {
        https.get(`https://hoctapthuduc.onrender.com/api/ping`, (res) => {
            // console.log(`Self-ping status: ${res.statusCode}`);
        }).on('error', (e) => {
            console.error(`Self-ping error: ${e.message}`);
        });
    }, 14 * 60 * 1000); // 14 phút (trước khi Render ngủ ở phút 15)
}

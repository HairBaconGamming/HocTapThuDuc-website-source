// server.js - CLEAN ENTRY POINT
require('dotenv').config();

const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const passport = require("passport");
const session = require("express-session");
const flash = require("express-flash");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const cors = require('cors');
const compression = require('compression');
const socketio = require("socket.io");
const moment = require("moment-timezone");

// Models & Utils
const News = require("./models/News");
const VisitStats = require("./models/VisitStats");
const { banCheck } = require("./middlewares/banCheck");
require("./config/passport")(passport);

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

// Middleware
app.use(compression());
app.set("view engine", "ejs");
app.set("trust proxy", 1);

const corsOptions = {
    origin: (origin, cb) => {
        const allowed = ['https://hoctapthuduc.onrender.com'];
        if(process.env.NODE_ENV !== 'production') allowed.push('http://localhost:3000', 'http://127.0.0.1:3000');
        if (!origin || allowed.includes(origin) || /localhost|127\.0\.0\.1/.test(origin)) return cb(null, true);
        cb(new Error('CORS'));
    },
    credentials: true
};
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(rateLimit({ windowMs: 15*60000, max: 100 }));

app.use(session({
    secret: process.env.SESSION_SECRET || "s3cret",
    resave: false, saveUninitialized: false,
    cookie: { secure: 'auto', httpOnly: true, maxAge: 30*24*3600000 }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(banCheck);

// Globals
app.use(async (req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.activePage = '';
    const err = req.flash("error"), succ = req.flash("success");
    res.locals.message = err.length ? { type: "error", message: err[0] } : 
                         succ.length ? { type: "success", message: succ[0] } : { type: null, message: "" };
    
    if (req.user) {
        try { res.locals.latestNews = await News.find({}).sort({ createdAt: -1 }).limit(3).lean(); } 
        catch { res.locals.latestNews = []; }
    } else { res.locals.latestNews = []; }
    next();
});

// Visit Stats Middleware
app.use(async (req, res, next) => {
    if(req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/static')) {
        const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
        try {
            await Promise.all([
                VisitStats.findOneAndUpdate({ key: "totalVisits" }, { $inc: { count: 1 } }, { upsert: true }),
                VisitStats.findOneAndUpdate({ key: `dailyVisits_${today}` }, { $inc: { count: 1 } }, { upsert: true })
            ]);
        } catch {}
    }
    next();
});

// --- Routes ---
app.use("/", require("./routes/index"));
app.use("/", require("./routes/auth"));
app.use("/lesson", require("./routes/lesson"));
app.use("/api", require("./routes/api"));
app.use("/api", require("./routes/course"));
app.use("/news", require("./routes/news"));
app.use("/admin", require("./routes/admin"));
app.use("/documents", require("./routes/documents"));
app.use("/live", require("./routes/live"));
app.use("/api/pro-images", require("./routes/proImages"));
app.use("/api/quiz-generator", require("./routes/quizGenerator"));

// 404
app.use((req, res) => res.status(404).render("404", { title: "404", user: req.user }));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render("error", { title: "Error", message: "Server Error", user: req.user, error: {} });
});

// Start
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`🚀 Server on port ${port}`));

// Slug Fixer
(async () => {
    try {
        const Lesson = require('./models/Lesson');
        const missing = await Lesson.find({ slug: { $exists: false } }).limit(50);
        for(const l of missing) { l.slug = undefined; await l.save(); }
    } catch(e) {}
})();
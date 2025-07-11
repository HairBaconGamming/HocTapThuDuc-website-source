// server.js
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const bodyParser = require("body-parser");
const flash = require("express-flash");
const path = require("path");
const stringSimilarity = require("string-similarity");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fetch = require("node-fetch");
global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;

const http = require("http");
const server = http.createServer(app);
const socketio = require("socket.io");
const io = socketio(server);

app.locals.io = io;

const multer = require("multer");
const upload = multer();

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);
const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-thinking-exp-01-21",
});

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 65536,
  responseMimeType: "text/plain",
};

// Import models
const User = require("./models/User");
const Subject = require("./models/Subject");
const Lesson = require("./models/Lesson");
const Achievement = require("./models/Achievement");
const LessonCompletion = require("./models/LessonCompletion");

const completeLessonLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 3,
  message: "Quá nhiều yêu cầu, hãy thử lại sau 1 phút.",
});

const { checkAndAwardAchievements } = require("./utils/achievementUtils");
const {
  updateGrowth,
  getPointsForNextLevel,
  getPointsForCurrentLevel,
} = require("./utils/growthUtils"); // Ensure path is correct

const marked = require("marked");
if (!Array.prototype.at) {
  Array.prototype.at = function (n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  };
}

const uri = process.env.MONGO_URI;
// MỚI (ĐÃ SỬA): Kết nối Mongoose theo cách hiện đại, không cần options cũ
mongoose.connect(uri)
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100, // mỗi IP tối đa 100 request
  message: "Quá nhiều request từ IP của bạn, vui lòng thử lại sau 15 phút.",
});

// Configure view engine
app.set("view engine", "ejs");
app.set("trust proxy", 1);

// Middleware
const allowedOrigins = ['https://hoctapthuduc.onrender.com']; // Thêm URL frontend React của bạn vào đây

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));
const cookieParser = require("cookie-parser");
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(limiter);
app.use(
  session({
    secret: "lop9a3maidinh",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: 'auto',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Configure Passport
// MỚI (ĐÃ SỬA): Chuyển đổi LocalStrategy sang async/await
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username });
      if (!user) {
        return done(null, false, { message: "Tên người dùng không tồn tại." });
      }
      
      const isMatch = await new Promise((resolve, reject) => {
          user.comparePassword(password, (err, match) => {
              if (err) return reject(err);
              resolve(match);
          });
      });

      if (!isMatch) {
        return done(null, false, { message: "Mật khẩu không chính xác." });
      }

      return done(null, user);

    } catch (err) {
      return done(err);
    }
  })
);


passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

const { banCheck } = require("./middlewares/banCheck");
app.use(banCheck);

// Mount the PRO images API routes
const proImagesRouter = require("./routes/proImages");
app.use("/api/pro-images", proImagesRouter);

const quizGeneratorRouter = require("./routes/quizGenerator");
app.use("/api/quiz-generator", quizGeneratorRouter);

const newsRouter = require("./routes/news");
app.use("/news", newsRouter);
const News = require("./models/News");
app.use(async (req, res, next) => {
  const errorMessages = req.flash("error");
  const successMessages = req.flash("success");

  if (errorMessages.length > 0) {
    res.locals.message = { type: "error", message: errorMessages[0] };
  } else if (successMessages.length > 0) {
    res.locals.message = { type: "success", message: successMessages[0] };
  } else {
    res.locals.message = { type: null, message: "" };
  }
  if (req.user) {
    try {
      const latestNews = await News.find({}).sort({ createdAt: -1 }).limit(3);
      res.locals.latestNews = latestNews;
    } catch (err) {
      console.error(err);
      res.locals.latestNews = [];
    }
  } else {
    res.locals.latestNews = [];
  }
  next();
});

const { autoPostAICourses } = require("./scheduler");

const VisitStats = require("./models/VisitStats");
const moment = require("moment-timezone");

const liveRouter = require("./routes/live");
app.use("/live", liveRouter);

// Thêm dòng này để sử dụng admin panel
const adminRouter = require("./routes/admin");
app.use("/admin", adminRouter);

// Middleware cập nhật lượt truy cập
async function updateVisitStats(req, res, next) {
  try {
    const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
    await VisitStats.findOneAndUpdate(
      { key: "totalVisits" },
      { $inc: { count: 1 } },
      { upsert: true }
    );
    await VisitStats.findOneAndUpdate(
      { key: `dailyVisits_${today}` },
      { $inc: { count: 1 } },
      { upsert: true }
    );
    next();
  } catch (error) {
    console.error("Error updating visit stats:", error);
    next();
  }
}

// functions (Your helper functions remain unchanged, no Mongoose calls in them)
function expandText(text) {
  if (typeof text !== "string") return [];
  const normalizedText = text.trim();
  const rawWords = normalizedText.split(/\s+/);
  let tokens = [];
  for (const word of rawWords) {
    const parts = word.match(/(\p{L}+|\p{N}+|[^\p{L}\p{N}\s]+)/gu);
    if (parts) {
      tokens.push(...parts);
    } else {
      tokens.push(word);
    }
  }
  return tokens;
}
function isPunctuation(str) {
  return /^[\.,!?;:“”()\[\]{}]+$/.test(str);
}
function buildLCSMatrix(sampleTokens, studentTokens) {
  const sLen = sampleTokens.length;
  const tLen = studentTokens.length;
  const dp = Array.from({ length: sLen + 1 }, () => Array(tLen + 1).fill(0));
  for (let i = 1; i <= sLen; i++) {
    for (let j = 1; j <= tLen; j++) {
      if (sampleTokens[i - 1].toLowerCase() === studentTokens[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}
function reconstructDiff(sampleTokens, studentTokens, dp) {
  let i = sampleTokens.length;
  let j = studentTokens.length;
  const tokens = [];
  while (i > 0 && j > 0) {
    if (sampleTokens[i - 1].toLowerCase() === studentTokens[j - 1].toLowerCase()) {
      tokens.push(studentTokens[j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      tokens.push(`<span class="diff-error">${sampleTokens[i - 1]}</span>`);
      i--;
    } else {
      tokens.push(
        `<span class="diff-error strikethrough">${studentTokens[j - 1]}</span>`
      );
      j--;
    }
  }
  while (i > 0) {
    tokens.push(`<span class="diff-error">${sampleTokens[i - 1]}</span>`);
    i--;
  }
  while (j > 0) {
    tokens.push(
      `<span class="diff-error strikethrough">${studentTokens[j - 1]}</span>`
    );
    j--;
  }
  tokens.reverse();
  let diffStr = "";
  for (let token of tokens) {
    let markerPunctuation = "";
    let missingMatch = token.match(/^\<span class="diff-error"\>(.+)\<\/span\>$/);
    let extraMatch = token.match(/^\<span class="diff-error strikethrough"\>(.+)\<\/span\>$/);
    if (missingMatch && isPunctuation(missingMatch[1])) {
      markerPunctuation = missingMatch[1];
    } else if (extraMatch && isPunctuation(extraMatch[1])) {
      markerPunctuation = extraMatch[1];
    }
    if (markerPunctuation) {
      diffStr = diffStr.replace(/\s+$/, "");
      diffStr += token;
    } else {
      if (diffStr.length > 0) diffStr += " ";
      diffStr += token;
    }
  }
  return diffStr;
}
function getWordDiff(sample, student) {
  const sampleTokens = expandText(sample);
  const studentTokens = expandText(student);
  const dp = buildLCSMatrix(sampleTokens, studentTokens);
  return reconstructDiff(sampleTokens, studentTokens, dp);
}
async function getEmbedding(text) {
  if (typeof text !== "string") {
    throw new Error("Input text must be a string");
  }
  const trimmedText = text.trim();
  if (trimmedText.length < 5) {
    throw new Error(`Input text is too short: "${trimmedText}"`);
  }
  const response = await fetch("https://api-inference.huggingface.co/models/questgen/all-mpnet-base-v2-feature-extraction-pipeline", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: trimmedText }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error ${response.status}: ${errorText}`);
  }
  let data;
  try {
    data = await response.json();
  } catch (e) {
    const respText = await response.text();
    throw new Error(`Invalid JSON response: ${respText}`);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  if (!data || !Array.isArray(data) || !data[0] || data[0].length < 10) {
    throw new Error("Embedding API returned an invalid embedding.");
  }
  return data[0];
}
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  return dotProduct / (normA * normB);
}
function gradeEssaySimple(modelAnswer, studentAnswer) {
  const similarity = stringSimilarity.compareTwoStrings(modelAnswer, studentAnswer);
  return Math.round(similarity * 100);
}
async function gradeEssaySmart(modelAnswer, studentAnswer) {
  try {
    const [sampleEmbedding, studentEmbedding] = await Promise.all([
      getEmbedding(modelAnswer),
      getEmbedding(studentAnswer),
    ]);
    if (!sampleEmbedding || !studentEmbedding) {
      return gradeEssaySimple(modelAnswer, studentAnswer);
    }
    const similarity = cosineSimilarity(sampleEmbedding, studentEmbedding);
    if (!similarity || isNaN(similarity)) {
      return gradeEssaySimple(modelAnswer, studentAnswer);
    }
    return Math.round(similarity * 100);
  } catch (err) {
    console.error("gradeEssaySmart error, falling back to simple grading:", err.message);
    return gradeEssaySimple(modelAnswer, studentAnswer);
  }
}
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
async function gradeEssayAIAll(essayData, answers) {
  let prompt = `Đánh giá các câu trả lời bài luận sau và so sánh với các câu trả lời lý tưởng (hoặc dàn ý) của từng câu. 
Hãy đưa ra điểm số từ 0 đến 100 và một nhận xét ngắn gọn cho mỗi câu, định dạng chính xác như sau (mỗi câu cách nhau bằng dòng trống):

Question 1:
Ideal answer: "<ideal1>"
Student answer: "<student1>"
Score: <score>
Comment: <comment>

Question 2:
Ideal answer: "<ideal2>"
Student answer: "<student2>"
Score: <score>
Comment: <comment>
...
`;
  for (let i = 0; i < essayData.length; i++) {
    const sampleAnswer = essayData[i].sampleAnswer || "";
    const studentAnswer = answers[i] || "";
    prompt += `Question ${i + 1}:\n`;
    prompt += `Ideal answer: "${sampleAnswer}"\n`;
    prompt += `Student answer: "${studentAnswer}"\n`;
    prompt += `Score: <score>\n`;
    prompt += `Comment: <comment>\n\n`;
  }
  try {
    const chatSession = geminiModel.startChat({
      generationConfig,
      history: [],
    });
    const result = await chatSession.sendMessage(prompt);
    const responseText = result.response.text();
    const scores = [];
    const comments = [];
    const questionBlocks = responseText.split(/\n\s*\n/);
    questionBlocks.forEach((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      let score = 0;
      let comment = "";
      lines.forEach((line) => {
        const scoreMatch = line.match(/^Score:\s*(\d{1,3})/i);
        if (scoreMatch) {
          score = parseInt(scoreMatch[1], 10);
        }
        const commentMatch = line.match(/^Comment:\s*(.+)/i);
        if (commentMatch) {
          comment = commentMatch[1].trim();
        }
      });
      scores.push(score);
      comments.push(comment);
    });
    return { scores, comments };
  } catch (err) {
    console.error("gradeEssayAIAll error:", err);
    return {
      scores: essayData.map(() => 0),
      comments: essayData.map(() => "Không thể chấm bài do lỗi hệ thống AI."),
    };
  }
}

// Routes

app.get("/", updateVisitStats, async (req, res) => {
  try {
    const [totalUsers, totalVisitsDoc, dailyVisitsDoc, latestLessons, latestNews] = await Promise.all([
        User.countDocuments(),
        VisitStats.findOne({ key: "totalVisits" }),
        VisitStats.findOne({ key: `dailyVisits_${moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD")}` }),
        Lesson.find().sort({ createdAt: -1 }).limit(5).lean(),
        News.find().sort({ createdAt: -1 }).limit(5).lean()
    ]);
    
    const totalVisits = totalVisitsDoc ? totalVisitsDoc.count : 0;
    const dailyVisits = dailyVisitsDoc ? dailyVisitsDoc.count : 0;

    res.render("index", {
      user: req.user,
      latestLessons,
      latestNews,
      totalUsers,
      totalVisits,
      dailyVisits,
    });
  } catch (error) {
    console.error("Error loading homepage:", error);
    res.render("index", {
      user: req.user,
      latestLessons: [],
      latestNews: [],
      totalUsers: 0,
      totalVisits: 0,
      dailyVisits: 0,
    });
  }
});

app.get("/register", (req, res) => {
  res.render("register", {
    user: req.user || null,
    activePage: "register",
  });
});

app.post("/register", async (req, res) => {
  const { username, password, class: userClass, school } = req.body;
  const usernameRegex = /^(?=.{8,})[A-Za-z0-9]+$/;
  if (!usernameRegex.test(username)) {
    req.flash("error", "Tên người dùng phải có ít nhất 8 ký tự, chỉ bao gồm chữ và số, không có khoảng trắng.");
    return res.redirect("/register");
  }
  const validSchools = ["Trường THCS Lương Định Của", "Trường THCS Bình Thọ", "Trường THCS Hiệp Phú", "Trường THCS Trường Thọ", "Trường THCS An Phú", "Trường THCS Linh Trung", "Trường THCS Nguyễn Văn Bá", "Trường THCS Bình An", "Trường THCS Nguyễn Thị Định", "Trường TH, THCS, THPT Ngô Thời Nhiệm", "Trường THCS, THPT Nguyễn Khuyến", "Trường Tiểu học - THCS - THPT Hoa Sen", "Trường THCS Hoa Lư", "Trường THCS Trần Quốc Toản", "Trường THCS Phước Bình", ];
  if (!validSchools.includes(school)) {
    req.flash("error", "Vui lòng chọn trường THCS hợp lệ tại TP Thủ Đức.");
    return res.redirect("/register");
  }
  const turnstileToken = req.body["cf-turnstile-response"];
  if (!turnstileToken) {
    req.flash("error", "Vui lòng xác thực CAPTCHA.");
    return res.redirect("/register");
  }
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  try {
    const verificationURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const params = new URLSearchParams();
    params.append("secret", turnstileSecret);
    params.append("response", turnstileToken);
    params.append("remoteip", req.ip || "");
    const cfResponse = await axios.post(verificationURL, params);
    const { success, "error-codes": errorCodes } = cfResponse.data;
    if (!success) {
      console.error("Turnstile verification failed:", errorCodes);
      const hCaptchaToken = req.body["h-captcha-response"];
      if (!hCaptchaToken) {
        req.flash("error", "Xác thực CAPTCHA thất bại. Vui lòng xác thực hCaptcha.");
        return res.redirect("/register");
      }
      const hCaptchaSecret = "ES_877d5a194ad041a680490a255dd79e3f";
      const hCaptchaVerificationURL = "https://hcaptcha.com/siteverify";
      const hParams = new URLSearchParams();
      hParams.append("secret", hCaptchaSecret);
      hParams.append("response", hCaptchaToken);
      hParams.append("remoteip", req.ip || "");
      const hResponse = await axios.post(hCaptchaVerificationURL, hParams);
      const hData = hResponse.data;
      if (!hData.success) {
        console.error("hCaptcha verification failed:", hData["error-codes"]);
        req.flash("error", "Xác thực hCaptcha không hợp lệ, hãy thử lại.");
        return res.redirect("/register");
      }
    }
    let newUser = new User({ username, password, class: userClass, school });
    await newUser.save();
    req.flash("success", "Đăng ký thành công!");
    io.emit("liveAccess", {
      username: newUser.username,
      time: new Date().toLocaleString("vi-VN"),
      type: "register",
    });
    res.redirect("/login");
  } catch (error) {
    console.error("Lỗi trong quá trình đăng ký:", error);
    req.flash("error", "Đăng ký không thành công, hãy thử lại!");
    return res.redirect("/register");
  }
});

app.get("/login", (req, res) => {
  res.render("login", { user: req.user || null, activePage: "login" });
});

app.post("/login", async (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) { return next(err); }
    if (!user) {
      req.flash("error", info.message || "Tên đăng nhập hoặc mật khẩu không chính xác.");
      return res.redirect("/login");
    }
    req.logIn(user, async (loginErr) => {
      if (loginErr) { return next(loginErr); }
      try {
        user.lastLoginIP = req.ip;
        user.lastloginUA = req.get("User-Agent") || "Unknown User-Agent";
        await user.save();
      } catch (saveErr) {
        console.error("Lỗi cập nhật thông tin user sau login:", saveErr);
      }
      let isAdminForForum = user.isAdmin || false;
      if (user.username === 'truonghoangnam') {
        isAdminForForum = true;
      }
      const payload = {
        id: user._id.toString(),
        username: user.username,
        email: user.email || "",
        isPro: user.isPro || false,
        isAdmin: isAdminForForum,
        avatar: user.avatar || "https://cdn.glitch.global/b34fd7c6-dd60-4242-a917-992503c79a1f/7915522.png?v=1745082805191",
      };
      const secretKey = process.env.JWT_SECRET;
      const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
      const token = jwt.sign(payload, secretKey, { expiresIn: expiresIn });
      const redirectToForum = req.body.redirect_to_forum === 'true';
      if (redirectToForum && process.env.FORUM_APP_URL) {
        return res.redirect(`${process.env.FORUM_APP_URL}#token=${token}`);
      } else {
        req.flash("success", "Đăng nhập thành công!");
        return res.redirect("/");
      }
    });
  })(req, res, next);
});

app.get("/upgrade", isLoggedIn, (req, res) => {
  if (req.user.isPro) {
    return res.redirect("/dashboard");
  }
  const flashError = req.flash("error");
  const message = flashError && flashError.length > 0 ? flashError[0] : "";
  res.render("upgrade", { user: req.user, message: message, activePage: "upgrade" });
});

app.post("/upgrade", isLoggedIn, async (req, res) => {
  try {
    const { secretKey } = req.body;
    if (!req.user.proSecretKey || req.user.proSecretKey.trim() === "") {
      req.flash("error", "Tài khoản của bạn chưa được cấu hình khóa bí mật PRO. Vui lòng liên hệ quản trị viên.");
      return res.redirect("/upgrade");
    }
    if (secretKey === req.user.proSecretKey) {
      req.user.isPro = true;
      await req.user.save();
      req.flash("success", "Bạn đã nâng cấp thành tài khoản PRO thành công!");
      return res.redirect("/profile");
    } else {
      req.flash("error", "Khóa bí mật không chính xác!");
      return res.redirect("/upgrade");
    }
  } catch (err) {
    console.error(err);
    req.flash("error", "Có lỗi xảy ra khi nâng cấp tài khoản.");
    return res.redirect("/upgrade");
  }
});

app.get("/dashboard", isLoggedIn, async (req, res) => {
  try {
    const allSubjectsPromise = Subject.find({}).select("_id name").lean();
    const sortOption = req.query.sort || "desc";
    const lessonsSortObj = sortOption === "asc" ? { createdAt: 1 } : { createdAt: -1 };
    async function getLessons(query, user, sortObj) {
      let lessons;
      if (query.q) {
        const filter1 = { createdBy: user._id };
        if (query.subject) filter1.subject = query.subject;
        if (query.category) filter1.category = query.category;
        const searchRegex = new RegExp(query.q, "i");
        filter1.$or = [{ title: searchRegex }, { content: searchRegex }];
        lessons = await Lesson.find(filter1).populate("subject createdBy").sort(sortObj).lean();
        if (lessons && lessons.length > 0) return lessons;
      }
      const filter2 = { createdBy: user._id };
      if (query.subject) filter2.subject = query.subject;
      if (query.category) filter2.category = query.category;
      lessons = await Lesson.find(filter2).populate("subject createdBy").sort(sortObj).lean();
      if (lessons && lessons.length > 0) return lessons;
      const filter3 = { createdBy: user._id };
      lessons = await Lesson.find(filter3).populate("subject createdBy").sort(sortObj).lean();
      return lessons;
    }
    let newsFilter = { postedBy: req.user._id };
    if (req.query.newsCategory) {
      newsFilter.category = req.query.newsCategory;
    }
    if (req.query.newsQuery) {
      newsFilter.title = { $regex: req.query.newsQuery, $options: "i" };
    }
    const newsSortOrder = req.query.newsSort === "asc" ? 1 : -1;
    const newsPromise = News.find(newsFilter).sort({ createdAt: newsSortOrder }).lean();
    const [subjects, userNews, lessons] = await Promise.all([allSubjectsPromise, newsPromise, getLessons(req.query, req.user, lessonsSortObj)]);
    res.render("dashboard", { user: req.user, lessons, userNews, subjects, currentSubject: req.query.subject || "", currentCategory: req.query.category || "", currentSort: sortOption, currentQuery: req.query.q || "", currentNewsCategory: req.query.newsCategory || "", currentNewsQuery: req.query.newsQuery || "", currentNewsSort: req.query.newsSort || "desc", activePage: "dashboard" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Lỗi khi tải bảng điều khiển.");
  }
});

// This route seems to use a non-existent 'ProgressTrackingService'. I'm commenting it out to prevent crashes.
// If you have this service, you can uncomment it.
/*
app.get('/dashboardv2', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;
        const overviewPromise = ProgressTrackingService.getUserProgressOverview(userId);
        const dueReviewsPromise = ProgressTrackingService.getDueReviews(userId, 5);
        const createdLessonsPromise = Lesson.find({ createdBy: userId }).limit(10).sort({ createdAt: -1 }).populate('subject', 'name').lean();
        const [overview, dueReviewsData, createdLessons] = await Promise.all([overviewPromise, dueReviewsPromise, createdLessonsPromise]);
        res.render('dashboardEnhanced', { user: req.user, overview: overview, dueReviews: dueReviewsData.dueLessons || [], createdLessons: createdLessons || [], activePage: 'dashboard' });
    } catch (error) {
        console.error("Error loading enhanced dashboard:", error);
        req.flash('error', 'Không thể tải bảng điều khiển.');
        res.redirect('/');
    }
});
*/

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) { return next(err); }
    res.redirect("/");
  });
});

app.get("/profile", isLoggedIn, async (req, res) => {
  try {
    const achievements = await Achievement.find({ user: req.user._id }).lean();
    if (req.user.createdAt && typeof req.user.createdAt === "string") {
      req.user.createdAt = new Date(req.user.createdAt);
    }
    res.render("profile", { user: req.user, achievements, activePage: 'profile' });
  } catch(err) {
    console.error("Error loading profile:", err);
    req.flash('error', 'Không thể tải hồ sơ.');
    res.redirect('/');
  }
});

app.get("/profile/edit", isLoggedIn, (req, res) => {
  res.render("editProfile", { user: req.user, activePage: "profile" });
});

app.post("/profile/edit", isLoggedIn, async (req, res) => {
  try {
    const { email, bio, class: userClass, school, resetPassword, currentPassword, newPassword, confirmNewPassword, } = req.body;
    let user = req.user;
    user.email = email;
    user.bio = bio;
    user.class = userClass;
    user.school = school;
    if (resetPassword === "true") {
      if (!currentPassword || !newPassword || !confirmNewPassword) {
        req.flash("error", "Vui lòng nhập đầy đủ thông tin mật khẩu để thay đổi mật khẩu.");
        return res.redirect("/profile/edit");
      }
      if (newPassword !== confirmNewPassword) {
        req.flash("error", "Mật khẩu mới không khớp với xác nhận.");
        return res.redirect("/profile/edit");
      }
      const turnstileToken = req.body["cf-turnstile-response"];
      if (!turnstileToken) {
        req.flash("error", "Vui lòng xác thực CAPTCHA để đổi mật khẩu.");
        return res.redirect("/profile/edit");
      }
      const secretKey = process.env.TURNSTILE_SECRET_KEY;
      const verificationURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
      const params = new URLSearchParams();
      params.append("secret", secretKey);
      params.append("response", turnstileToken);
      params.append("remoteip", req.ip || "");
      const cfResponse = await axios.post(verificationURL, params);
      const { success } = cfResponse.data;
      if (!success) {
        req.flash("error", "Xác thực CAPTCHA không hợp lệ, hãy thử lại.");
        return res.redirect("/profile/edit");
      }
      const isMatch = await new Promise((resolve, reject) => {
        user.comparePassword(currentPassword, (err, isMatch) => {
          if (err) return reject(err);
          resolve(isMatch);
        });
      });
      if (!isMatch) {
        req.flash("error", "Mật khẩu hiện tại không đúng.");
        return res.redirect("/profile/edit");
      }
      user.password = newPassword;
    }
    await user.save();
    req.flash("success", "Hồ sơ được cập nhật thành công!");
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    req.flash("error", "Lỗi cập nhật hồ sơ.");
    res.redirect("/profile/edit");
  }
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// MỚI (ĐÃ SỬA): Chuyển đổi Subject.find sang async/await
app.get("/subjects", async (req, res) => {
  try {
    const subjects = await Subject.find({}).lean();
    res.render("subjects", { user: req.user, subjects: subjects, activePage: "subjects" });
  } catch (err) {
    console.error("Error fetching subjects:", err);
    req.flash('error', 'Lỗi truy vấn dữ liệu các môn học!');
    res.redirect('/');
  }
});

app.get("/subjects/:id", async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id).lean();
    if (!subject) {
        req.flash('error', 'Môn học không tồn tại!');
        return res.redirect('/subjects');
    }
    let filter = { subject: subject._id };
    if (req.query.category) {
      filter.category = req.query.category;
    }
    if (req.query.q) {
      const searchRegex = new RegExp(req.query.q, "i");
      filter.$or = [{ title: searchRegex }, { content: searchRegex }];
    }
    const sortOption = req.query.sort || "desc";
    const sortObj = sortOption === "asc" ? { createdAt: 1 } : { createdAt: -1 };
    const lessons = await Lesson.find(filter).populate("subject createdBy").sort(sortObj).lean();
    res.render("lessons", { user: req.user, subject, lessons, currentCategory: req.query.category || "", currentQuery: req.query.q || "", currentSort: sortOption, activePage: "subjects" });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Lỗi truy vấn bài học!');
    res.redirect('/subjects');
  }
});

app.get("/lesson/add", isLoggedIn, async (req, res) => {
  try {
    const subjects = await Subject.find({}).lean();
    res.render("ManageLesson", { mode: "add", user: req.user, subjects: subjects, lesson: null, message: req.flash(), activePage: "lessonAdd" });
  } catch (err) {
    console.error("Error fetching data for add lesson page:", err);
    req.flash('error', 'Lỗi tải trang tạo bài học.');
    res.redirect('/dashboard');
  }
});

app.post("/lesson/add", isLoggedIn, async (req, res) => {
  const turnstileToken = req.body["cf-turnstile-response"];
  if (!turnstileToken) {
    req.flash("error", "Vui lòng xác thực CAPTCHA.");
    return res.redirect("/lesson/add");
  }
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  try {
    const params = new URLSearchParams();
    params.append("secret", secretKey);
    params.append("response", turnstileToken);
    params.append("remoteip", req.ip || "");
    const cfResponse = await axios.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", params);
    const { success, "error-codes": errorCodes } = cfResponse.data;
    if (!success) {
      console.error("Turnstile verification failed:", errorCodes);
      req.flash("error", "Xác thực CAPTCHA không hợp lệ, hãy thử lại.");
      return res.redirect("/lesson/add");
    }
  } catch (error) {
    console.error("Lỗi trong quá trình xác thực CAPTCHA:", error);
    req.flash("error", "Có lỗi xảy ra trong quá trình xác thực CAPTCHA, hãy thử lại sau.");
    return res.redirect("/lesson/add");
  }
  let { subjectId, title, content, category, type } = req.body;
  if (typeof content !== "string" || content.trim() === "") {
    if (type === "markdown" && req.body.editorData && req.body.editorData.markdown) { content = req.body.editorData.markdown; } 
    else if (type === "video" && req.body.editorData && req.body.editorData.video) { content = req.body.editorData.video; } 
    else if (type === "quiz" && req.body.editorData && req.body.editorData.quiz) { content = "Bài trắc nghiệm"; } 
    else if (type === "essay") {
      const essayPrompt = req.body.editorData && req.body.editorData.essayPrompt ? req.body.editorData.essayPrompt : "";
      const essayAnswer = req.body.editorData && req.body.editorData.essay ? req.body.editorData.essay : "";
      content = essayPrompt + "\n\n" + essayAnswer;
    } else { content = ""; }
  }
  const newLesson = new Lesson({ subject: subjectId, title: title, content: content, category: category, type: type || "markdown", createdBy: req.user._id, editorData: req.body.editorData, isProOnly: req.body.isProOnly === "true" ? true : false });
  try {
    await newLesson.save();
    io.emit("newLesson", { lessonId: newLesson._id, title: newLesson.title });
    req.flash("success", "Bài học mới đã được thêm!");
    res.redirect("/subjects/" + subjectId);
  } catch (err) {
    console.error(err);
    req.flash("error", "Không thể thêm bài học, hãy thử lại!");
    res.redirect("/lesson/add");
  }
});

app.get("/lesson/:id", isLoggedIn, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).populate("createdBy", "username avatar _id").lean();
    if (!lesson) {
      req.flash("error", "Bài học không tồn tại!");
      return res.redirect("/subjects");
    }
    let subject = null;
    if (lesson.subject) {
      try {
        subject = await Subject.findById(lesson.subject).select("name").lean();
        if (!subject) { console.warn(`Subject ID ${lesson.subject} found in lesson ${lesson._id}, but Subject document not found.`); }
      } catch (subjectErr) {
        console.error(`Error fetching subject ${lesson.subject} for lesson ${lesson._id}:`, subjectErr);
      }
    } else {
      console.warn(`Lesson ${lesson._id} does not have a subject ID associated.`);
    }
    let renderedContent = "";
    let estimatedReadingTime = 0;
    if (lesson.type === "markdown") {
      const mdContent = lesson.editorData?.markdown || lesson.content || "";
      try {
        renderedContent = marked.parse(mdContent);
      } catch (parseError) {
        console.error("Marked parsing error:", parseError);
        renderedContent = `<p>Lỗi hiển thị nội dung.</p>`;
      }
      const wordCount = mdContent.split(/\s+/).filter(Boolean).length;
      estimatedReadingTime = Math.ceil(wordCount / 200);
    }
    let quizData = [];
    if (lesson.type === "quiz" && lesson.editorData?.quiz) {
      try {
        quizData = JSON.parse(lesson.editorData.quiz);
      } catch (e) {
        console.error(`Error parsing quiz data for lesson ${lesson._id}:`, e);
        quizData = [];
      }
    }
    let essayData = [];
    if (lesson.type === "essay" && lesson.editorData?.essay) {
      try {
        essayData = JSON.parse(lesson.editorData.essay);
      } catch (e) {
        console.error(`Error parsing essay data for lesson ${lesson._id}:`, e);
        essayData = [];
      }
    }
    const lessonDataForRender = { ...lesson, subject: subject, renderedContent, estimatedReadingTime, quizData, essayData };
    res.render("lessonDetail", { user: req.user, lesson: lessonDataForRender, marked: marked, activePage: "subjects" });
  } catch (err) {
    console.error("Error fetching lesson detail:", err);
    req.flash("error", "Lỗi tải bài học.");
    res.redirect("/subjects");
  }
});

// MỚI (ĐÃ SỬA): Chuyển đổi sang async/await và dùng deleteOne()
app.post("/lesson/:id/delete", isLoggedIn, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      req.flash("error", "Bài đăng không tồn tại.");
      return res.redirect("/dashboard");
    }
    if (lesson.createdBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền xóa bài đăng này.");
      return res.redirect("/dashboard");
    }
    await lesson.deleteOne();
    req.flash("success", "Bài đăng đã được xóa thành công.");
    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Error deleting lesson:", err);
    req.flash("error", "Lỗi khi xóa bài đăng. Vui lòng thử lại.");
    return res.redirect("/dashboard");
  }
});

app.get("/lesson/:id/edit", isLoggedIn, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).select("_id subject title content category type editorData isProOnly createdBy").lean();
    if (!lesson) {
      req.flash("error", "Bài học không tồn tại.");
      return res.redirect("/dashboard");
    }
    if (lesson.createdBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền chỉnh sửa bài học này.");
      return res.redirect("/dashboard");
    }
    const subjects = await Subject.find({}).lean();
    res.render("ManageLesson", { mode: "edit", user: req.user, lesson: lesson, subjects: subjects, message: req.flash(), activePage: "dashboard" });
  } catch (err) {
    console.error("Error fetching lesson for edit:", err);
    req.flash("error", "Có lỗi xảy ra khi tải trang chỉnh sửa bài học.");
    res.redirect("/dashboard");
  }
});

app.post("/lesson/:id/edit", isLoggedIn, upload.none(), async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      req.flash("error", "Bài học không tồn tại.");
      return res.redirect("/dashboard");
    }
    if (lesson.createdBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền chỉnh sửa bài học này.");
      return res.redirect("/dashboard");
    }
    let { subjectId, title, content, category, type, editorData, isProOnly } = req.body;
    if (typeof content !== "string" || content.trim() === "") {
      if (type === "markdown" && req.body.editorData && req.body.editorData.markdown) { content = req.body.editorData.markdown; } 
      else if (type === "video" && req.body.editorData && req.body.editorData.video) { content = req.body.editorData.video; } 
      else if (type === "quiz" && req.body.editorData && req.body.editorData.quiz) { content = "Bài trắc nghiệm"; } 
      else if (type === "essay") { content = req.body.editorData.essay; } 
      else { content = ""; }
    }
    lesson.subject = subjectId;
    lesson.title = title;
    lesson.content = content;
    lesson.category = category;
    lesson.type = type || "markdown";
    lesson.editorData = editorData;
    lesson.isProOnly = isProOnly === "true";
    await lesson.save();
    req.flash("success", "Bài học đã được cập nhật thành công.");
    res.redirect("/lesson/" + lesson._id);
  } catch (err) {
    console.error(err);
    req.flash("error", "Có lỗi xảy ra khi cập nhật bài học.");
    res.redirect("/lesson/" + req.params.id + "/edit");
  }
});

app.post("/lesson/:id/complete", completeLessonLimiter, isLoggedIn, async (req, res) => {
  try {
    const lessonId = req.params.id;
    const userId = req.user._id;
    const existingCompletion = await LessonCompletion.findOne({ user: userId, lesson: lessonId });
    if (existingCompletion) {
      return res.status(400).json({ error: "Bài học này đã được ghi nhận hoàn thành rồi." });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Không tìm thấy người dùng." });
    }
    const pointsAwarded = 10;
    user.points += pointsAwarded;
    const growthResult = await updateGrowth(user, pointsAwarded, req.app.locals.io, `Hoàn thành bài: ${lessonId}`);
    const completion = new LessonCompletion({ user: userId, lesson: lessonId });
    await completion.save();
    await user.save();
    const responseData = { success: true, message: `Hoàn thành bài học! +${pointsAwarded} điểm.`, points: user.points, pointsAwarded, leveledUp: growthResult.leveledUp, newTreeLevel: growthResult.newLevel };
    res.json(responseData);
  } catch (err) {
    console.error("Error in completing lesson:", err);
    res.status(500).json({ error: "Lỗi khi ghi nhận hoàn thành bài học." });
  }
});

app.get("/profile/:id", async (req, res) => {
  try {
    const userProfile = await User.findById(req.params.id).lean();
    if (!userProfile) {
      req.flash("error", "Hồ sơ không tồn tại.");
      return res.redirect("/dashboard");
    }
    const viewedUserAchievements = await Achievement.find({ user: userProfile._id }).lean();
    if (userProfile.createdAt && typeof userProfile.createdAt === "string") {
      userProfile.createdAt = new Date(userProfile.createdAt);
    }
    res.render("profileView", { title: "Hồ sơ của " + userProfile.username, profile: userProfile, user: req.user || null, viewedUserAchievements: viewedUserAchievements, activePage: "profileView" });
  } catch (err) {
    console.error("Error fetching profile view:", err);
    req.flash("error", "Lỗi khi tải hồ sơ người dùng.");
    if (req.user) {
      return res.redirect("/dashboard");
    } else {
      return res.redirect("/");
    }
  }
});

app.post("/essay/grade/:lessonId", isLoggedIn, async (req, res) => {
  try {
    const { answers } = req.body;
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson || lesson.type !== "essay") {
      return res.status(400).json({ error: "Bài học không phải dạng tự luận" });
    }
    let essayData = [];
    if (lesson.editorData && lesson.editorData.essay) {
      essayData = JSON.parse(lesson.editorData.essay);
    }
    let gradingMethod = lesson.editorData && lesson.editorData.essayGrading ? lesson.editorData.essayGrading : "simple";
    if (gradingMethod === "smart" && !req.user.isPro) {
      gradingMethod = "simple";
    }
    const scores = [];
    const diffs = [];
    const comments = [];
    if (gradingMethod === "ai") {
      const aiResult = await gradeEssayAIAll(essayData, answers);
      for (let i = 0; i < essayData.length; i++) {
        scores.push(aiResult.scores[i] || 0);
        comments.push(aiResult.comments[i] || "");
        diffs.push("");
      }
    } else if (gradingMethod === "smart") {
      for (let i = 0; i < essayData.length; i++) {
        const sampleAnswer = essayData[i].sampleAnswer || "";
        const studentAnswer = answers[i] || "";
        let score = await gradeEssaySmart(sampleAnswer, studentAnswer);
        scores.push(score);
        diffs.push("");
        comments.push("");
      }
    } else if (gradingMethod === "absolute") {
      for (let i = 0; i < essayData.length; i++) {
        const sampleAnswer = essayData[i].sampleAnswer || "";
        const studentAnswer = answers[i] || "";
        let score = 0;
        const errorCount = levenshtein(sampleAnswer.toLowerCase(), studentAnswer.toLowerCase());
        let tolerance = 2;
        if (lesson.editorData && lesson.editorData.absoluteTolerance) {
          tolerance = parseInt(lesson.editorData.absoluteTolerance, 10);
        }
        if (errorCount === 0) {
          score = 100;
        } else if (errorCount < tolerance) {
          score = Math.round((100 * (tolerance - errorCount)) / tolerance);
        } else {
          score = 0;
        }
        scores.push(score);
        diffs.push(getWordDiff(sampleAnswer, studentAnswer));
        comments.push("");
      }
    } else {
      for (let i = 0; i < essayData.length; i++) {
        const sampleAnswer = essayData[i].sampleAnswer || "";
        const studentAnswer = answers[i] || "";
        let score = gradeEssaySimple(sampleAnswer, studentAnswer);
        scores.push(score);
        diffs.push(getWordDiff(sampleAnswer, studentAnswer));
        comments.push("");
      }
    }
    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    res.json({ scores, averageScore, diffs, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi chấm bài tự luận" });
  }
});

app.get("/pro-images", isLoggedIn, (req, res) => {
  if (req.user && req.user.isPro) {
    res.render("proImages", { user: req.user, activePage: "proImages" });
  } else {
    res.redirect("/upgrade");
  }
});

app.get("/leaderboard", isLoggedIn, async (req, res) => {
  try {
    const users = await User.find({}).select("username points").sort({ points: -1 }).limit(100).lean();
    res.render("leaderboard", { user: req.user, leaderboard: users, activePage: "leaderboard" });
  } catch (err) {
    console.error(err);
    res.send("Lỗi tải bảng xếp hạng.");
  }
});

app.get("/my-tree", isLoggedIn, (req, res) => {
  try {
    const treeData = {
      treeLevel: req.user.treeLevel || 0,
      growthPoints: req.user.growthPoints || 0,
      pointsForCurrentLevel: getPointsForCurrentLevel(req.user.treeLevel || 0),
      pointsForNextLevel: getPointsForNextLevel(req.user.treeLevel || 0),
      username: req.user.username,
    };
    res.render("myTree", { title: "Cây Thành Tài Của Bạn", user: req.user, treeData: treeData, activePage: "myTree" });
  } catch (error) {
    console.error("Error loading My Tree page:", error);
    req.flash("error", "Không thể tải trang Cây Thành Tài.");
    res.redirect("/dashboard");
  }
});

// API Routes
app.post('/api/auth/register', async (req, res) => {
    const { username, password, email } = req.body;
    const usernameRegex = /^(?=.{6,})[A-Za-z0-9]+$/;
    if (!username || !usernameRegex.test(username)) {
      return res.status(400).json({ message: 'Tên người dùng phải có ít nhất 6 ký tự, chỉ bao gồm chữ và số.' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }
    try {
        const existingUser = await User.findOne({ $or: [{ username: username }, { email: email }] });
        if (existingUser) {
          return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã tồn tại.' });
        }
        let newUser = new User({ username: username, password: password, email: email });
        await newUser.save();
        res.status(201).json({ success: true, message: 'Đăng ký thành công! Vui lòng đăng nhập.' });
    } catch (error) {
        console.error("Lỗi API đăng ký:", error);
        res.status(500).json({ message: 'Đăng ký không thành công, đã có lỗi xảy ra.' });
    }
});

app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
            console.error("API Login - Lỗi Passport authenticate:", err);
            return res.status(500).json({ message: 'Lỗi máy chủ khi đăng nhập.' });
        }
        if (!user) {
            return res.status(401).json({ message: info.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
        }
        try {
             User.findByIdAndUpdate(user._id, {
                  lastLoginIP: req.ip,
                  lastloginUA: req.get('User-Agent') || 'Unknown User-Agent'
             }).exec();
        } catch(saveErr) {
             console.error("API Login - Lỗi cập nhật thông tin user:", saveErr);
        }
        const payload = { id: user._id, username: user.username, email: user.email, isPro: user.isPro, isAdmin: user.isAdmin, };
        const secretKey = process.env.JWT_SECRET;
        const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
        const token = jwt.sign(payload, secretKey, { expiresIn: expiresIn });
        return res.status(200).json({ success: true, message: 'Đăng nhập thành công!', token: token, user: { id: user._id, username: user.username, email: user.email, isPro: user.isPro, isAdmin: user.isAdmin } });
    })(req, res, next);
});

app.post('/api/auth/logout', (req, res, next) => {
    if (req.isAuthenticated()) {
        req.logout(function(err) { if (err) { console.error("API Logout - Lỗi req.logout:", err); } });
    }
     if (req.session) {
         req.session.destroy((destroyErr) => { if (destroyErr) { console.error("API Logout - Lỗi hủy session:", destroyErr); } });
     }
     res.clearCookie('connect.sid');
     return res.status(200).json({ success: true, message: 'Yêu cầu đăng xuất đã được xử lý.' });
});

app.get('/api/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
        const userInfo = { id: req.user._id, username: req.user.username, email: req.user.email, isPro: req.user.isPro };
        res.status(200).json({ isAuthenticated: true, user: userInfo });
    } else {
        res.status(200).json({ isAuthenticated: false, user: null });
    }
});

app.get('/app/essay-helper', (req, res) => {
    res.render('essayAppInfo', { user: req.user, activePage: '', title: 'Giới thiệu App Học Tự Luận' });
});

app.use((req, res, next) => {
  res.status(404).render("404", { title: "Không Tìm Thấy Trang", user: req.user, activePage: "" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).render("error", { title: "Lỗi Máy Chủ", message: "Đã có lỗi xảy ra", error: process.env.NODE_ENV === 'development' ? err : {}, user: req.user, activePage: "" });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Server đang chạy trên cổng " + port);
});

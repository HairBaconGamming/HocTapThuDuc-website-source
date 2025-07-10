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
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

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
    // Cho phép yêu cầu không có origin (như mobile apps hoặc curl requests) hoặc nếu origin nằm trong danh sách allowedOrigins
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Quan trọng: cho phép gửi cookie session qua CORS
};
app.use(cors(corsOptions)); // Sử dụng middleware CORS
const cookieParser = require("cookie-parser");
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(limiter);
// Use cookie secure option set to 'auto' so it automatically adjusts based on HTTPS or not.
app.use(
  session({
    secret: "lop9a3maidinh", // Change this key for security!
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: 'auto', // True nếu dùng HTTPS (Glitch thường là HTTPS)
        httpOnly: true, // Cookie không thể truy cập bằng JS phía client
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax' // 'lax' hoặc 'none' (nếu 'none' cần secure: true). 'lax' là lựa chọn tốt cho balance giữa security và usability.
     }
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
// Configure Passport
passport.use(
  new LocalStrategy(function (username, password, done) {
    User.findOne({ username: username }, function (err, user) {
      if (err) return done(err);
      if (!user)
        return done(null, false, { message: "Tên người dùng không tồn tại." });
      user.comparePassword(password, function (err, isMatch) {
        if (err) return done(err);
        if (!isMatch)
          return done(null, false, { message: "Mật khẩu không chính xác." });
        return done(null, user);
      });
    });
  })
);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    //console.log("Deserialized user:", user);
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

const VisitStats = require("./models/VisitStats"); // Mô hình lưu trữ lượt truy cập
const moment = require("moment-timezone");

// server.js
const liveRouter = require("./routes/live");
app.use("/live", liveRouter);

// Middleware cập nhật lượt truy cập
async function updateVisitStats(req, res, next) {
  try {
    const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");

    // Tăng tổng số lượt truy cập
    await VisitStats.findOneAndUpdate(
      { key: "totalVisits" },
      { $inc: { count: 1 } },
      { upsert: true }
    );

    // Tăng lượt truy cập trong ngày
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

// funcrions
function expandText(text) {
  if (typeof text !== "string") return []; // Handle non-string input
  const normalizedText = text.trim(); // Keep original for now, try regex first
  const rawWords = normalizedText.split(/\s+/);
  let tokens = [];
  for (const word of rawWords) {
    // This regex splits the word into alphanumeric parts and any punctuation attached.
    // For example, "knowledge." becomes ["knowledge", "."]
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
      // Consider case-insensitive and potentially locale-sensitive comparison
      if (
        sampleTokens[i - 1].toLowerCase() === studentTokens[j - 1].toLowerCase()
      ) {
        // Or for more robust comparison:
        // if (sampleTokens[i - 1].localeCompare(studentTokens[j - 1], 'vi', { sensitivity: 'base' }) === 0) {
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
    // Consider case-insensitive and potentially locale-sensitive comparison
    if (
      sampleTokens[i - 1].toLowerCase() === studentTokens[j - 1].toLowerCase()
    ) {
      // Or: if (sampleTokens[i - 1].localeCompare(studentTokens[j - 1], 'vi', { sensitivity: 'base' }) === 0) {
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

  // Now join tokens intelligently.
  let diffStr = "";
  for (let token of tokens) {
    // Check if this token is a diff marker wrapping punctuation.
    let markerPunctuation = "";
    let missingMatch = token.match(
      /^\<span class="diff-error"\>(.+)\<\/span\>$/
    );
    let extraMatch = token.match(
      /^\<span class="diff-error strikethrough"\>(.+)\<\/span\>$/
    );
    if (missingMatch && isPunctuation(missingMatch[1])) {
      markerPunctuation = missingMatch[1];
    } else if (extraMatch && isPunctuation(extraMatch[1])) {
      markerPunctuation = extraMatch[1];
    }

    if (markerPunctuation) {
      // Remove any trailing space from diffStr and append marker directly.
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

  const response = await fetch(
    "https://api-inference.huggingface.co/models/questgen/all-mpnet-base-v2-feature-extraction-pipeline",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: trimmedText }),
    }
  );

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

  // Check if we received a valid embedding vector (assume it should be an array with a certain length)
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

// Simple grading method using word similarity
function gradeEssaySimple(modelAnswer, studentAnswer) {
  const similarity = stringSimilarity.compareTwoStrings(
    modelAnswer,
    studentAnswer
  );
  return Math.round(similarity * 100);
}
async function gradeEssaySmart(modelAnswer, studentAnswer) {
  try {
    // Attempt to get embeddings concurrently
    const [sampleEmbedding, studentEmbedding] = await Promise.all([
      getEmbedding(modelAnswer),
      getEmbedding(studentAnswer),
    ]);

    if (!sampleEmbedding || !studentEmbedding) {
      // Fallback if embeddings are not returned properly
      return gradeEssaySimple(modelAnswer, studentAnswer);
    }

    const similarity = cosineSimilarity(sampleEmbedding, studentEmbedding);
    if (!similarity || isNaN(similarity)) {
      return gradeEssaySimple(modelAnswer, studentAnswer);
    }
    return Math.round(similarity * 100);
  } catch (err) {
    console.error(
      "gradeEssaySmart error, falling back to simple grading:",
      err.message
    );
    // Optionally, alert the user if desired:
    // alert("Advanced grading service is temporarily unavailable. Using simple grading instead.");
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
  // Build a prompt that includes all questions
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
    //console.log("AI Response:", responseText);

    // Parse the response. Expecting a structure like:
    // Question 1:
    // Score: 90
    // Comment: Good work, but missing details.
    // (Blank line)
    // Question 2:
    // Score: 80
    // Comment: ...
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

// Home
app.get("/", updateVisitStats, async (req, res) => {
  try {
    // Đếm số lượng tài khoản đã đăng ký
    const totalUsers = await User.countDocuments();

    // Đếm số lượt truy cập tổng và trong ngày
    const totalVisitsDoc = await VisitStats.findOne({ key: "totalVisits" });
    const today = moment().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");
    const dailyVisitsDoc = await VisitStats.findOne({
      key: `dailyVisits_${today}`,
    });

    const totalVisits = totalVisitsDoc ? totalVisitsDoc.count : 0;
    const dailyVisits = dailyVisitsDoc ? dailyVisitsDoc.count : 0;

    // Lấy 5 bài học mới nhất
    const latestLessons = await Lesson.find().sort({ createdAt: -1 }).limit(5);

    // Lấy 5 tin tức mới nhất
    const latestNews = await News.find().sort({ createdAt: -1 }).limit(5);

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
// Register
app.get("/register", (req, res) => {
  res.render("register", {
    user: req.user || null,
    activePage: "register",
  });
});

app.post("/register", async (req, res) => {
  const { username, password, class: userClass, school } = req.body;

  // Kiểm tra hợp lệ tên người dùng
  const usernameRegex = /^(?=.{8,})[A-Za-z0-9]+$/;
  if (!usernameRegex.test(username)) {
    req.flash(
      "error",
      "Tên người dùng phải có ít nhất 8 ký tự, chỉ bao gồm chữ và số, không có khoảng trắng."
    );
    return res.redirect("/register");
  }

  // Danh sách các trường THCS hợp lệ
  const validSchools = [
    "Trường THCS Lương Định Của",
    "Trường THCS Bình Thọ",
    "Trường THCS Hiệp Phú",
    "Trường THCS Trường Thọ",
    "Trường THCS An Phú",
    "Trường THCS Linh Trung",
    "Trường THCS Nguyễn Văn Bá",
    "Trường THCS Bình An",
    "Trường THCS Nguyễn Thị Định",
    "Trường TH, THCS, THPT Ngô Thời Nhiệm",
    "Trường THCS, THPT Nguyễn Khuyến",
    "Trường Tiểu học - THCS - THPT Hoa Sen",
    "Trường THCS Hoa Lư",
    "Trường THCS Trần Quốc Toản",
    "Trường THCS Phước Bình",
  ];
  if (!validSchools.includes(school)) {
    req.flash("error", "Vui lòng chọn trường THCS hợp lệ tại TP Thủ Đức.");
    return res.redirect("/register");
  }

  // Lấy token Turnstile từ client
  const turnstileToken = req.body["cf-turnstile-response"];
  if (!turnstileToken) {
    req.flash("error", "Vui lòng xác thực CAPTCHA.");
    return res.redirect("/register");
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;

  try {
    // Xác thực Turnstile
    const verificationURL =
      "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const params = new URLSearchParams();
    params.append("secret", turnstileSecret);
    params.append("response", turnstileToken);
    params.append("remoteip", req.ip || "");

    const cfResponse = await axios.post(verificationURL, params);
    const { success, "error-codes": errorCodes } = cfResponse.data;

    if (!success) {
      console.error("Turnstile verification failed:", errorCodes);
      // Nếu Turnstile không thành công, thử xác thực với hCaptcha
      const hCaptchaToken = req.body["h-captcha-response"];
      if (!hCaptchaToken) {
        req.flash(
          "error",
          "Xác thực CAPTCHA thất bại. Vui lòng xác thực hCaptcha."
        );
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

    // Nếu CAPTCHA hợp lệ, tạo người dùng mới
    let newUser = new User({
      username,
      password,
      class: userClass,
      school,
    });
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

// Login
app.get("/login", (req, res) => {
  res.render("login", { user: req.user || null, activePage: "login" });
});

app.post("/login", async (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) { return next(err); }
    if (!user) {
      req.flash("error", info.message || "Tên đăng nhập hoặc mật khẩu không chính xác.");
      // Redirect về trang login của web chính như cũ nếu đăng nhập qua form EJS
      return res.redirect("/login");
    }
    req.logIn(user, async (loginErr) => {
      if (loginErr) { return next(loginErr); }

      // Cập nhật thông tin đăng nhập như cũ
      try {
          user.lastLoginIP = req.ip;
          user.lastloginUA = req.get("User-Agent") || "Unknown User-Agent";
          await user.save();
      } catch(saveErr) {
           console.error("Lỗi cập nhật thông tin user sau login:", saveErr);
      }

      // --- TẠO JWT ---
      let isAdminForForum = user.isAdmin || false;

      // --- START: Explicitly grant admin status to 'truonghoangnam' ---
      if (user.username === 'truonghoangnam') {
          console.log(`[JWT Generation] Granting admin status to user: ${user.username}`); // Add logging
          isAdminForForum = true;
      }
      // --- END: Explicit grant ---

      // Construct the JWT payload
      const payload = {
        id: user._id.toString(), // Ensure ID is a string if it's an ObjectId
        username: user.username,
        email: user.email || "", // Send empty string if null/undefined, or handle as needed
        isPro: user.isPro || false, // Ensure boolean default
        isAdmin: isAdminForForum, // Use the potentially overridden admin status
        avatar: user.avatar || "https://cdn.glitch.global/b34fd7c6-dd60-4242-a917-992503c79a1f/7915522.png?v=1745082805191", // Use user's avatar or default
        // Add iat (issued at) and exp (expiration) claims during signing
      };
      const secretKey = process.env.JWT_SECRET;
      const expiresIn = process.env.JWT_EXPIRES_IN || '1d'; // Lấy từ env hoặc mặc định

      const token = jwt.sign(payload, secretKey, { expiresIn: expiresIn });

      // --- QUYẾT ĐỊNH CHUYỂN HƯỚNG ---
      // Kiểm tra xem có query param 'redirect_to_forum=true' không?
      // Hoặc một cách khác để biết request này đến từ việc muốn login cho diễn đàn
      const redirectToForum = req.body.redirect_to_forum === 'true';

      if (redirectToForum && process.env.FORUM_APP_URL) {
          // Chuyển hướng về Diễn đàn kèm token trong URL Fragment (#)
          console.log(`Redirecting to forum with token for user ${user.username}`);
          return res.redirect(`${process.env.FORUM_APP_URL}#token=${token}`);
      } else {
          // Nếu không phải là login cho diễn đàn, giữ lại session và redirect về trang chủ web chính
          req.flash("success", "Đăng nhập thành công!");
          const currentTime = new Date().toLocaleString("vi-VN");
          // io.emit(...) // Giữ lại socket emit nếu có
          return res.redirect("/"); // Hoặc trang dashboard của web chính
      }
    });
  })(req, res, next);
});

/* ========= Pro Account Upgrade Routes ========= */
// GET upgrade form
app.get("/upgrade", isLoggedIn, (req, res) => {
  if (req.user.isPro) {
    return res.redirect("/dashboard");
  }
  const flashError = req.flash("error");
  const message = flashError && flashError.length > 0 ? flashError[0] : "";
  res.render("upgrade", {
    user: req.user,
    message: message,
    activePage: "upgrade",
  });
});

app.post("/upgrade", isLoggedIn, async (req, res) => {
  try {
    const { secretKey } = req.body;

    // Prevent bypass: if user's proSecretKey is not set, do not allow upgrade.
    if (!req.user.proSecretKey || req.user.proSecretKey.trim() === "") {
      req.flash(
        "error",
        "Tài khoản của bạn chưa được cấu hình khóa bí mật PRO. Vui lòng liên hệ quản trị viên."
      );
      return res.redirect("/upgrade");
    }

    // Compare the provided key with the stored proSecretKey.
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
    // Bắt đầu 1 truy vấn để lấy subjects (sử dụng .lean() để tăng hiệu suất)
    const allSubjectsPromise = Subject.find({}).select("_id name").lean();

    // Xác định thứ tự sắp xếp cho lessons
    const sortOption = req.query.sort || "desc";
    const lessonsSortObj =
      sortOption === "asc" ? { createdAt: 1 } : { createdAt: -1 };

    // Hàm fallback: thử trải qua các bộ lọc khác nhau cho lesson cho đến khi có kết quả
    async function getLessons(query, user, sortObj) {
      let lessons;
      // Option 1: Bộ lọc đầy đủ: createdBy + (subject, category nếu có) + tìm kiếm (q)
      if (query.q) {
        const filter1 = { createdBy: user._id };
        if (query.subject) filter1.subject = query.subject;
        if (query.category) filter1.category = query.category;
        const searchRegex = new RegExp(query.q, "i");
        filter1.$or = [{ title: searchRegex }, { content: searchRegex }];
        lessons = await Lesson.find(filter1)
          .populate("subject createdBy")
          .sort(sortObj)
          .lean();
        if (lessons && lessons.length > 0) return lessons;
      }
      // Option 2: Nếu không có kết quả, bỏ điều kiện tìm kiếm (q)
      const filter2 = { createdBy: user._id };
      if (query.subject) filter2.subject = query.subject;
      if (query.category) filter2.category = query.category;
      lessons = await Lesson.find(filter2)
        .populate("subject createdBy")
        .sort(sortObj)
        .lean();
      if (lessons && lessons.length > 0) return lessons;
      // Option 3: Nếu vẫn không có, chỉ lọc theo createdBy
      const filter3 = { createdBy: user._id };
      lessons = await Lesson.find(filter3)
        .populate("subject createdBy")
        .sort(sortObj)
        .lean();
      return lessons;
    }

    // Tạo truy vấn cho tin tức của người dùng (News)
    let newsFilter = { postedBy: req.user._id };
    if (req.query.newsCategory) {
      newsFilter.category = req.query.newsCategory;
    }
    if (req.query.newsQuery) {
      newsFilter.title = { $regex: req.query.newsQuery, $options: "i" };
    }
    const newsSortOrder = req.query.newsSort === "asc" ? 1 : -1;
    const newsPromise = News.find(newsFilter)
      .sort({ createdAt: newsSortOrder })
      .lean();

    // Chạy song song các truy vấn: Subjects, News và Lesson (với fallback)
    const [subjects, userNews, lessons] = await Promise.all([
      allSubjectsPromise,
      newsPromise,
      getLessons(req.query, req.user, lessonsSortObj),
    ]);

    // Render giao diện dashboard với dữ liệu đã có
    res.render("dashboard", {
      user: req.user,
      lessons,
      userNews,
      subjects,
      currentSubject: req.query.subject || "",
      currentCategory: req.query.category || "",
      currentSort: sortOption,
      currentQuery: req.query.q || "",
      currentNewsCategory: req.query.newsCategory || "",
      currentNewsQuery: req.query.newsQuery || "",
      currentNewsSort: req.query.newsSort || "desc",
      activePage: "dashboard",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Lỗi khi tải bảng điều khiển.");
  }
});

app.get('/dashboardv2', isLoggedIn, async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch all necessary data concurrently
        const overviewPromise = ProgressTrackingService.getUserProgressOverview(userId);
        const dueReviewsPromise = ProgressTrackingService.getDueReviews(userId, 5); // Limit reviews shown on dashboard
         // Fetch created lessons if needed for the 'Created Lessons' tab
         const createdLessonsPromise = LessonEnhanced.find({ createdBy: userId })
             .limit(10) // Limit results for dashboard view
             .sort({ createdAt: -1 })
             .populate('subject', 'name') // Populate necessary fields
             .lean();


        const [overview, dueReviewsData, createdLessons] = await Promise.all([
            overviewPromise,
            dueReviewsPromise,
            createdLessonsPromise
        ]);

        res.render('dashboardEnhanced', { // Render the new EJS file
            user: req.user,
            overview: overview, // Contains lessonProgress, pathProgress, skillMastery
            dueReviews: dueReviewsData.dueLessons || [], // Extract lessons from the reviews data
            createdLessons: createdLessons || [], // Pass created lessons
            activePage: 'dashboard'
        });
    } catch (error) {
        console.error("Error loading enhanced dashboard:", error);
        req.flash('error', 'Không thể tải bảng điều khiển.');
        res.redirect('/');
    }
});

// Logout
app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Profile system
app.get("/profile", isLoggedIn, async (req, res) => {
  const achievements = await Achievement.find({ user: req.user._id }).lean();
  if (req.user.createdAt && typeof req.user.createdAt === "string") {
    req.user.createdAt = new Date(req.user.createdAt);
  }
  res.render("profile", { user: req.user, achievements });
});

app.get("/profile/edit", isLoggedIn, (req, res) => {
  res.render("editProfile", { user: req.user, activePage: "profile" });
});

app.post("/profile/edit", isLoggedIn, async (req, res) => {
  try {
    const {
      email,
      bio,
      class: userClass,
      school,
      resetPassword,
      currentPassword,
      newPassword,
      confirmNewPassword,
    } = req.body;
    let user = req.user;

    // Cập nhật thông tin cá nhân
    user.email = email;
    user.bio = bio;
    user.class = userClass;
    user.school = school;

    // Chỉ xử lý thay đổi mật khẩu nếu resetPassword được bật (giá trị "true")
    if (resetPassword === "true") {
      // Kiểm tra bắt buộc nhập đầy đủ các trường mật khẩu
      if (!currentPassword || !newPassword || !confirmNewPassword) {
        req.flash(
          "error",
          "Vui lòng nhập đầy đủ thông tin mật khẩu để thay đổi mật khẩu."
        );
        return res.redirect("/profile/edit");
      }
      // Kiểm tra mật khẩu mới khớp với xác nhận không
      if (newPassword !== confirmNewPassword) {
        req.flash("error", "Mật khẩu mới không khớp với xác nhận.");
        return res.redirect("/profile/edit");
      }
      // Xác thực CAPTCHA
      const turnstileToken = req.body["cf-turnstile-response"];
      if (!turnstileToken) {
        req.flash("error", "Vui lòng xác thực CAPTCHA để đổi mật khẩu.");
        return res.redirect("/profile/edit");
      }
      const secretKey = process.env.TURNSTILE_SECRET_KEY;
      const verificationURL =
        "https://challenges.cloudflare.com/turnstile/v0/siteverify";
      const params = new URLSearchParams();
      params.append("secret", secretKey);
      params.append("response", turnstileToken);
      params.append("remoteip", req.ip || "");
      const cfResponse = await axios.post(verificationURL, params);
      const { success, "error-codes": errorCodes } = cfResponse.data;
      if (!success) {
        req.flash("error", "Xác thực CAPTCHA không hợp lệ, hãy thử lại.");
        return res.redirect("/profile/edit");
      }

      // Kiểm tra mật khẩu hiện tại
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
      // Cập nhật mật khẩu
      user.password = newPassword;
    }

    // Lưu thông tin cập nhật
    await user.save();
    req.flash("success", "Hồ sơ được cập nhật thành công!");
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    req.flash("error", "Lỗi cập nhật hồ sơ.");
    res.redirect("/profile/edit");
  }
});

// isLoggedIn middleware
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  //console.log("User not authenticated, session:", req.session);
  res.redirect("/login");
}

// Route: Liệt kê tất cả môn học (mặc định sẽ có 3 môn: Toán, Văn, Anh)
app.get("/subjects", (req, res) => {
  Subject.find({}, function (err, subjects) {
    if (err) return res.send("Lỗi truy vấn dữ liệu các môn học!");
    res.render("subjects", {
      user: req.user,
      subjects: subjects,
      activePage: "subjects",
    });
  });
});

// Route: Hiển thị danh sách bài học của một môn
// Có thể lọc theo category thông qua query string, ví dụ: /subjects/subjectId?category=grammar
app.get("/subjects/:id", async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id).lean();
    if (!subject) return res.send("Môn học không tồn tại!");

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

    const lessons = await Lesson.find(filter)
      .populate("subject createdBy")
      .sort(sortObj)
      .lean();

    res.render("lessons", {
      user: req.user,
      subject,
      lessons,
      currentCategory: req.query.category || "",
      currentQuery: req.query.q || "",
      currentSort: sortOption,
      activePage: "subjects",
    });
  } catch (err) {
    console.error(err);
    res.send("Lỗi truy vấn bài học!");
  }
}); 

// Example Route for displaying the "Add Lesson" form
app.get("/lesson/add", isLoggedIn, async (req, res) => {
  try {
    // Fetch necessary data like subjects
    const subjects = await Subject.find({}).lean();

    // Render the ManageLesson view
    res.render("ManageLesson", {
      // --- Data for the view ---
      mode: "add",                 // Explicitly define the mode
      user: req.user,              // Pass user info
      subjects: subjects,          // Pass subjects list
      lesson: null,                // *** Explicitly pass lesson as null ***
      message: req.flash(),        // Pass flash messages
      activePage: "lessonAdd",     // Set active page for navigation
      // --- End Data ---
    });

  } catch (err) {
    console.error("Error fetching data for add lesson page:", err);
    req.flash('error', 'Lỗi tải trang tạo bài học.');
    res.redirect('/dashboard'); // Or wherever appropriate
  }
});

// Xử lý thêm bài học mới
app.post("/lesson/add", isLoggedIn, async (req, res) => {
  // Bước 1: Xác thực CAPTCHA sử dụng Cloudflare Turnstile
  const turnstileToken = req.body["cf-turnstile-response"];
  if (!turnstileToken) {
    req.flash("error", "Vui lòng xác thực CAPTCHA.");
    return res.redirect("/lesson/add");
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  try {
    // Tạo params gửi lên API Turnstile
    const params = new URLSearchParams();
    params.append("secret", secretKey);
    params.append("response", turnstileToken);
    params.append("remoteip", req.ip || "");

    // Gửi xác minh đến Cloudflare Turnstile
    const cfResponse = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      params
    );
    const { success, "error-codes": errorCodes } = cfResponse.data;
    if (!success) {
      console.error("Turnstile verification failed:", errorCodes);
      req.flash("error", "Xác thực CAPTCHA không hợp lệ, hãy thử lại.");
      return res.redirect("/lesson/add");
    }
  } catch (error) {
    console.error("Lỗi trong quá trình xác thực CAPTCHA:", error);
    req.flash(
      "error",
      "Có lỗi xảy ra trong quá trình xác thực CAPTCHA, hãy thử lại sau."
    );
    return res.redirect("/lesson/add");
  }

  // Bước 2: Xử lý dữ liệu bài học
  let { subjectId, title, content, category, type } = req.body;

  // Nếu content bị rỗng, xác định nội dung từ editorData
  if (typeof content !== "string" || content.trim() === "") {
    if (
      type === "markdown" &&
      req.body.editorData &&
      req.body.editorData.markdown
    ) {
      content = req.body.editorData.markdown;
    } else if (
      type === "video" &&
      req.body.editorData &&
      req.body.editorData.video
    ) {
      content = req.body.editorData.video;
    } else if (
      type === "quiz" &&
      req.body.editorData &&
      req.body.editorData.quiz
    ) {
      content = "Bài trắc nghiệm"; // hoặc tóm tắt riêng
    } else if (type === "essay") {
      // Với bài tự luận, nếu có đề bài (essayPrompt) và phần trả lời (essay), ghép lại nếu cần
      const essayPrompt =
        req.body.editorData && req.body.editorData.essayPrompt
          ? req.body.editorData.essayPrompt
          : "";
      const essayAnswer =
        req.body.editorData && req.body.editorData.essay
          ? req.body.editorData.essay
          : "";
      content = essayPrompt + "\n\n" + essayAnswer;
    } else {
      content = "";
    }
  }

  // Thiết lập đối tượng Lesson mới, lưu tất cả editorData (bao gồm cả essayPrompt nếu có)
  const newLesson = new Lesson({
    subject: subjectId,
    title: title,
    content: content,
    category: category,
    type: type || "markdown",
    createdBy: req.user._id,
    editorData: req.body.editorData,
    isProOnly: req.body.isProOnly === "true" ? true : false,
  });

  try {
    await newLesson.save();

    // (OPTIONAL) Nếu sử dụng Socket.IO, phát sự kiện thông báo có bài học mới
    io.emit("newLesson", { lessonId: newLesson._id, title: newLesson.title });

    req.flash("success", "Bài học mới đã được thêm!");
    res.redirect("/subjects/" + subjectId);
  } catch (err) {
    console.error(err);
    req.flash("error", "Không thể thêm bài học, hãy thử lại!");
    res.redirect("/lesson/add");
  }
});

// Route: Hiển thị chi tiết bài học
// Route: Hiển thị chi tiết bài học
app.get("/lesson/:id", isLoggedIn, async (req, res) => {
  try {
    // 1. Fetch the Lesson document first (without populating subject initially)
    const lesson = await Lesson.findById(req.params.id)
      // Populate createdBy here, as it's straightforward
      .populate("createdBy", "username avatar _id")
      .lean(); // Use lean for performance

    if (!lesson) {
      req.flash("error", "Bài học không tồn tại!");
      return res.redirect("/subjects");
    }

    // 2. Fetch the Subject separately using the lesson's subject ID
    let subject = null; // Initialize subject as null
    if (lesson.subject) {
      // Check if lesson HAS a subject ID
      try {
        subject = await Subject.findById(lesson.subject).select("name").lean();
        // If subject is null after query (ID existed but subject deleted?), handle gracefully
        if (!subject) {
          console.warn(
            `Subject ID ${lesson.subject} found in lesson ${lesson._id}, but Subject document not found.`
          );
        }
      } catch (subjectErr) {
        // Log error finding subject but continue rendering lesson if possible
        console.error(
          `Error fetching subject ${lesson.subject} for lesson ${lesson._id}:`,
          subjectErr
        );
      }
    } else {
      console.warn(
        `Lesson ${lesson._id} does not have a subject ID associated.`
      );
    }

    // --- Keep Markdown processing logic ---
    let renderedContent = "";
    let estimatedReadingTime = 0;
    if (lesson.type === "markdown") {
      const marked = require("marked"); // Ensure marked is available
      const mdContent = lesson.editorData?.markdown || lesson.content || "";
      try {
        renderedContent = marked.parse(mdContent);
      } catch (parseError) {
        console.error("Marked parsing error:", parseError);
        renderedContent = `<p>Lỗi hiển thị nội dung.</p>`;
      }
      const wordCount = mdContent.split(/\s+/).filter(Boolean).length;
      estimatedReadingTime = Math.ceil(wordCount / 200); // minutes
    }
    // --- End Markdown processing ---

    // --- Prepare Quiz Data ---
    let quizData = [];
    if (lesson.type === "quiz" && lesson.editorData?.quiz) {
      try {
        quizData = JSON.parse(lesson.editorData.quiz);
      } catch (e) {
        console.error(`Error parsing quiz data for lesson ${lesson._id}:`, e);
        quizData = [];
      }
    }
    // --- End Quiz Data ---

    // --- Prepare Essay Data ---
    let essayData = [];
    if (lesson.type === "essay" && lesson.editorData?.essay) {
      try {
        essayData = JSON.parse(lesson.editorData.essay);
      } catch (e) {
        console.error(`Error parsing essay data for lesson ${lesson._id}:`, e);
        essayData = [];
      }
    }
    // --- End Essay Data ---

    // Combine data for rendering
    const lessonDataForRender = {
      ...lesson,
      // Explicitly add the fetched subject object (or null)
      // This makes it clear in the template that 'subject' might be null
      subject: subject,
      renderedContent,
      estimatedReadingTime,
      quizData,
      essayData,
    };

    res.render("lessonDetail", {
      user: req.user,
      lesson: lessonDataForRender, // Pass the combined object
      marked: marked, // Only if needed client-side
      activePage: "subjects", // Or determine dynamically
    });
  } catch (err) {
    // Catch errors from fetching lesson or other async ops
    console.error("Error fetching lesson detail:", err);
    req.flash("error", "Lỗi tải bài học.");
    res.redirect("/subjects"); // Redirect on error
  }
});

// Route: Xóa bài đăng (chỉ chủ bài đăng mới có quyền xóa)
app.post("/lesson/:id/delete", isLoggedIn, (req, res) => {
  Lesson.findById(req.params.id, function (err, lesson) {
    if (err || !lesson) {
      req.flash("error", "Bài đăng không tồn tại.");
      return res.redirect("/dashboard");
    }
    // Kiểm tra xem người dùng hiện tại có phải là chủ bài đăng không
    if (lesson.createdBy._id.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền xóa bài đăng này.");
      return res.redirect("/dashboard");
    }
    // Xóa bài đăng
    lesson.remove(function (err) {
      if (err) {
        req.flash("error", "Lỗi khi xóa bài đăng. Vui lòng thử lại.");
        return res.redirect("/dashboard");
      }
      req.flash("success", "Bài đăng đã được xóa thành công.");
      return res.redirect("/dashboard");
    });
  });
});

app.get("/lesson/:id/edit", isLoggedIn, async (req, res) => {
  try {
    // 1. Fetch the lesson using findById
    // 2. **Explicitly select all necessary fields, including editorData**
    // 3. Use .lean() for better performance when only reading data for rendering
    const lesson = await Lesson.findById(req.params.id)
      .select(
        "_id subject title content category type editorData isProOnly createdBy" // Ensure editorData is selected!
      )
      .lean(); // Get a plain JavaScript object, not a Mongoose document

    if (!lesson) {
      req.flash("error", "Bài học không tồn tại.");
      return res.redirect("/dashboard");
    }

    // 3. Permission Check (using the fetched createdBy ID)
    // Note: Since we used .lean(), lesson.createdBy is just the ID string/ObjectId.
    if (lesson.createdBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền chỉnh sửa bài học này.");
      return res.redirect("/dashboard");
    }

    // 4. Fetch subjects (using await is often cleaner than callbacks)
    const subjects = await Subject.find({}).lean(); // Also use .lean()

    // 5. Render the template, passing the fetched data
    res.render("ManageLesson", {
      mode: "edit",
      user: req.user,        // Pass the user object (needed for header, PRO checks etc.)
      lesson: lesson,        // Pass the lesson data (now including editorData)
      subjects: subjects,    // Pass the subjects list
      message: req.flash(),  // Pass flash messages if you use connect-flash
      activePage: "dashboard", // Or determine dynamically
    });

  } catch (err) {
    console.error("Error fetching lesson for edit:", err); // Log the actual error
    req.flash("error", "Có lỗi xảy ra khi tải trang chỉnh sửa bài học.");
    res.redirect("/dashboard");
  }
});

app.post("/lesson/:id/edit", isLoggedIn, upload.none(), async (req, res) => {
  try {
    // Trước tiên, truy vấn bài học theo id
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      req.flash("error", "Bài học không tồn tại.");
      return res.redirect("/dashboard");
    }
    // Kiểm tra quyền: chỉ chủ sở hữu mới có thể chỉnh sửa
    if (lesson.createdBy.toString() !== req.user._id.toString()) {
      req.flash("error", "Bạn không có quyền chỉnh sửa bài học này.");
      return res.redirect("/dashboard");
    }

    // Lấy dữ liệu từ request body
    let { subjectId, title, content, category, type, editorData, isProOnly } =
      req.body;

    // Nếu content rỗng, sử dụng fallback từ editorData theo từng loại bài học
    if (typeof content !== "string" || content.trim() === "") {
      if (
        type === "markdown" &&
        req.body.editorData &&
        req.body.editorData.markdown
      ) {
        content = req.body.editorData.markdown;
      } else if (
        type === "video" &&
        req.body.editorData &&
        req.body.editorData.video
      ) {
        content = req.body.editorData.video;
      } else if (
        type === "quiz" &&
        req.body.editorData &&
        req.body.editorData.quiz
      ) {
        content = "Bài trắc nghiệm"; // hoặc bạn có thể định nghĩa tóm tắt riêng
      } else if (type === "essay") {
        content = req.body.editorData.essay;
      } else {
        content = "";
      }
    }

    // Cập nhật các trường của bài học
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

// Route ghi nhận hoàn thành bài học và thưởng điểm
app.post(
  "/lesson/:id/complete",
  completeLessonLimiter,
  isLoggedIn,
  async (req, res) => {
    try {
      const lessonId = req.params.id;
      const userId = req.user._id;

      const existingCompletion = await LessonCompletion.findOne({
        user: userId,
        lesson: lessonId,
      });
      if (existingCompletion) {
        return res
          .status(400)
          .json({ error: "Bài học này đã được ghi nhận hoàn thành rồi." });
      }

      const user = await User.findById(userId); // Fetch full user object
      if (!user) {
        return res.status(404).json({ error: "Không tìm thấy người dùng." });
      }

      // --- Add Points & Update Tree (using the utility) ---
      const pointsAwarded = 10; // Points for completing a lesson
      user.points += pointsAwarded; // Update total standard points

      // Call updateGrowth - it will modify the 'user' object and emit sockets
      const growthResult = await updateGrowth(
        user,
        pointsAwarded,
        req.app.locals.io, // Pass the Socket.IO instance
        `Hoàn thành bài: ${lessonId}` // Example source activity
      );

      // Save completion record
      const completion = new LessonCompletion({
        user: userId,
        lesson: lessonId,
      });
      await completion.save();

      // !! IMPORTANT: Save the user object AFTER updateGrowth has modified it !!
      await user.save();

      // --- Check for other achievements (Optional) ---
      // await checkAndAwardAchievements(user, req.app.locals.io);

      // --- Simplified HTTP Response ---
      // The front-end will primarily react to socket events for tree updates
      const responseData = {
        success: true,
        message: `Hoàn thành bài học! +${pointsAwarded} điểm.`, // Simple message
        points: user.points, // Still useful to send back total points
        pointsAwarded,
        // LeveledUp info might still be useful for triggering specific *immediate* UI changes
        // beyond the notification, but optional as sockets handle the main update.
        leveledUp: growthResult.leveledUp,
        newTreeLevel: growthResult.newLevel, // Send the final level achieved
        // achievementName: growthResult.achievementAwarded?.name, // Send if needed
      };

      res.json(responseData);
    } catch (err) {
      console.error("Error in completing lesson:", err);
      res.status(500).json({ error: "Lỗi khi ghi nhận hoàn thành bài học." });
    }
  }
);

// Route: Xem hồ sơ của một người dùng (không chỉ chính mình)
app.get("/profile/:id", async (req, res) => {
  // Make the route handler async
  try {
    const userProfile = await User.findById(req.params.id).lean(); // Use lean for performance

    if (!userProfile) {
      req.flash("error", "Hồ sơ không tồn tại.");
      return res.redirect("/dashboard"); // Or perhaps back to a user list or home
    }

    // Fetch achievements for the viewed user
    const viewedUserAchievements = await Achievement.find({
      user: userProfile._id,
    }).lean();

    // Ensure createdAt is a Date object for formatting in EJS (lean might return string)
    if (userProfile.createdAt && typeof userProfile.createdAt === "string") {
      userProfile.createdAt = new Date(userProfile.createdAt);
    }

    // Render the profile view, passing both the logged-in user and the profile being viewed
    res.render("profileView", {
      title: "Hồ sơ của " + userProfile.username, // Set dynamic title
      profile: userProfile, // The data of the user being viewed
      user: req.user || null, // The data of the currently logged-in user (or null)
      viewedUserAchievements: viewedUserAchievements, // Pass the fetched achievements
      activePage: "profileView", // Set a specific activePage if needed
    });
  } catch (err) {
    console.error("Error fetching profile view:", err);
    req.flash("error", "Lỗi khi tải hồ sơ người dùng.");
    // Redirect to a safe page, like dashboard or home
    if (req.user) {
      return res.redirect("/dashboard");
    } else {
      return res.redirect("/");
    }
  }
});

app.post("/essay/grade/:lessonId", isLoggedIn, async (req, res) => {
  try {
    // Expect JSON payload: { answers: [ "student answer 1", "student answer 2", ... ] }
    const { answers } = req.body;
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson || lesson.type !== "essay") {
      return res.status(400).json({ error: "Bài học không phải dạng tự luận" });
    }
    let essayData = [];
    if (lesson.editorData && lesson.editorData.essay) {
      essayData = JSON.parse(lesson.editorData.essay);
    }
    // Determine grading method from lesson settings; default is "simple"
    let gradingMethod =
      lesson.editorData && lesson.editorData.essayGrading
        ? lesson.editorData.essayGrading
        : "simple";

    // Only PRO users can use smart grading; if not, fallback
    if (gradingMethod === "smart" && !req.user.isPro) {
      gradingMethod = "simple";
    }

    // Assume this code is inside your /essay/grade/:lessonId route
    const scores = [];
    const diffs = [];
    const comments = [];

    if (gradingMethod === "ai") {
      // Single API call for all essay questions
      const aiResult = await gradeEssayAIAll(essayData, answers);
      for (let i = 0; i < essayData.length; i++) {
        scores.push(aiResult.scores[i] || 0);
        comments.push(aiResult.comments[i] || "");
        diffs.push(""); // No diff provided in AI mode
      }
    } else if (gradingMethod === "smart") {
      // Process each question individually using gradeEssaySmart
      for (let i = 0; i < essayData.length; i++) {
        const sampleAnswer = essayData[i].sampleAnswer || "";
        const studentAnswer = answers[i] || "";
        let score = await gradeEssaySmart(sampleAnswer, studentAnswer);
        scores.push(score);
        diffs.push(""); // No diff provided for smart mode
        comments.push(""); // Optionally, you can add further comments here if desired
      }
    } else if (gradingMethod === "absolute") {
      for (let i = 0; i < essayData.length; i++) {
        const sampleAnswer = essayData[i].sampleAnswer || "";
        const studentAnswer = answers[i] || "";
        let score = 0;
        const errorCount = levenshtein(
          sampleAnswer.toLowerCase(),
          studentAnswer.toLowerCase()
        );
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
      // "simple" mode
      for (let i = 0; i < essayData.length; i++) {
        const sampleAnswer = essayData[i].sampleAnswer || "";
        const studentAnswer = answers[i] || "";
        let score = gradeEssaySimple(sampleAnswer, studentAnswer);
        scores.push(score);
        diffs.push(getWordDiff(sampleAnswer, studentAnswer));
        comments.push("");
      }
    }

    const averageScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    res.json({ scores, averageScore, diffs, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi chấm bài tự luận" });
  }
});

app.get("/pro-images", isLoggedIn, (req, res) => {
  // You may check if req.user is PRO, then render the EJS view.
  if (req.user && req.user.isPro) {
    res.render("proImages", { user: req.user, activePage: "proImages" });
  } else {
    res.redirect("/upgrade");
  }
});

// Route: Leaderboard - hiển thị người dùng có điểm thưởng cao nhất
app.get("/leaderboard", isLoggedIn, async (req, res) => {
  try {
    const users = await User.find({})
      .select("username points")
      .sort({ points: -1 })
      .limit(100)
      .lean();
    res.render("leaderboard", {
      user: req.user,
      leaderboard: users,
      activePage: "leaderboard",
    });
  } catch (err) {
    console.error(err);
    res.send("Lỗi tải bảng xếp hạng.");
  }
});

// Route for displaying the user's tree
app.get("/my-tree", isLoggedIn, (req, res) => {
  try {
    // Data needed for the tree page
    const treeData = {
      treeLevel: req.user.treeLevel || 0,
      growthPoints: req.user.growthPoints || 0,
      pointsForCurrentLevel: getPointsForCurrentLevel(req.user.treeLevel || 0),
      pointsForNextLevel: getPointsForNextLevel(req.user.treeLevel || 0),
      username: req.user.username,
    };

    res.render("myTree", {
      title: "Cây Thành Tài Của Bạn",
      user: req.user, // Logged-in user info
      treeData: treeData, // Specific data for the tree visualization
      activePage: "myTree", // Or maybe 'dashboard'?
    });
  } catch (error) {
    console.error("Error loading My Tree page:", error);
    req.flash("error", "Không thể tải trang Cây Thành Tài.");
    res.redirect("/dashboard"); // Redirect on error
  }
});

// API login/register
// API Endpoint: Đăng ký
app.post('/api/auth/register', async (req, res) => {
    // Lấy dữ liệu từ request body (gửi từ React frontend)
    const { username, password, email } = req.body; // Chỉ lấy các trường cần thiết cho diễn đàn React

    // *** Bỏ qua kiểm tra school, class (không cần thiết cho diễn đàn React) ***
    // *** Cân nhắc bỏ qua hoặc làm tùy chọn CAPTCHA cho API nếu cần ***

    // Kiểm tra username regex (có thể giữ lại)
    const usernameRegex = /^(?=.{6,})[A-Za-z0-9]+$/; // Giảm yêu cầu xuống 6 ký tự ví dụ
    if (!username || !usernameRegex.test(username)) {
      return res.status(400).json({ message: 'Tên người dùng phải có ít nhất 6 ký tự, chỉ bao gồm chữ và số.' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }
     // Kiểm tra xem username hoặc email đã tồn tại chưa
     const existingUser = await User.findOne({ $or: [{ username: username }, { email: email }] });
     if (existingUser) {
       return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã tồn tại.' }); // 409 Conflict
     }

    // --- Tạm thời bỏ qua CAPTCHA cho API để đơn giản hóa ---
    // Nếu muốn giữ CAPTCHA, frontend React phải render Turnstile/hCaptcha
    // và gửi token lên đây để backend xác thực như trong route /register cũ.

    try {
        let newUser = new User({
            username: username,
            password: password,
            email: email // Lưu email
            // Không cần lưu class, school ở đây trừ khi bạn muốn đồng bộ
        });
        await newUser.save();

        // Không đăng nhập tự động sau khi đăng ký qua API
        res.status(201).json({ success: true, message: 'Đăng ký thành công! Vui lòng đăng nhập.' }); // 201 Created

    } catch (error) {
        console.error("Lỗi API đăng ký:", error);
        res.status(500).json({ message: 'Đăng ký không thành công, đã có lỗi xảy ra.' });
    }
});

// API Endpoint: Đăng nhập
app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', { session: false }, (err, user, info) => { // session: false cho API
        if (err) {
            console.error("API Login - Lỗi Passport authenticate:", err);
            return res.status(500).json({ message: 'Lỗi máy chủ khi đăng nhập.' });
        }
        if (!user) {
            return res.status(401).json({ message: info.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
        }

        // Xác thực thành công, KHÔNG cần req.logIn vì không dùng session cho API này

        // Cập nhật thông tin đăng nhập nếu muốn
        try {
             // Dùng findByIdAndUpdate để tránh race condition nếu user login nhiều nơi
             User.findByIdAndUpdate(user._id, {
                  lastLoginIP: req.ip,
                  lastloginUA: req.get('User-Agent') || 'Unknown User-Agent'
             }).exec(); // Không cần await nếu không cần đợi kết quả
        } catch(saveErr) {
             console.error("API Login - Lỗi cập nhật thông tin user:", saveErr);
        }

        // --- TẠO JWT ---
        const payload = {
          id: user._id,
          username: user.username,
          email: user.email,
          isPro: user.isPro,
          isAdmin: user.isAdmin,
          // avatar: user.avatar
        };
        const secretKey = process.env.JWT_SECRET;
        const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
        const token = jwt.sign(payload, secretKey, { expiresIn: expiresIn });

        // --- TRẢ VỀ TOKEN ---
        console.log(`API Login successful for user ${user.username}, returning JWT.`);
        // Gửi thông tin user cơ bản và token về cho client gọi API
        // Client này (có thể là JS trên Diễn đàn, hoặc một frontend khác) sẽ chịu trách nhiệm lưu token
        return res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công!',
            token: token, // Trả về token
            user: { // Trả về thông tin user cơ bản (không bao gồm token)
                id: user._id,
                username: user.username,
                email: user.email,
                isPro: user.isPro,
                isAdmin: user.isAdmin,
                // avatar: user.avatar
            }
        });
    })(req, res, next);
});

// API Endpoint: Đăng xuất
app.post('/api/auth/logout', (req, res, next) => { // Nếu dùng API riêng
    // Nếu route này cũng dùng session của web chính, cần req.logout
    if (req.isAuthenticated()) {
        req.logout(function(err) {
            if (err) { console.error("API Logout - Lỗi req.logout:", err); }
        });
    }
     // Hủy session trên server nếu có
     if (req.session) {
         req.session.destroy((destroyErr) => {
              if (destroyErr) { console.error("API Logout - Lỗi hủy session:", destroyErr); }
         });
     }
     // Xóa cookie session phía client của web chính
     res.clearCookie('connect.sid'); // Hoặc tên cookie session của web chính

     // Chỉ cần báo thành công, client sẽ tự xóa JWT
     return res.status(200).json({ success: true, message: 'Yêu cầu đăng xuất đã được xử lý.' });
});

// API Endpoint: Kiểm tra trạng thái đăng nhập
app.get('/api/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
        // Người dùng đã đăng nhập, gửi thông tin user
        const userInfo = {
             id: req.user._id,
             username: req.user.username,
             email: req.user.email,
             isPro: req.user.isPro,
             // Thêm các trường khác nếu cần
        };
        res.status(200).json({ isAuthenticated: true, user: userInfo });
    } else {
        // Người dùng chưa đăng nhập
        res.status(200).json({ isAuthenticated: false, user: null });
        // Hoặc trả về 401 Unauthorized nếu muốn:
        // res.status(401).json({ isAuthenticated: false, user: null });
    }
});

app.get('/app/essay-helper', (req, res) => { // Use isLoggedIn if needed
    res.render('essayAppInfo', { // We will create this EJS file
        user: req.user,
        activePage: '', // Don't highlight any main nav item
        title: 'Giới thiệu App Học Tự Luận' // Optional page title
    });
});


// --- 404 Handler (Last Route) ---
app.use((req, res, next) => {
  res
    .status(404)
    .render("404", {
      title: "Không Tìm Thấy Trang",
      user: req.user,
      activePage: "",
    }); // Assuming a 404.ejs view
});

// --- Error Handler (Place after all routes) ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res
    .status(500)
    .render("error", {
      title: "Lỗi Máy Chủ",
      message: "Đã có lỗi xảy ra",
      error: err,
      user: req.user,
      activePage: "",
    }); // Assuming an error.ejs view
});

// Start server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Server đang chạy trên cổng " + port);
});

const apiKey =
  process.env.SILICONFLOW_API_KEY ||
  process.env.SILICONFLOW_TOKEN ||
  "";

const modelName =
  process.env.SILICONFLOW_AI_TUTOR_MODEL || "nex-agi/DeepSeek-V3.1-Nex-N1";

const requestConfig = {
  temperature: 0.5,
  top_p: 0.92,
  max_tokens: 4096
};

// =====================================================================
// PAGE GUIDES — Vai trò & nhiệm vụ cụ thể cho từng trang
// =====================================================================
const pageGuides = {
  default: [
    "Vai trò: Trợ lý học tập & Chuyên gia Web toàn diện.",
    "Nhiệm vụ: Tóm tắt, giải thích kiến thức web (HTML/CSS/JS/Backend/DB/Deploy), chỉ dẫn thao tác.",
    "Khi user hỏi về lập trình web: Trả lời cặn kẽ với code ví dụ, giải thích từng dòng, so sánh ưu/nhược điểm các cách tiếp cận.",
    "Luôn cung cấp code mẫu chạy được ngay khi phù hợp."
  ].join(" "),
  "lesson-detail": [
    "Vai trò: Gia sư Socratic & Chuyên gia Web.",
    "Nhiệm vụ: Gợi ý từng bước, tạo mini-quiz kiểm tra hiểu bài.",
    "Nếu bài học liên quan đến web: Cung cấp ví dụ code thực tế, giải thích nguyên lý hoạt động, liên hệ lý thuyết với dự án thực."
  ].join(" "),
  "lesson-studio": [
    "Vai trò: Chuyên gia Instructional Design & Web Content.",
    "Nhiệm vụ: Góp ý cấu trúc bài giảng, tinh chỉnh nội dung kỹ thuật web, tạo checklist trước publish.",
    "Có thể gợi ý thêm code demo, interactive quiz, hoặc cải thiện luồng nội dung bài học web."
  ].join(" "),
  garden: "Vai trò: Quản gia nông trại. Nhiệm vụ: Hướng dẫn quản lý tài nguyên, gợi ý tối ưu cày cuốc đổi thưởng.",
  qa: [
    "Vai trò: Mentor học thuật & Senior Web Developer.",
    "Nhiệm vụ: Phân tích câu hỏi, chia nhỏ bài giải thành bước dễ hiểu.",
    "Nếu câu hỏi về web: Cung cấp code giải mẫu, debug chi tiết, giải thích best practice."
  ].join(" "),
  guild: "Vai trò: Cố vấn bang hội. Nhiệm vụ: Giải thích cơ chế quyên góp, buff, và chiến lược leo rank tập thể."
};

// =====================================================================
// PLATFORM KNOWLEDGE — Kiến thức nền tảng + Web chuyên sâu
// Tải theo page để tiết kiệm token, nhưng mỗi page đều có web knowledge
// =====================================================================

// --- Khối kiến thức Web toàn diện (được inject vào MỌI trang) ---
const WEB_KNOWLEDGE_CORE = `
### KIẾN THỨC WEB TOÀN DIỆN (Tham chiếu khi user hỏi về lập trình web):

**I. HTML (HyperText Markup Language)**
- Semantic tags: <header>, <nav>, <main>, <section>, <article>, <aside>, <footer>, <figure>, <figcaption>, <details>, <summary>, <dialog>, <template>, <slot>.
- Form nâng cao: <input type="date|range|color|file|search">, <datalist>, <fieldset>, <legend>, <output>, pattern/required/min/max, FormData API.
- Media: <picture> + <source> (responsive images, srcset, sizes), <video>/<audio> (controls, preload, poster), <track> cho subtitle.
- SEO & Accessibility: meta tags (title, description, og:*, twitter:*), ARIA roles (role, aria-label, aria-live, aria-expanded), tabindex, skip-nav link, alt text, heading hierarchy (h1-h6).
- HTML5 APIs: Drag & Drop, Geolocation, Web Storage (localStorage/sessionStorage), History API, Intersection Observer, MutationObserver, ResizeObserver.

**II. CSS (Cascading Style Sheets)**
- Selectors: combinators (>, +, ~), pseudo-classes (:nth-child, :not, :has, :is, :where, :focus-visible, :focus-within), pseudo-elements (::before, ::after, ::placeholder, ::selection, ::marker).
- Box Model: content-box vs border-box, margin collapse, outline vs border.
- Layout: Flexbox (flex-grow/shrink/basis, align-items, justify-content, gap, flex-wrap, order), Grid (grid-template-columns/rows, grid-area, repeat(), minmax(), auto-fill/auto-fit, subgrid).
- Responsive: Media queries (@media), Container queries (@container), clamp(), min(), max(), dvh/svh/lvh units, aspect-ratio.
- Animations: transition (property, duration, timing-function, delay), @keyframes, animation shorthand, will-change, transform (translate/rotate/scale/skew), CSS Houdini.
- Modern CSS: Custom Properties (--var), :root, cascade layers (@layer), @scope, nesting, color-mix(), oklch(), light-dark(), @property, scroll-snap, scroll-timeline, view-transitions.
- Architecture: BEM naming, OOCSS, SMACSS, CSS Modules, CSS-in-JS patterns, Utility-first (Tailwind approach).

**III. JavaScript (ES6+ đến ES2024)**
- Core: let/const/var scoping, hoisting, temporal dead zone, destructuring, spread/rest, template literals, optional chaining (?.), nullish coalescing (??), logical assignment (&&=, ||=, ??=).
- Functions: arrow functions (this binding), closures, IIFE, higher-order functions, currying, memoization, generators (function*), async generators.
- OOP: class syntax, extends, super, static, private fields (#field), getters/setters, Symbol, Proxy, Reflect.
- Async: Callbacks → Promises → async/await, Promise.all/allSettled/any/race, AbortController, queueMicrotask, top-level await.
- DOM: querySelector/All, createElement, addEventListener (capture/bubble/passive), event delegation, DocumentFragment, Shadow DOM, Custom Elements (Web Components), template literals for HTML.
- Data structures: Map, Set, WeakMap, WeakSet, Typed Arrays, ArrayBuffer, SharedArrayBuffer, Atomics.
- Modules: import/export, dynamic import(), import.meta, module vs nomodule, bare specifiers, Import Maps.
- Error handling: try/catch/finally, custom Error classes, error boundaries concept, AggregateError.
- Modern APIs: Fetch (headers, body, AbortController), Streams API (ReadableStream, WritableStream, TransformStream), Web Workers, Service Workers, SharedWorker, Broadcast Channel, WebSocket, Server-Sent Events (SSE), WebRTC basics, Clipboard API, File API, IndexedDB, Cache API, Payment Request API, Web Animations API, Performance API (mark, measure), Navigator.sendBeacon.

**IV. TypeScript**
- Types cơ bản: string, number, boolean, array, tuple, enum, any, unknown, void, never, null, undefined.
- Nâng cao: union/intersection types, literal types, type guards (typeof, instanceof, in, is), mapped types, conditional types, template literal types, infer keyword.
- Generics: <T>, constraints (extends), default types, generic functions/classes/interfaces.
- Utility types: Partial, Required, Readonly, Pick, Omit, Record, Exclude, Extract, NonNullable, ReturnType, Parameters, Awaited.
- Declaration files (.d.ts), tsconfig.json options, strict mode, module resolution.

**V. Frontend Frameworks & Libraries**
- React: JSX, components (function/class), hooks (useState, useEffect, useContext, useReducer, useMemo, useCallback, useRef, useId, useSyncExternalStore, useTransition, useDeferredValue), React.memo, forwardRef, Suspense, Error Boundaries, Portals, Context API, React Server Components, Server Actions.
- Vue.js: Template syntax, Composition API (ref, reactive, computed, watch, watchEffect), Options API, v-model, v-if/v-for/v-show, slots, provide/inject, <script setup>, Pinia (store), Vue Router, Teleport, Transition.
- Angular: Components, Modules, Services, DI, Signals, RxJS, directives, pipes, template syntax, Angular Router, Forms (template-driven & reactive), HttpClient, Zone.js.
- Svelte/SvelteKit: Reactive declarations ($:), stores, actions, transitions, SvelteKit routing & load functions.
- State Management: Redux/Toolkit, Zustand, Jotai, Recoil, MobX, Pinia, Vuex, NgRx, Signals pattern.

**VI. Backend & Server**
- Node.js: Event loop (phases: timers, pending callbacks, poll, check, close), non-blocking I/O, streams (Readable/Writable/Duplex/Transform), Buffer, process (env, argv, exit), child_process (exec, spawn, fork), cluster module, worker_threads.
- Express.js: app.get/post/put/delete, middleware chain (next()), Router, error-handling middleware, static files, template engines (EJS, Pug, Handlebars), body-parser, cookie-parser, express-session, helmet, cors, rate-limit, compression.
- Authentication: Session-based (express-session + cookies), Token-based (JWT: header.payload.signature, access/refresh tokens), OAuth 2.0 flows (Authorization Code, PKCE, Client Credentials), Passport.js strategies, bcrypt/argon2 password hashing, CSRF protection (csurf, SameSite cookies), 2FA (TOTP).
- API Design: REST (resources, verbs, status codes 2xx/3xx/4xx/5xx, HATEOAS), GraphQL (schema, resolvers, queries, mutations, subscriptions, DataLoader), tRPC, WebSocket protocols, SSE.
- Frameworks khác: Next.js (App Router, Server Components, API Routes, ISR, SSG, SSR, Middleware), Nuxt.js, NestJS (decorators, modules, providers, guards, interceptors, pipes), Fastify, Hono, Deno Fresh, Bun.

**VII. Database**
- MongoDB: Collections/Documents, CRUD (insertOne/Many, find, updateOne/Many, deleteOne/Many), Aggregation Pipeline (match, group, project, lookup, unwind, sort), Indexes (compound, text, TTL, unique, partial), Mongoose (Schema, Model, virtuals, middleware/hooks, populate, lean), Atlas, Change Streams, Transactions.
- SQL: SELECT/INSERT/UPDATE/DELETE, JOINs (INNER/LEFT/RIGHT/FULL/CROSS), GROUP BY/HAVING, subqueries, CTEs (WITH), window functions (ROW_NUMBER, RANK, LAG/LEAD), transactions (ACID), normalization (1NF-3NF/BCNF), indexes (B-tree, hash).
- PostgreSQL: JSONB, Full-text search, LISTEN/NOTIFY, extensions (PostGIS, pgvector), Prisma/Sequelize/Knex ORMs.
- Redis: Strings, Hashes, Lists, Sets, Sorted Sets, Pub/Sub, Streams, caching patterns (cache-aside, write-through, write-behind), TTL, Lua scripting.
- Khác: Firebase (Firestore, Realtime DB, Auth, Cloud Functions), Supabase, PlanetScale, Turso (libSQL).

**VIII. DevOps & Deployment**
- Git: add, commit, push, pull, branch, merge, rebase, cherry-pick, stash, bisect, reflog, gitflow/trunk-based, conventional commits, .gitignore.
- CI/CD: GitHub Actions (workflow YAML, jobs, steps, secrets, matrix), GitLab CI, Jenkins, Vercel/Netlify auto-deploy.
- Docker: Dockerfile (FROM, RUN, COPY, CMD, ENTRYPOINT, multi-stage builds), docker-compose, volumes, networks, .dockerignore.
- Cloud: Vercel, Netlify, Railway, Render, Fly.io, AWS (EC2, S3, Lambda, CloudFront, RDS, DynamoDB), GCP (Cloud Run, Cloud Functions), Azure. Serverless functions, Edge functions.
- Monitoring: logging (Winston, Pino, Morgan), error tracking (Sentry), APM, uptime monitoring, health checks.

**IX. Build Tools & DX**
- Bundlers: Webpack (loaders, plugins, code splitting, tree shaking, HMR), Vite (esbuild + Rollup, HMR, SSR), Rollup, esbuild, Turbopack, Parcel.
- Package Managers: npm, yarn, pnpm, workspaces, lock files, semantic versioning (^, ~, major.minor.patch).
- Linting/Formatting: ESLint (rules, extends, plugins, flat config), Prettier, Stylelint, Husky + lint-staged.
- Testing: Jest, Vitest, Mocha/Chai, Testing Library (@testing-library/react), Cypress, Playwright, Puppeteer, unit/integration/e2e tests, TDD, BDD, code coverage (Istanbul/c8).

**X. Performance & Security**
- Performance: Lazy loading (images, routes, components), code splitting, tree shaking, minification, compression (gzip/brotli), CDN, HTTP/2 & HTTP/3, caching (Cache-Control, ETag, Service Worker), Critical CSS, font loading (font-display: swap), preload/prefetch/preconnect, Web Vitals (LCP, FID/INP, CLS, TTFB, FCP), Lighthouse, bundle analysis.
- Security: XSS (input sanitization, CSP, DOMPurify, HttpOnly cookies), CSRF (tokens, SameSite), SQL/NoSQL injection (parameterized queries, ODM validation), CORS, rate limiting, Helmet.js headers, HTTPS/TLS, OWASP Top 10, dependency auditing (npm audit), Subresource Integrity (SRI), Content Security Policy.

**XI. Architecture & Patterns**
- Design Patterns: MVC, MVVM, Singleton, Observer, Factory, Strategy, Middleware chain, Repository pattern, Dependency Injection, Event-driven architecture.
- Frontend Architecture: Component-based, Atomic Design, Feature-sliced design, Micro-frontends, Module Federation.
- API patterns: REST maturity levels, API versioning, pagination (offset/cursor), filtering, sorting, rate limiting, API Gateway, BFF (Backend for Frontend).
- Real-time: WebSocket, Socket.IO (rooms, namespaces, acknowledgments), SSE, Long polling, WebRTC.
`.trim();

const platformKnowledge = {
  default: [
    "Hệ thống Học Tập Thủ Đức có: Dashboard (tổng quan tiến trình), Khóa học (courses/units/lessons), Flashcard, Game Nông trại (Garden), Bang hội (Tông Môn), Hỏi đáp (QA), Lesson Studio, và AI Tutor.",
    "Stack công nghệ: Node.js + Express.js, MongoDB + Mongoose, EJS templates, Socket.IO, Passport.js (OAuth + Local), Cloudinary (media), Helmet + CORS + Rate Limiting."
  ].join(" "),
  "lesson-detail": [
    "Trang bài học có: Reading workspace với nội dung Markdown/HTML, quiz tương tác (trắc nghiệm, điền khuyết, tự luận), ghi chú cá nhân, highlight text, flashcard checkpoint, AI Tutor sidebar.",
    "Hỗ trợ LaTeX cho công thức Toán/Lý/Hóa, code highlighting cho bài học lập trình, responsive reading mode."
  ].join(" "),
  "lesson-studio": [
    "Lesson Studio: Soạn lesson/course/unit với block editor (text, heading, image, video, quiz, code, embed).",
    "Chế độ draft/publish, preview, metrics (word count, read time, media count), snapshot system cho AI rà soát."
  ].join(" "),
  garden: "Nông trại học tập (Garden): Tài nguyên nước/phân bón/vàng, trồng cây theo ô đất, shop mua hạt giống, nhiệm vụ hàng ngày/tuần. XP và vàng liên thông với khóa học. Inventory system, batch action sync, optimistic UI.",
  qa: [
    "Khu Hỏi đáp: Đặt câu hỏi với tag/category, treo thưởng Vàng (bounty), trả lời với Markdown + LaTeX + code blocks.",
    "Upvote/downvote, best answer, contributor leaderboard, AI-assisted question improvement."
  ].join(" "),
  guild: "Tông Môn/Bang hội: Cây Linh Thú (guild tree) với các nhánh buff, quyên góp tài nguyên (nước/phân/vàng/dưa hấu/ớt), buff sức mạnh toàn bang, mục tiêu tuần, leaderboard giữa các bang."
};

// =====================================================================
// SUBJECT KNOWLEDGE MODULES — Kiến thức theo môn học THPT
// =====================================================================
const SUBJECT_KNOWLEDGE = {
  math: `**TOÁN HỌC**: Đại số (phương trình, bất phương trình, hệ PT, logarit, mũ, lượng giác, số phức, tổ hợp-xác suất, dãy số, giới hạn, đạo hàm, nguyên hàm-tích phân). Hình học (vector, tọa độ phẳng/không gian, đường thẳng, mặt phẳng, hình khối, thiết diện). Giải tích (hàm số, khảo sát, cực trị, GTLN/GTNN, tiệm cận, diện tích, thể tích tròn xoay). Luôn trình bày bằng LaTeX.`,
  physics: `**VẬT LÝ**: Cơ học (động học, động lực học, năng lượng, dao động, sóng cơ). Điện từ (điện trường, từ trường, cảm ứng điện từ, mạch điện xoay chiều RLC, sóng điện từ). Quang học (phản xạ, khúc xạ, giao thoa, tán sắc, quang phổ). Vật lý hiện đại (lượng tử ánh sáng, mẫu nguyên tử Bohr, hạt nhân nguyên tử, phóng xạ, phản ứng hạt nhân E=mc²). Dùng LaTeX cho công thức.`,
  chemistry: `**HÓA HỌC**: Hóa đại cương (cấu tạo nguyên tử, bảng tuần hoàn, liên kết hóa học, phản ứng oxi hóa-khử, tốc độ phản ứng, cân bằng hóa học, pH, điện phân). Hóa vô cơ (kim loại, phi kim, hợp chất). Hóa hữu cơ (hydrocarbon, ancol, phenol, aldehyde, acid carboxylic, ester, lipid, carbohydrate, amin, amino acid, protein, polymer). Phương pháp: bảo toàn khối lượng, bảo toàn electron, bảo toàn nguyên tố, quy đổi.`,
  biology: `**SINH HỌC**: Sinh học tế bào (cấu trúc tế bào, vận chuyển, enzyme, hô hấp, quang hợp, phân bào). Di truyền học (Mendel, liên kết gen, hoán vị, di truyền giới tính, đột biến, di truyền quần thể Hardy-Weinberg). Tiến hóa (chọn lọc tự nhiên, loài, cách li). Sinh thái (quần thể, quần xã, hệ sinh thái, chuỗi thức ăn, chu trình vật chất).`,
  literature: `**NGỮ VĂN**: Văn học trung đại VN (Nguyễn Trãi, Nguyễn Du, Hồ Xuân Hương). Văn học hiện đại (Xuân Diệu, Huy Cận, Tố Hữu, Nam Cao, Nguyễn Tuân, Vũ Trọng Phụng, Kim Lân, Nguyễn Minh Châu). Lý luận văn học (tác phẩm tự sự, trữ tình, kịch; phong cách ngôn ngữ; biện pháp tu từ). Nghị luận xã hội + văn học, phân tích + so sánh + bình luận.`,
  history: `**LỊCH SỬ**: VN cận đại (phong trào yêu nước, Đảng CSVN, CMT8, kháng chiến chống Pháp-Mỹ, Điện Biên Phủ, chiến dịch HCM, đổi mới). Thế giới (CM công nghiệp, CTTG I-II, Chiến tranh lạnh, phong trào GPDT, toàn cầu hóa, ASEAN, EU, UN).`,
  english: `**TIẾNG ANH**: Grammar (tenses, conditionals, passive, reported speech, relative clauses, articles, prepositions, modals, gerund/infinitive, comparatives/superlatives). Vocabulary (word formation, collocations, phrasal verbs, idioms). Reading (skimming, scanning, inference). Writing (essay structure, IELTS task 1-2, email, letter). Speaking (pronunciation, intonation, fluency). Listening comprehension strategies.`,
  it: `**TIN HỌC**: Thuật toán (sắp xếp, tìm kiếm, đệ quy, quy hoạch động, greedy, divide & conquer, backtracking, BFS/DFS, Dijkstra). Cấu trúc dữ liệu (array, linked list, stack, queue, tree, graph, hash table, heap, trie). Độ phức tạp (Big-O: O(1), O(log n), O(n), O(n log n), O(n²)). Lập trình C/C++/Python cơ bản. Cơ sở dữ liệu quan hệ. Mạng máy tính (TCP/IP, HTTP, DNS, DHCP).`
};

const SUBJECT_PATTERNS = {
  math: /\b(toán|phương trình|bất phương trình|đạo hàm|tích phân|nguyên hàm|logarit|lượng giác|sin|cos|tan|cot|hàm số|cực trị|tiệm cận|giới hạn|xác suất|tổ hợp|chỉnh hợp|ma trận|vector|tọa độ|hình học|diện tích|thể tích|số phức|dãy số|cấp số|tam giác|đường tròn|elip|parabol|hyperbol|math)\b/i,
  physics: /\b(vật lý|physics|lực|gia tốc|vận tốc|động năng|thế năng|dao động|sóng|điện trường|từ trường|mạch điện|tụ điện|cuộn cảm|RLC|quang học|lượng tử|hạt nhân|phóng xạ|newton|coulomb|faraday|ampere|volt|ohm|watt|joule|hertz|công suất|điện áp|cường độ)\b/i,
  chemistry: /\b(hóa học|chemistry|nguyên tử|phân tử|ion|mol|phản ứng|oxi hóa|khử|axit|bazơ|muối|pH|dung dịch|điện phân|kim loại|phi kim|hydrocarbon|ancol|phenol|aldehyde|ester|amino|protein|polymer|este|carboxylic|liên kết|cấu hình electron|bảng tuần hoàn)\b/i,
  biology: /\b(sinh học|biology|tế bào|ADN|ARN|DNA|RNA|gen|nhiễm sắc thể|di truyền|mendel|đột biến|tiến hóa|quần thể|sinh thái|quang hợp|hô hấp|enzyme|phân bào|giảm phân|nguyên phân|protein|ribosome|ti thể|lục lạp)\b/i,
  literature: /\b(văn học|ngữ văn|literature|tác phẩm|nhân vật|nghệ thuật|tu từ|ẩn dụ|hoán dụ|nhân hóa|so sánh|điệp ngữ|thơ|truyện ngắn|tiểu thuyết|nghị luận|phân tích|bình luận|cảm nhận|tác giả|Nguyễn Du|Nam Cao|Xuân Diệu|Tố Hữu|Hồ Xuân Hương)\b/i,
  history: /\b(lịch sử|history|cách mạng|kháng chiến|chiến tranh|chiến dịch|phong trào|khởi nghĩa|hiệp định|thời kỳ|triều đại|thế kỷ|Điện Biên|Genève|Paris|đổi mới|ASEAN|toàn cầu hóa|chiến tranh lạnh)\b/i,
  english: /\b(tiếng anh|english|grammar|tense|conditional|passive|reported speech|vocabulary|IELTS|TOEFL|TOEIC|reading comprehension|writing|speaking|listening|pronunc|irregular verb|phrasal verb|preposition|article|relative clause)\b/i,
  it: /\b(tin học|informatics|thuật toán|algorithm|cấu trúc dữ liệu|data structure|big-?o|complexity|đệ quy|recursion|quy hoạch động|dynamic programming|sắp xếp|sorting|tìm kiếm|searching|stack|queue|tree|graph|linked list|hash|C\+\+|python|pascal)\b/i
};

function detectSubjects(text) {
  const subjects = [];
  for (const [key, pattern] of Object.entries(SUBJECT_PATTERNS)) {
    if (pattern.test(text)) subjects.push(key);
  }
  return subjects;
}

function getSubjectKnowledge(prompt, contextSummary) {
  const combined = `${prompt} ${contextSummary || ""}`;
  const detected = detectSubjects(combined);
  if (detected.length === 0) return "";
  return detected
    .map(s => SUBJECT_KNOWLEDGE[s])
    .filter(Boolean)
    .join("\n\n");
}

function cleanText(value, limit = 5000) {
  if (value === null || value === undefined) return "";
  const normalized = String(value)
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function stringifyMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  try {
    return cleanText(JSON.stringify(metadata, null, 2), 3200);
  } catch (error) {
    return "";
  }
}

function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  return history
    .slice(-10)
    .map((item) => {
      const role = item?.role === "assistant" ? "AI" : "User";
      const content = cleanText(item?.content, 900);
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// HÀM MỚI: Tách biệt System Role (Quy tắc) và User Role (Ngữ cảnh + Câu hỏi)
function buildMessages({
  pageType,
  pageTitle,
  prompt,
  selection,
  contextSummary,
  metadata,
  user,
  history
}) {
  const safePageType = pageGuides[pageType] ? pageType : "default";

  // Phát hiện câu hỏi liên quan đến web để inject knowledge
  const webKeywords = /\b(html|css|javascript|js|typescript|ts|react|vue|angular|svelte|node|express|next\.?js|nuxt|mongodb|mongoose|sql|postgres|redis|firebase|api|rest|graphql|websocket|docker|git|webpack|vite|npm|deploy|hosting|dom|fetch|async|await|promise|hook|component|router|middleware|database|server|backend|frontend|fullstack|responsive|flexbox|grid|animation|tailwind|bootstrap|sass|less|json|xml|http|https|cors|jwt|oauth|session|cookie|webpack|babel|eslint|prettier|testing|jest|cypress|security|xss|csrf|ssr|ssg|spa|pwa|web\s*worker|service\s*worker|socket\.?io|ejs|pug|handlebars|mvc|orm|odm|crud|regex|closure|prototype|class|module|import|export|package|dependency|framework|library|template|variable|function|loop|array|object|string|number|boolean|map|set|filter|reduce|sort|event|listener|selector|query|mutation|schema|model|collection|index|aggregate|populate|virtual|ref|reactive|computed|watch|store|state|props|slot|directive|pipe|guard|interceptor|decorator|signal|observable|stream|buffer|cluster|child.process|spawn|exec|fork)\b/i;
  const isWebRelated = webKeywords.test(prompt) || 
    ["lesson-detail", "lesson-studio", "qa", "default"].includes(safePageType);

  // Phát hiện môn học từ prompt + context
  const subjectKnowledge = getSubjectKnowledge(prompt, contextSummary);

  // 1. SYSTEM PROMPT: Định hình nhân vật + Kiến thức nền
  const systemInstructions = [
    "Bạn là AI Tutor của Học Tập Thủ Đức — trợ lý học tập đa năng bậc nhất, thông thạo mọi môn học THPT và lập trình web chuyên sâu.",
    "Luôn giao tiếp bằng Tiếng Việt thân thiện, dễ hiểu, phù hợp học sinh THPT và sinh viên IT.",
    "",
    "### QUY TẮC PHẢN HỒI:",
    "- Cấu trúc: 1 dòng mở bài → Nội dung chính (3-7 ý, có ví dụ/code) → Gợi ý bước tiếp theo.",
    "- Format: Dùng Markdown (## tiêu đề, **in đậm**, `inline code`, ```code block```, bullet list, bảng so sánh).",
    "- Công thức: Trình bày Toán/Lý/Hóa bằng LaTeX ($...$ hoặc $$...$$).",
    "- Code: Khi user hỏi về lập trình, LUÔN cung cấp code mẫu chạy được, có comment giải thích.",
    "- Giải bài: Khi user gửi bài tập, giải từng bước rõ ràng, giải thích tại sao chọn phương pháp đó.",
    "- So sánh: Khi có nhiều cách, trình bày bảng so sánh ưu/nhược.",
    "- Chiều sâu: Giải thích nguyên lý (WHY), không chỉ cách làm (HOW).",
    "- Trung thực: Không bịa đặt, nếu không chắc thì nói rõ.",
    "- Cuối mỗi phản hồi, LUÔN thêm mục '---\\n💡 **Gợi ý hỏi tiếp:**' với 3 câu hỏi follow-up ngắn dạng bullet, giúp user đào sâu hơn.",
    "",
    "### VAI TRÒ & NHIỆM VỤ HIỆN TẠI:",
    pageGuides[safePageType],
    "",
    "### THÔNG TIN HỆ THỐNG:",
    platformKnowledge[safePageType],
    // Inject web knowledge khi câu hỏi liên quan
    ...(isWebRelated ? ["", WEB_KNOWLEDGE_CORE] : []),
    // Inject subject knowledge khi phát hiện môn học
    ...(subjectKnowledge ? ["", "### KIẾN THỨC MÔN HỌC LIÊN QUAN:", subjectKnowledge] : [])
  ].join("\n");

  // 2. USER CONTEXT: Chứa dữ liệu thực tế
  const userInfo = user
    ? `Học viên: ${cleanText(user.username || "Ẩn danh", 60)} | Level ${Math.max(0, Number(user.level) || 0)} | Vai trò: ${user.isAdmin ? "Admin" : user.isTeacher ? "Teacher" : "Student"}`
    : "Người dùng: Khách (Chưa đăng nhập)";

  const userContent = [
    `[NGỮ CẢNH HỆ THỐNG]`,
    userInfo,
    pageTitle ? `- Tiêu đề trang: ${cleanText(pageTitle, 180)}` : "",
    selection ? `- Đoạn văn bản đang bôi đen:\n"${cleanText(selection, 1800)}"` : "",
    contextSummary ? `- Tóm tắt nội dung trang:\n${cleanText(contextSummary, 3400)}` : "",
    metadata ? `- Metadata bổ sung: ${stringifyMetadata(metadata)}` : "",
    history && history.length > 0 ? `\n[LỊCH SỬ TRÒ CHUYỆN GẦN ĐÂY]\n${formatHistory(history)}` : "",
    `\n[YÊU CẦU MỚI TỪ NGƯỜI DÙNG]\n${cleanText(prompt, 1400)}`
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: systemInstructions },
    { role: "user", content: userContent }
  ];
}

function extractReplyFromChoices(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractDeltaText(payload) {
  const deltaContent = payload?.choices?.[0]?.delta?.content;
  if (typeof deltaContent === "string") return deltaContent;
  if (Array.isArray(deltaContent)) {
    return deltaContent
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}

// CẬP NHẬT: Nhận mảng messagesPayload thay vì finalPrompt
async function requestTutorReply(messagesPayload) {
  const response = await fetch("https://api.siliconflow.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messagesPayload,
      ...requestConfig
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const remoteError =
      payload?.error?.message ||
      payload?.message ||
      "SiliconFlow không trả về phản hồi hợp lệ.";
    const error = new Error(remoteError);
    error.statusCode = response.status;
    throw error;
  }

  return cleanText(extractReplyFromChoices(payload), 7000);
}

function sendStreamPacket(res, packet) {
  res.write(`data: ${JSON.stringify(packet)}\n\n`);
}

function setSseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

// CẬP NHẬT: Nhận mảng messagesPayload
async function streamTutorReply(messagesPayload, res) {
  const response = await fetch("https://api.siliconflow.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messagesPayload,
      stream: true,
      ...requestConfig
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const remoteError =
      payload?.error?.message ||
      payload?.message ||
      "SiliconFlow không thể stream phản hồi lúc này.";
    const error = new Error(remoteError);
    error.statusCode = response.status;
    throw error;
  }

  if (!response.body) {
    const fallbackReply = await requestTutorReply(messagesPayload);
    sendStreamPacket(res, { type: "delta", delta: fallbackReply });
    sendStreamPacket(res, { type: "done", reply: fallbackReply });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullReply = "";

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");

      const payloadText = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");

      if (!payloadText) continue;
      if (payloadText === "[DONE]") {
        sendStreamPacket(res, { type: "done", reply: fullReply });
        return;
      }

      try {
        const payload = JSON.parse(payloadText);
        const delta = extractDeltaText(payload);
        if (!delta) continue;
        fullReply += delta;
        sendStreamPacket(res, { type: "delta", delta });
      } catch (error) {
        // Skip malformed partial packets from upstream.
      }
    }
  }

  sendStreamPacket(res, { type: "done", reply: fullReply });
}

function buildPromptFromRequest(req) {
  const { prompt, pageType, pageTitle, selection, contextSummary, metadata, history } =
    req.body || {};
  const safePrompt = cleanText(prompt, 1400);

  if (!safePrompt) {
    const error = new Error("Bạn chưa nhập câu hỏi cho AI Tutor.");
    error.statusCode = 400;
    throw error;
  }

  if (!apiKey) {
    const error = new Error("AI Tutor chưa được cấu hình khóa API trên server.");
    error.statusCode = 503;
    throw error;
  }

  return buildMessages({
    pageType: cleanText(pageType, 80) || "default",
    pageTitle,
    prompt: safePrompt,
    selection,
    contextSummary,
    metadata,
    history,
    user: req.user || null
  });
}

function resolveErrorStatus(error) {
  return Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
    ? Number(error.statusCode)
    : 500;
}

function resolvePublicErrorMessage(error, statusCode) {
  return statusCode >= 500
    ? "AI Tutor đang hơi quá tải. Bạn thử lại sau ít phút nhé."
    : cleanText(error?.message, 260) || "Không thể lấy phản hồi từ AI Tutor.";
}

// CONTROLLERS
exports.askTutor = async (req, res) => {
  try {
    const messagesPayload = buildPromptFromRequest(req);
    const reply = await requestTutorReply(messagesPayload);

    if (!reply) {
      return res.status(502).json({
        success: false,
        error: "AI Tutor chưa tạo được phản hồi phù hợp."
      });
    }

    return res.json({
      success: true,
      reply
    });
  } catch (error) {
    console.error("AI Tutor error:", error);
    const statusCode = resolveErrorStatus(error);
    return res.status(statusCode).json({
      success: false,
      error: resolvePublicErrorMessage(error, statusCode)
    });
  }
};

exports.streamTutor = async (req, res) => {
  try {
    const messagesPayload = buildPromptFromRequest(req);
    setSseHeaders(res);
    sendStreamPacket(res, { type: "ready", model: modelName });
    
    await streamTutorReply(messagesPayload, res);
    res.end();
  } catch (error) {
    console.error("AI Tutor stream error:", error);
    const statusCode = resolveErrorStatus(error);

    if (!res.headersSent) {
      return res.status(statusCode).json({
        success: false,
        error: resolvePublicErrorMessage(error, statusCode)
      });
    }

    sendStreamPacket(res, {
      type: "error",
      error: resolvePublicErrorMessage(error, statusCode)
    });
    res.end();
  }
};
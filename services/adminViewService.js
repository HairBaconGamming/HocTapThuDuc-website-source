const User = require('../models/User');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');
const Subject = require('../models/Subject');
const News = require('../models/News');
const VisitStats = require('../models/VisitStats');
const UserActivityLog = require('../models/UserActivityLog');
const Question = require('../models/Question');
const Comment = require('../models/Comment');
const Guild = require('../models/Guild');
const GuildApplication = require('../models/GuildApplication');
const GuildAuditLog = require('../models/GuildAuditLog');
const ProImage = require('../models/ProImage');
const LessonRewardEvent = require('../models/LessonRewardEvent');
const GuildWeeklyStanding = require('../models/GuildWeeklyStanding');
const BanEntry = require('../models/BanEntry');
const AdminActionLog = require('../models/AdminActionLog');
const { LiveSession, LIVE_SESSION_STATUSES } = require('../models/LiveSession');
const { AchievementType, UserAchievement } = require('../models/Achievement');
const {
    escapeRegex,
    parseListQuery,
    buildDateRange,
    buildPagination,
    buildAdminUrl
} = require('../utils/adminHelpers');

const PAGE_CONFIG = {
    overview: { key: 'overview', label: 'Tổng quan vận hành', path: '/admin/overview', mainPartial: 'admin/partials/pages/overview', asidePartial: 'admin/partials/asides/cards' },
    users: { key: 'users', label: 'Người dùng', path: '/admin/users', mainPartial: 'admin/partials/pages/users', asidePartial: 'admin/partials/asides/users' },
    courses: { key: 'courses', label: 'Khóa học', path: '/admin/content/courses', mainPartial: 'admin/partials/pages/courses', asidePartial: 'admin/partials/asides/cards' },
    subjects: { key: 'subjects', label: 'Môn học', path: '/admin/content/subjects', mainPartial: 'admin/partials/pages/subjects', asidePartial: 'admin/partials/asides/subjects' },
    lessons: { key: 'lessons', label: 'Bài học', path: '/admin/content/lessons', mainPartial: 'admin/partials/pages/lessons', asidePartial: 'admin/partials/asides/cards' },
    liveSessions: { key: 'liveSessions', label: 'Phòng live', path: '/admin/content/lives', mainPartial: 'admin/partials/pages/live-sessions', asidePartial: 'admin/partials/asides/live-sessions' },
    news: { key: 'news', label: 'Tin tức', path: '/admin/content/news', mainPartial: 'admin/partials/pages/news', asidePartial: 'admin/partials/asides/news' },
    proImages: { key: 'proImages', label: 'Kho PRO Images', path: '/admin/content/pro-images', mainPartial: 'admin/partials/pages/pro-images', asidePartial: 'admin/partials/asides/cards' },
    questions: { key: 'questions', label: 'Q&A', path: '/admin/community/questions', mainPartial: 'admin/partials/pages/questions', asidePartial: 'admin/partials/asides/questions' },
    comments: { key: 'comments', label: 'Bình luận', path: '/admin/community/comments', mainPartial: 'admin/partials/pages/comments', asidePartial: 'admin/partials/asides/comments' },
    guilds: { key: 'guilds', label: 'Bang hội', path: '/admin/community/guilds', mainPartial: 'admin/partials/pages/guilds', asidePartial: 'admin/partials/asides/guilds' },
    guildApplications: { key: 'guildApplications', label: 'Đơn bang hội', path: '/admin/community/guild-applications', mainPartial: 'admin/partials/pages/guild-applications', asidePartial: 'admin/partials/asides/guild-applications' },
    achievements: { key: 'achievements', label: 'Achievement types', path: '/admin/gamification/achievements', mainPartial: 'admin/partials/pages/achievements', asidePartial: 'admin/partials/asides/achievements' },
    rewards: { key: 'rewards', label: 'Lesson rewards', path: '/admin/gamification/rewards', mainPartial: 'admin/partials/pages/rewards', asidePartial: 'admin/partials/asides/cards' },
    standings: { key: 'standings', label: 'Bảng xếp hạng', path: '/admin/gamification/standings', mainPartial: 'admin/partials/pages/standings', asidePartial: 'admin/partials/asides/cards' },
    traffic: { key: 'traffic', label: 'Traffic & study', path: '/admin/system/traffic', mainPartial: 'admin/partials/pages/traffic', asidePartial: 'admin/partials/asides/cards' },
    bans: { key: 'bans', label: 'Ban control', path: '/admin/system/bans', mainPartial: 'admin/partials/pages/bans', asidePartial: 'admin/partials/asides/cards' },
    audit: { key: 'audit', label: 'Audit trail', path: '/admin/system/audit', mainPartial: 'admin/partials/pages/audit', asidePartial: 'admin/partials/asides/cards' }
};

const LEGACY_TAB_MAP = {
    dashboard: PAGE_CONFIG.overview.path,
    users: PAGE_CONFIG.users.path,
    courses: PAGE_CONFIG.courses.path,
    subjects: PAGE_CONFIG.subjects.path,
    news: PAGE_CONFIG.news.path
};

function buildAdminNav(activeKey) {
    const groups = [
        { label: 'Operations', items: [{ key: 'overview', href: PAGE_CONFIG.overview.path, icon: 'fa-chart-line', label: PAGE_CONFIG.overview.label }, { key: 'users', href: PAGE_CONFIG.users.path, icon: 'fa-users', label: PAGE_CONFIG.users.label }] },
        { label: 'Content', items: [{ key: 'courses', href: PAGE_CONFIG.courses.path, icon: 'fa-layer-group', label: PAGE_CONFIG.courses.label }, { key: 'subjects', href: PAGE_CONFIG.subjects.path, icon: 'fa-book', label: PAGE_CONFIG.subjects.label }, { key: 'lessons', href: PAGE_CONFIG.lessons.path, icon: 'fa-graduation-cap', label: PAGE_CONFIG.lessons.label }, { key: 'liveSessions', href: PAGE_CONFIG.liveSessions.path, icon: 'fa-tower-broadcast', label: PAGE_CONFIG.liveSessions.label }, { key: 'news', href: PAGE_CONFIG.news.path, icon: 'fa-newspaper', label: PAGE_CONFIG.news.label }, { key: 'proImages', href: PAGE_CONFIG.proImages.path, icon: 'fa-images', label: PAGE_CONFIG.proImages.label }] },
        { label: 'Community', items: [{ key: 'questions', href: PAGE_CONFIG.questions.path, icon: 'fa-circle-question', label: PAGE_CONFIG.questions.label }, { key: 'comments', href: PAGE_CONFIG.comments.path, icon: 'fa-comments', label: PAGE_CONFIG.comments.label }, { key: 'guilds', href: PAGE_CONFIG.guilds.path, icon: 'fa-shield-halved', label: PAGE_CONFIG.guilds.label }, { key: 'guildApplications', href: PAGE_CONFIG.guildApplications.path, icon: 'fa-inbox', label: PAGE_CONFIG.guildApplications.label }] },
        { label: 'Gamification', items: [{ key: 'achievements', href: PAGE_CONFIG.achievements.path, icon: 'fa-trophy', label: PAGE_CONFIG.achievements.label }, { key: 'rewards', href: PAGE_CONFIG.rewards.path, icon: 'fa-gift', label: PAGE_CONFIG.rewards.label }, { key: 'standings', href: PAGE_CONFIG.standings.path, icon: 'fa-ranking-star', label: PAGE_CONFIG.standings.label }] },
        { label: 'System', items: [{ key: 'traffic', href: PAGE_CONFIG.traffic.path, icon: 'fa-chart-area', label: PAGE_CONFIG.traffic.label }, { key: 'bans', href: PAGE_CONFIG.bans.path, icon: 'fa-user-lock', label: PAGE_CONFIG.bans.label }, { key: 'audit', href: PAGE_CONFIG.audit.path, icon: 'fa-clipboard-list', label: PAGE_CONFIG.audit.label }] }
    ];

    return groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item, active: item.key === activeKey }))
    }));
}

function makeSummaryCard(label, value, icon, tone, meta = '') {
    return { label, value, icon, tone, meta };
}

function formatDate(value) {
    if (!value) return 'Chưa có';
    return new Date(value).toLocaleDateString('vi-VN');
}

function formatDateTime(value) {
    if (!value) return 'Chưa có';
    return new Date(value).toLocaleString('vi-VN');
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('vi-VN');
}

function formatBytes(bytes) {
    const numeric = Number(bytes || 0);
    if (numeric < 1024) return `${numeric} B`;
    if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
    return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTextSearch(fields, q) {
    if (!q) return {};
    const regex = new RegExp(escapeRegex(q), 'i');
    return { $or: fields.map((field) => ({ [field]: regex })) };
}

function applyDateFilter(target, field, dateFrom, dateTo) {
    const { start, end } = buildDateRange(dateFrom, dateTo);
    if (!start && !end) return;
    target[field] = {};
    if (start) target[field].$gte = start;
    if (end) target[field].$lte = end;
}

function buildSeries(days = 7) {
    const today = new Date();
    const series = [];
    for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(today);
        date.setHours(0, 0, 0, 0);
        date.setDate(today.getDate() - index);
        series.push({
            key: date.toISOString().split('T')[0],
            label: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date),
            date
        });
    }
    return series;
}

function buildRecentActivityFeed(entries = []) {
    return entries
        .filter(Boolean)
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .slice(0, 10);
}

function buildContextPanel(title, kicker, rows = []) {
    return { title, kicker, rows };
}

async function getSubjectsOptions() {
    return Subject.find().select('_id name').sort({ name: 1 }).lean();
}

async function getContentAuthorOptions() {
    return User.find({ $or: [{ isTeacher: true }, { isAdmin: true }] }).select('_id username').sort({ username: 1 }).lean();
}

async function getUserOptions(extraQuery = {}) {
    return User.find(extraQuery).select('_id username').sort({ username: 1 }).lean();
}

async function getOverviewPageData() {
    const [totals, recentUsers, recentNews, recentQuestions, recentComments, recentApplications, recentAdminLogs] = await Promise.all([
        Promise.all([User.countDocuments(), Course.countDocuments(), Lesson.countDocuments(), News.countDocuments(), Question.countDocuments(), Guild.countDocuments(), GuildApplication.countDocuments({ status: 'pending' }), User.countDocuments({ isBanned: true })]),
        User.find().select('username email createdAt isPro').sort({ createdAt: -1 }).limit(5).lean(),
        News.find().select('title createdAt category').sort({ createdAt: -1 }).limit(4).lean(),
        Question.find().select('title status answerCount createdAt').sort({ createdAt: -1 }).limit(4).lean(),
        Comment.find().select('content isDeleted createdAt').sort({ createdAt: -1 }).limit(4).lean(),
        GuildApplication.find().populate('guild', 'name').populate('applicant', 'username displayName').sort({ createdAt: -1 }).limit(4).lean(),
        AdminActionLog.find().populate('actor', 'username displayName').sort({ createdAt: -1 }).limit(6).lean()
    ]);

    const [totalUsers, totalCourses, totalLessons, totalNews, totalQuestions, totalGuilds, pendingGuildApplications, bannedUsers] = totals;
    const [unpublishedCourses, draftLessons, unansweredQuestions, deletedComments] = await Promise.all([
        Course.countDocuments({ isPublished: false }),
        Lesson.countDocuments({ isPublished: false }),
        Question.countDocuments({ status: 'open', answerCount: { $lt: 1 } }),
        Comment.countDocuments({ isDeleted: true })
    ]);

    const series = buildSeries(7);
    const fromDate = series[0]?.date || new Date();
    const [visitRows, activityRows, registrationRows, roleTotals, contentMixRows] = await Promise.all([
        VisitStats.find({ date: { $gte: fromDate } }).select('dateStr count').lean(),
        UserActivityLog.aggregate([{ $match: { lastActive: { $gte: fromDate } } }, { $group: { _id: '$dateStr', minutes: { $sum: '$minutes' } } }]),
        User.find({ createdAt: { $gte: fromDate } }).select('createdAt').lean(),
        Promise.all([User.countDocuments({ isAdmin: true }), User.countDocuments({ isTeacher: true, isAdmin: { $ne: true } }), User.countDocuments({ isPro: true, isTeacher: { $ne: true }, isAdmin: { $ne: true } }), User.countDocuments({ isPro: { $ne: true }, isTeacher: { $ne: true }, isAdmin: { $ne: true } })]),
        Course.aggregate([{ $group: { _id: '$subjectId', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }, { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subject' } }, { $project: { label: { $ifNull: [{ $arrayElemAt: ['$subject.name', 0] }, 'Chưa gắn môn'] }, count: 1 } }])
    ]);

    const visitMap = new Map(visitRows.map((row) => [row.dateStr, row.count]));
    const activityMap = new Map(activityRows.map((row) => [row._id, row.minutes]));
    const registrationMap = registrationRows.reduce((bucket, row) => {
        const key = new Date(row.createdAt).toISOString().split('T')[0];
        bucket.set(key, (bucket.get(key) || 0) + 1);
        return bucket;
    }, new Map());

    return {
        pageTitle: 'Tổng quan back office',
        pageDescription: 'Theo dõi tín hiệu vận hành, hàng chờ ưu tiên và các nhịp can thiệp quan trọng của hệ thống.',
        summaryCards: [
            makeSummaryCard('Người dùng', formatNumber(totalUsers), 'fa-users', 'accent', `${formatNumber(bannedUsers)} đang bị khóa`),
            makeSummaryCard('Khóa học', formatNumber(totalCourses), 'fa-layer-group', 'info', `${formatNumber(unpublishedCourses)} chưa public`),
            makeSummaryCard('Bài học', formatNumber(totalLessons), 'fa-graduation-cap', 'success', `${formatNumber(draftLessons)} bản nháp`),
            makeSummaryCard('Community', formatNumber(totalQuestions), 'fa-circle-question', 'warning', `${formatNumber(unansweredQuestions)} câu hỏi chưa có lời giải`)
        ],
        contextPanels: [
            buildContextPanel('Queue ưu tiên', 'Ưu tiên xử lý', [{ label: 'Đơn bang hội chờ duyệt', value: formatNumber(pendingGuildApplications) }, { label: 'Bình luận đã ẩn', value: formatNumber(deletedComments) }, { label: 'Tin tức đang có', value: formatNumber(totalNews) }, { label: 'Bang hội hoạt động', value: formatNumber(totalGuilds) }]),
            { title: 'Hành động nhanh', kicker: 'Jump links', actions: [{ label: 'Duyệt users', href: PAGE_CONFIG.users.path, icon: 'fa-users', tone: 'accent' }, { label: 'Quản trị lessons', href: PAGE_CONFIG.lessons.path, icon: 'fa-graduation-cap', tone: 'info' }, { label: 'Hàng chờ guild', href: `${PAGE_CONFIG.guildApplications.path}?status=pending`, icon: 'fa-inbox', tone: 'warning' }] }
        ],
        clientData: {
            charts: {
                overviewGrowth: { labels: series.map((item) => item.label), visits: series.map((item) => visitMap.get(item.key) || 0), studyMinutes: series.map((item) => activityMap.get(item.key) || 0), newUsers: series.map((item) => registrationMap.get(item.key) || 0) },
                roleMix: { labels: ['Thành viên', 'PRO', 'Giáo viên', 'Admin'], data: roleTotals },
                contentMix: { labels: contentMixRows.map((row) => row.label), data: contentMixRows.map((row) => row.count) }
            }
        },
        recentActivity: buildRecentActivityFeed([
            ...recentUsers.map((item) => ({ title: `Người dùng mới: ${item.username}`, meta: item.email || 'Tài khoản mới', tone: item.isPro ? 'accent' : 'neutral', createdAt: item.createdAt })),
            ...recentNews.map((item) => ({ title: `Tin mới: ${item.title}`, meta: item.category, tone: 'info', createdAt: item.createdAt })),
            ...recentQuestions.map((item) => ({ title: `Q&A: ${item.title}`, meta: `${item.status} · ${item.answerCount || 0} trả lời`, tone: item.status === 'open' ? 'warning' : 'success', createdAt: item.createdAt })),
            ...recentComments.map((item) => ({ title: item.isDeleted ? 'Bình luận đã ẩn' : 'Bình luận mới', meta: String(item.content || '').slice(0, 90), tone: item.isDeleted ? 'danger' : 'neutral', createdAt: item.createdAt })),
            ...recentApplications.map((item) => ({ title: `Đơn bang hội: ${item.guild?.name || 'Bang hội'}`, meta: item.applicant?.username || 'Ẩn danh', tone: item.status === 'pending' ? 'warning' : 'neutral', createdAt: item.createdAt })),
            ...recentAdminLogs.map((item) => ({ title: item.summary, meta: item.actor?.username || 'Admin', tone: 'accent', createdAt: item.createdAt }))
        ])
    };
}

async function getUsersPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'username_asc', 'points_desc', 'last_login_desc'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['username', 'email', 'school', 'class'], filters.q) };

    switch (filters.status) {
        case 'admin': query.isAdmin = true; break;
        case 'teacher': query.isTeacher = true; break;
        case 'pro': query.isPro = true; break;
        case 'banned': query.isBanned = true; break;
        case 'active': query.isBanned = { $ne: true }; break;
        default: break;
    }

    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        username_asc: { username: 1 },
        points_desc: { points: -1, createdAt: -1 },
        last_login_desc: { updatedAt: -1 }
    };

    const totalItems = await User.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [users, totalAdmins, totalTeachers, totalPros, totalBanned] = await Promise.all([
        User.find(query).select('username email createdAt isAdmin isTeacher isPro isBanned points totalPoints lastLoginIP lastLoginUA proSecretKey currentStreak school class avatar').sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        User.countDocuments({ isAdmin: true }),
        User.countDocuments({ isTeacher: true }),
        User.countDocuments({ isPro: true }),
        User.countDocuments({ isBanned: true })
    ]);

    const userIds = users.map((item) => item._id);
    const studyRows = userIds.length > 0
        ? await UserActivityLog.aggregate([{ $match: { user: { $in: userIds } } }, { $group: { _id: '$user', minutes: { $sum: '$minutes' }, lastActive: { $max: '$lastActive' } } }])
        : [];
    const studyMap = new Map(studyRows.map((row) => [String(row._id), row]));

    const detailId = String(reqQuery.detailId || '').trim();
    const selectedUser = detailId ? await User.findById(detailId).select('username email createdAt isAdmin isTeacher isPro isBanned points totalPoints lastLoginIP lastLoginUA proSecretKey currentStreak school class avatar').lean() : null;
    let selectedUserMetrics = null;
    let selectedUserLogs = [];

    if (selectedUser) {
        const [activityTotals, actionLogs] = await Promise.all([
            UserActivityLog.aggregate([{ $match: { user: selectedUser._id } }, { $group: { _id: '$user', minutes: { $sum: '$minutes' }, lastActive: { $max: '$lastActive' } } }]),
            AdminActionLog.find({ targetType: 'User', targetId: String(selectedUser._id) }).populate('actor', 'username displayName').sort({ createdAt: -1 }).limit(6).lean()
        ]);
        selectedUserMetrics = activityTotals[0] || { minutes: 0, lastActive: null };
        selectedUserLogs = actionLogs;
    }

    return {
        pageTitle: 'Vận hành người dùng',
        pageDescription: 'Kiểm soát role, trạng thái ban, tín hiệu hoạt động và lịch sử can thiệp theo từng tài khoản.',
        filters,
        users: users.map((item) => ({ ...item, activity: studyMap.get(String(item._id)) || { minutes: 0, lastActive: null } })),
        pagination,
        selectedUser,
        selectedUserMetrics,
        selectedUserLogs,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-users', 'accent', 'Người dùng đang hiển thị'),
            makeSummaryCard('Admin', formatNumber(totalAdmins), 'fa-user-shield', 'danger', 'Quyền cao nhất'),
            makeSummaryCard('Giáo viên', formatNumber(totalTeachers), 'fa-chalkboard-user', 'info', 'Có quyền nội dung'),
            makeSummaryCard('PRO / Banned', `${formatNumber(totalPros)} / ${formatNumber(totalBanned)}`, 'fa-user-lock', 'warning', 'Trạng thái cần theo dõi')
        ]
    };
}

async function getCoursesPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'title_asc', 'published_first'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['title', 'description'], filters.q) };

    if (filters.status === 'published') query.isPublished = true;
    if (filters.status === 'draft') query.isPublished = false;
    if (filters.status === 'pro') query.isPro = true;
    if (filters.subjectId) query.subjectId = filters.subjectId;
    if (filters.authorId) query.author = filters.authorId;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        title_asc: { title: 1 },
        published_first: { isPublished: -1, createdAt: -1 }
    };

    const totalItems = await Course.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [courses, subjectOptions, authorOptions, totalPublished, totalDraft, totalPro] = await Promise.all([
        Course.find(query).populate('author', 'username displayName').populate('subjectId', 'name').sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        getSubjectsOptions(),
        getContentAuthorOptions(),
        Course.countDocuments({ isPublished: true }),
        Course.countDocuments({ isPublished: false }),
        Course.countDocuments({ isPro: true })
    ]);

    const courseIds = courses.map((item) => item._id);
    const [lessonCounts, unitCounts, selectedCourse] = await Promise.all([
        courseIds.length ? Lesson.aggregate([{ $match: { courseId: { $in: courseIds } } }, { $group: { _id: '$courseId', count: { $sum: 1 } } }]) : [],
        courseIds.length ? Unit.aggregate([{ $match: { courseId: { $in: courseIds } } }, { $group: { _id: '$courseId', count: { $sum: 1 } } }]) : [],
        reqQuery.detailId ? Course.findById(reqQuery.detailId).populate('author', 'username displayName').populate('subjectId', 'name').lean() : null
    ]);

    const lessonMap = new Map(lessonCounts.map((row) => [String(row._id), row.count]));
    const unitMap = new Map(unitCounts.map((row) => [String(row._id), row.count]));
    const contextPanels = [];
    if (selectedCourse) {
        contextPanels.push(buildContextPanel('Khóa học đang chọn', 'Detail', [
            { label: 'Tên', value: selectedCourse.title },
            { label: 'Môn', value: selectedCourse.subjectId?.name || 'Chưa gắn môn' },
            { label: 'Tác giả', value: selectedCourse.author?.username || 'Ẩn danh' },
            { label: 'Trạng thái', value: selectedCourse.isPublished ? 'Public' : 'Draft' }
        ]));
    }
    contextPanels.push({ title: 'Điều hướng nhanh', kicker: 'Tác vụ', actions: [{ label: 'Mở lessons', href: PAGE_CONFIG.lessons.path, icon: 'fa-graduation-cap', tone: 'accent' }, { label: 'Mở subjects', href: PAGE_CONFIG.subjects.path, icon: 'fa-book', tone: 'info' }] });

    return {
        pageTitle: 'Content ops · Khóa học',
        pageDescription: 'Sàng lọc các khóa học theo tác giả, môn, trạng thái public và chuyển thẳng sang flow lesson ops khi cần.',
        filters,
        subjectOptions,
        authorOptions,
        courses: courses.map((item) => ({ ...item, lessonCount: lessonMap.get(String(item._id)) || 0, unitCount: unitMap.get(String(item._id)) || 0 })),
        pagination,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-layer-group', 'accent', 'Khóa học đang hiển thị'),
            makeSummaryCard('Public', formatNumber(totalPublished), 'fa-globe', 'success', 'Đang mở cho học viên'),
            makeSummaryCard('Draft', formatNumber(totalDraft), 'fa-file-pen', 'warning', 'Chưa public'),
            makeSummaryCard('PRO', formatNumber(totalPro), 'fa-crown', 'info', 'Nội dung cao cấp')
        ],
        contextPanels
    };
}

async function getSubjectsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'name_asc'], defaultSort: 'name_asc' });
    const query = { ...buildTextSearch(['name'], filters.q) };
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, name_asc: { name: 1 } };
    const totalItems = await Subject.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [subjects, courseCounts, lessonCounts, totalWithImage] = await Promise.all([
        Subject.find(query).sort(sortMap[filters.sort] || sortMap.name_asc).skip(pagination.skip).limit(pagination.pageSize).lean(),
        Course.aggregate([{ $group: { _id: '$subjectId', count: { $sum: 1 } } }]),
        Lesson.aggregate([{ $group: { _id: '$subjectId', count: { $sum: 1 } } }]),
        Subject.countDocuments({ image: { $exists: true, $nin: ['', null] } })
    ]);

    const courseMap = new Map(courseCounts.map((row) => [String(row._id), row.count]));
    const lessonMap = new Map(lessonCounts.map((row) => [String(row._id), row.count]));
    const selectedSubject = reqQuery.detailId ? await Subject.findById(reqQuery.detailId).lean() : null;

    return {
        pageTitle: 'Content ops · Môn học',
        pageDescription: 'Quản lý taxonomy nội dung, icon và mức độ phủ course / lesson theo từng môn.',
        filters,
        subjects: subjects.map((item) => ({ ...item, courseCount: courseMap.get(String(item._id)) || 0, lessonCount: lessonMap.get(String(item._id)) || 0 })),
        pagination,
        selectedSubject,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-book', 'accent', 'Môn học đang hiển thị'),
            makeSummaryCard('Có icon', formatNumber(totalWithImage), 'fa-image', 'info', 'Hiển thị tốt ngoài frontend'),
            makeSummaryCard('Có khóa học', formatNumber(courseCounts.length), 'fa-layer-group', 'success', 'Môn đã được sử dụng'),
            makeSummaryCard('Có bài học', formatNumber(lessonCounts.length), 'fa-graduation-cap', 'warning', 'Mức phủ nội dung')
        ]
    };
}

async function getLessonsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'title_asc', 'views_desc'], defaultSort: 'newest' });
    const searchQuery = buildTextSearch(['title', 'category'], filters.q);
    const query = { ...searchQuery };
    if (filters.status === 'published') query.isPublished = true;
    if (filters.status === 'draft') query.isPublished = false;
    if (filters.status === 'pro') {
        const proCondition = { $or: [{ isPro: true }, { isProOnly: true }] };
        if (searchQuery.$or) {
            delete query.$or;
            query.$and = [{ $or: searchQuery.$or }, proCondition];
        } else {
            Object.assign(query, proCondition);
        }
    }
    if (filters.subjectId) query.subjectId = filters.subjectId;
    if (filters.authorId) query.createdBy = filters.authorId;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, title_asc: { title: 1 }, views_desc: { views: -1, createdAt: -1 } };
    const totalItems = await Lesson.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [lessons, subjectOptions, authorOptions, totalPublished, totalDraft, totalPro] = await Promise.all([
        Lesson.find(query).populate('subjectId', 'name').populate('courseId', 'title').populate('unitId', 'title').populate('createdBy', 'username displayName').sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        getSubjectsOptions(),
        getContentAuthorOptions(),
        Lesson.countDocuments({ isPublished: true }),
        Lesson.countDocuments({ isPublished: false }),
        Lesson.countDocuments({ $or: [{ isPro: true }, { isProOnly: true }] })
    ]);

    const selectedLesson = reqQuery.detailId ? await Lesson.findById(reqQuery.detailId).populate('subjectId', 'name').populate('courseId', 'title').populate('unitId', 'title').populate('createdBy', 'username displayName').lean() : null;
    const contextPanels = [];
    if (selectedLesson) {
        contextPanels.push(buildContextPanel('Bài học đang chọn', 'Detail', [
            { label: 'Tên', value: selectedLesson.title },
            { label: 'Môn', value: selectedLesson.subjectId?.name || 'Chưa gắn môn' },
            { label: 'Khóa học', value: selectedLesson.courseId?.title || 'Chưa gắn khóa' },
        ]));
        contextPanels[contextPanels.length - 1].actions = [{
            label: 'Mở lesson studio',
            href: buildAdminUrl(`${PAGE_CONFIG.lessons.path}/${selectedLesson._id}/edit`, {}, { returnTo: buildAdminUrl(PAGE_CONFIG.lessons.path, filters, { detailId: selectedLesson._id }) }),
            icon: 'fa-pen-ruler',
            tone: 'accent'
        }];
    }

    return {
        pageTitle: 'Content ops · Bài học',
        pageDescription: 'Điều phối nội dung bài học, trạng thái publish và đường vào studio biên tập dành cho admin.',
        filters,
        subjectOptions,
        authorOptions,
        lessons,
        pagination,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-graduation-cap', 'accent', 'Bài học đang hiển thị'),
            makeSummaryCard('Published', formatNumber(totalPublished), 'fa-eye', 'success', 'Đang xuất bản'),
            makeSummaryCard('Draft', formatNumber(totalDraft), 'fa-eye-slash', 'warning', 'Cần rà soát'),
            makeSummaryCard('PRO', formatNumber(totalPro), 'fa-crown', 'info', 'Bài học premium')
        ],
        contextPanels
    };
}

async function getNewsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'title_asc'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['title', 'content', 'category'], filters.q) };
    if (filters.subjectId) query.subject = filters.subjectId;
    if (filters.authorId) query.postedBy = filters.authorId;
    if (filters.status && ['Thông báo', 'Học tập', 'Tuyển sinh', 'Tài khoản PRO'].includes(filters.status)) query.category = filters.status;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, title_asc: { title: 1 } };
    const totalItems = await News.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [newsItems, subjectOptions, authorOptions, totalWithImage, selectedNews] = await Promise.all([
        News.find(query).populate('postedBy', 'username displayName').populate('subject', 'name').sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        getSubjectsOptions(),
        getContentAuthorOptions(),
        News.countDocuments({ image: { $exists: true, $nin: ['', null] } }),
        reqQuery.detailId ? News.findById(reqQuery.detailId).populate('subject', 'name').populate('postedBy', 'username displayName').lean() : null
    ]);

    return {
        pageTitle: 'Content ops · Tin tức',
        pageDescription: 'Vận hành bản tin, quản lý biên tập và theo dõi các chủ đề đang hiển thị ra ngoài sản phẩm.',
        filters,
        subjectOptions,
        authorOptions,
        newsItems,
        pagination,
        selectedNews,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-newspaper', 'accent', 'Bài viết đang hiển thị'),
            makeSummaryCard('Có ảnh bìa', formatNumber(totalWithImage), 'fa-image', 'info', 'Chuẩn cho feed'),
            makeSummaryCard('Tin hôm nay', formatNumber(await News.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } })), 'fa-bolt', 'success', 'Nhịp đăng mới'),
            makeSummaryCard('Danh mục', formatNumber(new Set(newsItems.map((item) => item.category)).size), 'fa-tags', 'warning', 'Đa dạng chủ đề')
        ]
    };
}

async function getProImagesPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'largest'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['displayName', 'filename', 'url'], filters.q) };
    if (filters.authorId) query.user = filters.authorId;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, largest: { size: -1, createdAt: -1 } };
    const totalItems = await ProImage.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [images, authorOptions, totalSize, totalCloudinary] = await Promise.all([
        ProImage.find(query).populate('user', 'username displayName').sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        getUserOptions(),
        ProImage.aggregate([{ $match: query }, { $group: { _id: null, totalSize: { $sum: '$size' } } }]),
        ProImage.countDocuments({ source: 'cloudinary' })
    ]);

    const selectedImage = reqQuery.detailId ? await ProImage.findById(reqQuery.detailId).populate('user', 'username displayName').lean() : null;

    return {
        pageTitle: 'Content ops · PRO Images',
        pageDescription: 'Theo dõi thư viện asset dành cho tài khoản cao cấp, dung lượng chiếm dụng và nguồn upload.',
        filters,
        authorOptions,
        images: images.map((item) => ({ ...item, displaySize: formatBytes(item.size) })),
        pagination,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-images', 'accent', 'Assets đang hiển thị'),
            makeSummaryCard('Dung lượng', formatBytes(totalSize[0]?.totalSize || 0), 'fa-hard-drive', 'info', 'Ước tính hiện tại'),
            makeSummaryCard('Cloudinary', formatNumber(totalCloudinary), 'fa-cloud', 'success', 'Đã migrate'),
            makeSummaryCard('Tác giả', formatNumber(new Set(images.map((item) => String(item.user?._id || ''))).size), 'fa-user', 'warning', 'Số uploader')
        ],
        contextPanels: selectedImage ? [buildContextPanel('Ảnh đang chọn', 'Detail', [{ label: 'Tên hiển thị', value: selectedImage.displayName || 'Chưa đặt' }, { label: 'Uploader', value: selectedImage.user?.username || 'Ẩn danh' }, { label: 'Dung lượng', value: formatBytes(selectedImage.size) }, { label: 'Nguồn', value: selectedImage.source || 'Không rõ' }])] : []
    };
}

async function getQuestionsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'bounty_desc', 'answers_desc', 'views_desc'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['title', 'content'], filters.q) };
    if (filters.status === 'unanswered') query.answerCount = { $lt: 1 };
    else if (filters.status && ['open', 'resolved', 'closed'].includes(filters.status)) query.status = filters.status;
    if (filters.subjectId) query.subject = filters.subjectId;
    if (filters.authorId) query.author = filters.authorId;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, bounty_desc: { bountyAmount: -1, createdAt: -1 }, answers_desc: { answerCount: -1, createdAt: -1 }, views_desc: { viewCount: -1, createdAt: -1 } };
    const totalItems = await Question.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [questions, authorOptions, totalOpen, totalResolved, totalUnanswered, selectedQuestion] = await Promise.all([
        Question.find(query).populate('author', 'username displayName').sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        getUserOptions(),
        Question.countDocuments({ status: 'open' }),
        Question.countDocuments({ status: 'resolved' }),
        Question.countDocuments({ answerCount: { $lt: 1 } }),
        reqQuery.detailId ? Question.findById(reqQuery.detailId).populate('author', 'username displayName').lean() : null
    ]);

    return {
        pageTitle: 'Community ops · Q&A',
        pageDescription: 'Giám sát chất lượng cầu cứu, số câu chưa có lời giải và can thiệp nhanh vào trạng thái câu hỏi.',
        filters,
        authorOptions,
        questionSubjects: Question.QUESTION_SUBJECTS || ['Toán', 'Lý', 'Hóa', 'Sinh', 'Anh', 'Văn', 'Khác'],
        questions,
        pagination,
        selectedQuestion,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-circle-question', 'accent', 'Câu hỏi đang hiển thị'),
            makeSummaryCard('Open', formatNumber(totalOpen), 'fa-door-open', 'warning', 'Chưa đóng'),
            makeSummaryCard('Resolved', formatNumber(totalResolved), 'fa-circle-check', 'success', 'Đã chốt'),
            makeSummaryCard('Unanswered', formatNumber(totalUnanswered), 'fa-life-ring', 'danger', 'Cần người hỗ trợ')
        ]
    };
}

async function getCommentsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'likes_desc'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['content'], filters.q) };
    if (filters.status === 'deleted') query.isDeleted = true;
    if (filters.status === 'active') query.isDeleted = false;
    if (filters.authorId) query.user = filters.authorId;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, likes_desc: { likes: -1, createdAt: -1 } };
    const totalItems = await Comment.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [comments, authorOptions, totalDeleted, selectedComment] = await Promise.all([
        Comment.find(query).populate('user', 'username displayName').populate('lesson', 'title').sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        getUserOptions(),
        Comment.countDocuments({ isDeleted: true }),
        reqQuery.detailId ? Comment.findById(reqQuery.detailId).populate('user', 'username displayName').populate('lesson', 'title').lean() : null
    ]);

    return {
        pageTitle: 'Community ops · Bình luận bài học',
        pageDescription: 'Xử lý luồng comment theo lesson, trả lời, soft-delete và các đoạn trích đang gây nhiễu trải nghiệm học.',
        filters,
        authorOptions,
        comments: comments.map((item) => ({ ...item, replyCount: Array.isArray(item.replies) ? item.replies.length : 0 })),
        pagination,
        selectedComment,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-comments', 'accent', 'Bình luận đang hiển thị'),
            makeSummaryCard('Đã ẩn', formatNumber(totalDeleted), 'fa-eye-slash', 'warning', 'Soft delete'),
            makeSummaryCard('Có trả lời', formatNumber(comments.filter((item) => Array.isArray(item.replies) && item.replies.length > 0).length), 'fa-reply', 'info', 'Theo page hiện tại'),
            makeSummaryCard('Likes', formatNumber(comments.reduce((sum, item) => sum + Number(item.likes || 0), 0)), 'fa-heart', 'success', 'Tương tác trong page')
        ]
    };
}

async function getGuildsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'members_desc', 'xp_desc', 'name_asc'], defaultSort: 'members_desc' });
    const query = { ...buildTextSearch(['name', 'description'], filters.q) };
    if (filters.status === 'open' || filters.status === 'approval' || filters.status === 'invite') query['settings.joinMode'] = filters.status;
    if (filters.status === 'private') query['settings.isPublic'] = false;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, members_desc: { memberCount: -1, createdAt: -1 }, xp_desc: { treeXp: -1, createdAt: -1 }, name_asc: { name: 1 } };
    const totalItems = await Guild.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [guilds, totalPublic, totalOpen, totalAutoMod, selectedGuild] = await Promise.all([
        Guild.find(query).populate('leader', 'username displayName').sort(sortMap[filters.sort] || sortMap.members_desc).skip(pagination.skip).limit(pagination.pageSize).lean(),
        Guild.countDocuments({ 'settings.isPublic': true }),
        Guild.countDocuments({ 'settings.joinMode': 'open' }),
        Guild.countDocuments({ 'settings.autoModeration.enabled': true }),
        reqQuery.detailId ? Guild.findById(reqQuery.detailId).populate('leader', 'username displayName').lean() : null
    ]);

    const guildAuditRows = selectedGuild
        ? await GuildAuditLog.find({ guild: selectedGuild._id }).populate('actor', 'username displayName').populate('targetUser', 'username displayName').sort({ createdAt: -1 }).limit(8).lean()
        : [];

    return {
        pageTitle: 'Community ops · Bang hội',
        pageDescription: 'Theo dõi quy mô, chế độ join, auto moderation và lịch sử governance của từng bang hội.',
        filters,
        guilds,
        pagination,
        selectedGuild,
        guildAuditRows,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-shield-halved', 'accent', 'Bang hội đang hiển thị'),
            makeSummaryCard('Public', formatNumber(totalPublic), 'fa-globe', 'info', 'Cho phép khám phá'),
            makeSummaryCard('Join open', formatNumber(totalOpen), 'fa-door-open', 'success', 'Không cần duyệt'),
            makeSummaryCard('Auto mod', formatNumber(totalAutoMod), 'fa-robot', 'warning', 'Đang bật luật tự động')
        ]
    };
}

async function getGuildApplicationsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest'], defaultSort: 'newest' });
    const query = {};
    if (filters.status && ['pending', 'approved', 'rejected', 'cancelled'].includes(filters.status)) query.status = filters.status;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const totalItems = await GuildApplication.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [applications, totalPending, totalApproved, totalRejected] = await Promise.all([
        GuildApplication.find(query).populate('guild', 'name slug').populate('applicant', 'username displayName level').populate('reviewedBy', 'username displayName').sort(filters.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 }).skip(pagination.skip).limit(pagination.pageSize).lean(),
        GuildApplication.countDocuments({ status: 'pending' }),
        GuildApplication.countDocuments({ status: 'approved' }),
        GuildApplication.countDocuments({ status: 'rejected' })
    ]);

    const selectedApplication = reqQuery.detailId
        ? await GuildApplication.findById(reqQuery.detailId).populate('guild', 'name slug').populate('applicant', 'username displayName level').populate('reviewedBy', 'username displayName').lean()
        : null;

    return {
        pageTitle: 'Community ops · Đơn bang hội',
        pageDescription: 'Xử lý hàng chờ guild application ở cấp back office, không phụ thuộc vào quyền leader trong bang.',
        filters,
        applications,
        pagination,
        selectedApplication,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-inbox', 'accent', 'Đơn đang hiển thị'),
            makeSummaryCard('Pending', formatNumber(totalPending), 'fa-hourglass-half', 'warning', 'Cần xử lý'),
            makeSummaryCard('Approved', formatNumber(totalApproved), 'fa-circle-check', 'success', 'Đã duyệt'),
            makeSummaryCard('Rejected', formatNumber(totalRejected), 'fa-circle-xmark', 'danger', 'Đã từ chối')
        ]
    };
}

async function getAchievementsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'name_asc', 'points_desc'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['id', 'name', 'description'], filters.q) };
    if (filters.status === 'active') query.isActive = true;
    if (filters.status === 'inactive') query.isActive = false;
    if (filters.status === 'hidden') query.isHidden = true;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, name_asc: { name: 1 }, points_desc: { points: -1, createdAt: -1 } };
    const totalItems = await AchievementType.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [achievements, totalActive, totalHidden, totalLegendary] = await Promise.all([
        AchievementType.find(query).sort(sortMap[filters.sort] || sortMap.newest).skip(pagination.skip).limit(pagination.pageSize).lean(),
        AchievementType.countDocuments({ isActive: true }),
        AchievementType.countDocuments({ isHidden: true }),
        AchievementType.countDocuments({ rarity: 'legendary' })
    ]);
    const selectedAchievement = reqQuery.detailId ? await AchievementType.findById(reqQuery.detailId).lean() : null;
    const selectedAchievementUnlocks = selectedAchievement ? await UserAchievement.countDocuments({ achievementId: selectedAchievement._id }) : 0;

    return {
        pageTitle: 'Gamification ops · Achievement types',
        pageDescription: 'Biên tập taxonomy achievement, mức rarity, trạng thái active / hidden và điều kiện mở khóa.',
        filters,
        achievements,
        pagination,
        selectedAchievement,
        selectedAchievementUnlocks,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-trophy', 'accent', 'Achievement đang hiển thị'),
            makeSummaryCard('Active', formatNumber(totalActive), 'fa-bolt', 'success', 'Có hiệu lực'),
            makeSummaryCard('Hidden', formatNumber(totalHidden), 'fa-mask', 'warning', 'Bí mật với user'),
            makeSummaryCard('Legendary', formatNumber(totalLegendary), 'fa-star', 'info', 'Mức hiếm cao')
        ]
    };
}

async function getRewardsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest'], defaultSort: 'newest' });
    const query = {};
    if (filters.status && ['revealed', 'claiming', 'claimed', 'ignored'].includes(filters.status)) query.status = filters.status;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const totalItems = await LessonRewardEvent.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [rewardEvents, totalClaimed, totalPending, totalIgnored] = await Promise.all([
        LessonRewardEvent.find(query).populate('user', 'username displayName').populate('lesson', 'title').sort(filters.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 }).skip(pagination.skip).limit(pagination.pageSize).lean(),
        LessonRewardEvent.countDocuments({ status: 'claimed' }),
        LessonRewardEvent.countDocuments({ status: { $in: ['revealed', 'claiming'] } }),
        LessonRewardEvent.countDocuments({ status: 'ignored' })
    ]);

    const selectedReward = reqQuery.detailId ? await LessonRewardEvent.findById(reqQuery.detailId).populate('user', 'username displayName').populate('lesson', 'title').lean() : null;

    return {
        pageTitle: 'Gamification ops · Lesson rewards',
        pageDescription: 'Theo dõi reward event theo lesson, trạng thái claim và các bundle đang hoạt động.',
        filters,
        rewardEvents,
        pagination,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-gift', 'accent', 'Reward events đang hiển thị'),
            makeSummaryCard('Claimed', formatNumber(totalClaimed), 'fa-circle-check', 'success', 'Đã nhận'),
            makeSummaryCard('Pending', formatNumber(totalPending), 'fa-hourglass-half', 'warning', 'Chờ xử lý'),
            makeSummaryCard('Ignored', formatNumber(totalIgnored), 'fa-eye-slash', 'danger', 'Đã bỏ qua')
        ],
        contextPanels: selectedReward ? [buildContextPanel('Reward đang chọn', 'Detail', [{ label: 'User', value: selectedReward.user?.username || 'Ẩn danh' }, { label: 'Lesson', value: selectedReward.lesson?.title || 'Không rõ' }, { label: 'Event type', value: selectedReward.eventType }, { label: 'Status', value: selectedReward.status }])] : []
    };
}

async function getStandingsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'rank_asc', 'xp_desc'], defaultSort: 'newest' });
    const query = {};
    if (filters.status === 'weekly' || filters.status === 'monthly') query.periodType = filters.status;
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const totalItems = await GuildWeeklyStanding.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [standings, totalWeekly, totalMonthly] = await Promise.all([
        GuildWeeklyStanding.find(query).populate('guild', 'name slug').sort(filters.sort === 'rank_asc' ? { rank: 1, createdAt: -1 } : filters.sort === 'xp_desc' ? { totalXp: -1, createdAt: -1 } : { createdAt: -1 }).skip(pagination.skip).limit(pagination.pageSize).lean(),
        GuildWeeklyStanding.countDocuments({ periodType: 'weekly' }),
        GuildWeeklyStanding.countDocuments({ periodType: 'monthly' })
    ]);

    const selectedStanding = reqQuery.detailId ? await GuildWeeklyStanding.findById(reqQuery.detailId).populate('guild', 'name slug').lean() : null;

    return {
        pageTitle: 'Gamification ops · Bảng xếp hạng guild',
        pageDescription: 'Quan sát weekly / monthly standings của guild theo XP, points và study minutes snapshot.',
        filters,
        standings,
        pagination,
        summaryCards: [
            makeSummaryCard('Theo bộ lọc', formatNumber(totalItems), 'fa-ranking-star', 'accent', 'Standing records đang hiển thị'),
            makeSummaryCard('Weekly', formatNumber(totalWeekly), 'fa-calendar-week', 'info', 'Chu kỳ tuần'),
            makeSummaryCard('Monthly', formatNumber(totalMonthly), 'fa-calendar-days', 'success', 'Chu kỳ tháng'),
            makeSummaryCard('Guild khác nhau', formatNumber(new Set(standings.map((item) => String(item.guild?._id || ''))).size), 'fa-shield-halved', 'warning', 'Trong page')
        ],
        contextPanels: selectedStanding ? [buildContextPanel('Standing đang chọn', 'Detail', [{ label: 'Guild', value: selectedStanding.guild?.name || 'Ẩn danh' }, { label: 'Chu kỳ', value: `${selectedStanding.periodType} · ${selectedStanding.periodKey}` }, { label: 'Rank', value: String(selectedStanding.rank || 0) }, { label: 'XP', value: formatNumber(selectedStanding.totalXp) }])] : []
    };
}

async function getTrafficPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'visits_desc'], defaultSort: 'newest' });
    const series = buildSeries(30);
    const fromDate = series[0]?.date || new Date();
    const [visitRows, activityRows, registrationRows] = await Promise.all([
        VisitStats.find({ date: { $gte: fromDate } }).select('dateStr count').sort(filters.sort === 'oldest' ? { date: 1 } : { date: -1 }).lean(),
        UserActivityLog.aggregate([{ $match: { lastActive: { $gte: fromDate } } }, { $group: { _id: '$dateStr', minutes: { $sum: '$minutes' }, activeUsers: { $addToSet: '$user' } } }]),
        User.find({ createdAt: { $gte: fromDate } }).select('createdAt').lean()
    ]);

    const visitMap = new Map(visitRows.map((row) => [row.dateStr, row.count]));
    const activityMap = new Map(activityRows.map((row) => [row._id, { minutes: row.minutes, activeUsers: Array.isArray(row.activeUsers) ? row.activeUsers.length : 0 }]));
    const registrationMap = registrationRows.reduce((bucket, row) => {
        const key = new Date(row.createdAt).toISOString().split('T')[0];
        bucket.set(key, (bucket.get(key) || 0) + 1);
        return bucket;
    }, new Map());

    const trafficRows = series.map((item) => ({
        dateKey: item.key,
        label: item.label,
        visits: visitMap.get(item.key) || 0,
        minutes: activityMap.get(item.key)?.minutes || 0,
        activeUsers: activityMap.get(item.key)?.activeUsers || 0,
        newUsers: registrationMap.get(item.key) || 0
    }));

    const pagination = buildPagination(filters.page, trafficRows.length, filters.pageSize);
    const pagedRows = trafficRows.slice(pagination.skip, pagination.skip + pagination.pageSize);

    return {
        pageTitle: 'System ops · Traffic & study signals',
        pageDescription: 'Tổng hợp visits, study minutes, active users và signups theo ngày để soi nhịp tăng trưởng thật.',
        filters,
        trafficRows: pagedRows,
        pagination,
        clientData: {
            charts: {
                trafficTrend: {
                    labels: trafficRows.map((item) => item.label),
                    visits: trafficRows.map((item) => item.visits),
                    minutes: trafficRows.map((item) => item.minutes),
                    newUsers: trafficRows.map((item) => item.newUsers)
                }
            }
        },
        summaryCards: [
            makeSummaryCard('Tổng visits 30d', formatNumber(trafficRows.reduce((sum, item) => sum + item.visits, 0)), 'fa-chart-area', 'accent', 'Lượt truy cập'),
            makeSummaryCard('Study minutes 30d', formatNumber(trafficRows.reduce((sum, item) => sum + item.minutes, 0)), 'fa-stopwatch', 'info', 'Phút học tích lũy'),
            makeSummaryCard('Active users hôm nay', formatNumber(trafficRows[trafficRows.length - 1]?.activeUsers || 0), 'fa-user-clock', 'success', 'Theo heartbeat'),
            makeSummaryCard('Signups 30d', formatNumber(trafficRows.reduce((sum, item) => sum + item.newUsers, 0)), 'fa-user-plus', 'warning', 'Đăng ký mới')
        ],
        contextPanels: [buildContextPanel('Ảnh chụp mới nhất', 'Realtime', [{ label: 'Ngày gần nhất', value: trafficRows[trafficRows.length - 1]?.label || 'N/A' }, { label: 'Visits', value: formatNumber(trafficRows[trafficRows.length - 1]?.visits || 0) }, { label: 'Minutes', value: formatNumber(trafficRows[trafficRows.length - 1]?.minutes || 0) }, { label: 'Active users', value: formatNumber(trafficRows[trafficRows.length - 1]?.activeUsers || 0) }])]
    };
}

async function getBansPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest'], defaultSort: 'newest' });
    const userQuery = { isBanned: true, ...buildTextSearch(['username', 'email', 'lastLoginIP'], filters.q) };
    const totalItems = await User.countDocuments(userQuery);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);
    const [bannedUsers, recentBanEntries] = await Promise.all([
        User.find(userQuery).select('username email lastLoginIP lastLoginUA isBanned createdAt').sort(filters.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 }).skip(pagination.skip).limit(pagination.pageSize).lean(),
        BanEntry.find().sort({ bannedAt: -1 }).limit(10).lean()
    ]);

    return {
        pageTitle: 'System ops · Ban control',
        pageDescription: 'Quan sát tài khoản bị khóa và các fingerprint ban đang tồn tại trên hệ thống.',
        filters,
        bannedUsers,
        recentBanEntries,
        pagination,
        summaryCards: [
            makeSummaryCard('Đang bị khóa', formatNumber(totalItems), 'fa-user-lock', 'danger', 'Theo user flag'),
            makeSummaryCard('Ban entries mới', formatNumber(recentBanEntries.length), 'fa-fingerprint', 'info', 'Top 10 gần nhất'),
            makeSummaryCard('Có IP gần nhất', formatNumber(bannedUsers.filter((item) => item.lastLoginIP).length), 'fa-network-wired', 'warning', 'Fingerprint khả dụng'),
            makeSummaryCard('Có user-agent', formatNumber(bannedUsers.filter((item) => item.lastLoginUA).length), 'fa-desktop', 'success', 'Dữ liệu trình duyệt')
        ],
        contextPanels: recentBanEntries.length ? [buildContextPanel('Fingerprint mới nhất', 'Ban entry', recentBanEntries.slice(0, 4).map((entry) => ({ label: entry.ip, value: formatDateTime(entry.bannedAt) })))] : []
    };
}

async function getAuditPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest'], defaultSort: 'newest' });
    const domainFilter = filters.status;
    const adminLogQuery = { ...buildTextSearch(['summary', 'domain', 'action'], filters.q) };
    if (domainFilter) adminLogQuery.domain = domainFilter;
    applyDateFilter(adminLogQuery, 'createdAt', filters.dateFrom, filters.dateTo);

    const [adminLogs, guildLogs] = await Promise.all([
        AdminActionLog.find(adminLogQuery).populate('actor', 'username displayName').sort(filters.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 }).limit(80).lean(),
        GuildAuditLog.find(filters.q ? { message: { $regex: escapeRegex(filters.q), $options: 'i' } } : {}).populate('actor', 'username displayName').populate('guild', 'name').sort(filters.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 }).limit(40).lean()
    ]);

    const mergedLogs = [
        ...adminLogs.map((item) => ({ source: 'admin', title: item.summary, meta: `${item.domain} · ${item.action}`, actor: item.actor?.username || 'Admin', createdAt: item.createdAt, raw: item })),
        ...guildLogs.map((item) => ({ source: 'guild', title: item.message, meta: `${item.guild?.name || 'Guild'} · ${item.actionType}`, actor: item.actor?.username || 'System', createdAt: item.createdAt, raw: item }))
    ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

    const pagination = buildPagination(filters.page, mergedLogs.length, filters.pageSize);

    return {
        pageTitle: 'System ops · Audit trail',
        pageDescription: 'Hợp nhất action log của back office với guild governance log để lần lại thay đổi quan trọng theo thời gian.',
        filters,
        auditLogs: mergedLogs.slice(pagination.skip, pagination.skip + pagination.pageSize),
        pagination,
        summaryCards: [
            makeSummaryCard('Admin logs', formatNumber(adminLogs.length), 'fa-clipboard-list', 'accent', 'Theo bộ lọc hiện tại'),
            makeSummaryCard('Guild logs', formatNumber(guildLogs.length), 'fa-scroll', 'info', 'Luồng governance'),
            makeSummaryCard('Nguồn dữ liệu', '2', 'fa-database', 'success', 'Admin + Guild'),
            makeSummaryCard('Mục hiển thị', formatNumber(mergedLogs.length), 'fa-list', 'warning', 'Sau khi merge')
        ],
        contextPanels: mergedLogs.length ? [buildContextPanel('Bản ghi mới nhất', 'Latest', [{ label: mergedLogs[0].title, value: `${mergedLogs[0].actor} · ${formatDateTime(mergedLogs[0].createdAt)}` }])] : []
    };
}

async function getLiveSessionsPageData(reqQuery = {}) {
    const filters = parseListQuery(reqQuery, { allowedSorts: ['newest', 'oldest', 'viewers_desc'], defaultSort: 'newest' });
    const query = { ...buildTextSearch(['title', 'slug', 'category'], filters.q) };

    if (filters.status && LIVE_SESSION_STATUSES.includes(filters.status)) {
        query.status = filters.status;
    }
    applyDateFilter(query, 'createdAt', filters.dateFrom, filters.dateTo);

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        viewers_desc: { viewerPeak: -1, createdAt: -1 }
    };

    const totalItems = await LiveSession.countDocuments(query);
    const pagination = buildPagination(filters.page, totalItems, filters.pageSize);

    const [sessions, totalLive, totalScheduled, totalEnded, totalFailed] = await Promise.all([
        LiveSession.find(query)
            .populate('hostUser', 'username displayName avatar')
            .populate('subjectId', 'name')
            .sort(sortMap[filters.sort] || sortMap.newest)
            .skip(pagination.skip)
            .limit(pagination.pageSize)
            .lean(),
        LiveSession.countDocuments({ status: 'live' }),
        LiveSession.countDocuments({ status: 'scheduled' }),
        LiveSession.countDocuments({ status: 'ended' }),
        LiveSession.countDocuments({ status: 'failed' })
    ]);

    const selectedSession = reqQuery.detailId
        ? await LiveSession.findById(reqQuery.detailId)
            .populate('hostUser', 'username displayName avatar')
            .populate('subjectId', 'name')
            .populate('courseId', 'title')
            .populate('lessonId', 'title')
            .lean()
        : null;

    const contextPanels = [];
    if (selectedSession) {
        contextPanels.push(buildContextPanel('Phòng live đang chọn', 'Detail', [
            { label: 'Tiêu đề', value: selectedSession.title },
            { label: 'Host', value: selectedSession.hostUser?.username || 'Ẩn danh' },
            { label: 'Trạng thái', value: selectedSession.status },
            { label: 'Peak viewer', value: formatNumber(selectedSession.viewerPeak) },
            { label: 'Chat', value: formatNumber(selectedSession.chatMessagesCount) },
            { label: 'Câu hỏi', value: formatNumber(selectedSession.questionsCount) },
            { label: 'Provider', value: selectedSession.providerKind || 'mock' }
        ]));
    }

    return {
        pageTitle: 'Content ops · Phòng live',
        pageDescription: 'Quản lý phiên live, buộc kết thúc phòng đang hoạt động và xóa các phiên lỗi / hết hạn.',
        filters,
        sessions,
        pagination,
        selectedSession,
        summaryCards: [
            makeSummaryCard('Tổng phòng', formatNumber(totalItems), 'fa-tower-broadcast', 'accent', 'Theo bộ lọc'),
            makeSummaryCard('Đang live', formatNumber(totalLive), 'fa-circle-play', 'success', 'Hiện đang phát'),
            makeSummaryCard('Đã lên lịch', formatNumber(totalScheduled), 'fa-calendar-check', 'info', 'Chưa bắt đầu'),
            makeSummaryCard('Kết thúc / Lỗi', `${formatNumber(totalEnded)} / ${formatNumber(totalFailed)}`, 'fa-flag-checkered', 'warning', 'Đã xong hoặc gặp sự cố')
        ],
        contextPanels
    };
}

async function getPageViewModel(pageKey, reqQuery = {}) {
    const pageConfig = PAGE_CONFIG[pageKey];
    if (!pageConfig) {
        throw new Error(`Unknown admin page: ${pageKey}`);
    }

    const loaders = {
        overview: getOverviewPageData,
        users: getUsersPageData,
        courses: getCoursesPageData,
        subjects: getSubjectsPageData,
        lessons: getLessonsPageData,
        news: getNewsPageData,
        proImages: getProImagesPageData,
        questions: getQuestionsPageData,
        comments: getCommentsPageData,
        guilds: getGuildsPageData,
        guildApplications: getGuildApplicationsPageData,
        achievements: getAchievementsPageData,
        rewards: getRewardsPageData,
        standings: getStandingsPageData,
        traffic: getTrafficPageData,
        bans: getBansPageData,
        audit: getAuditPageData,
        liveSessions: getLiveSessionsPageData
    };

    const data = await loaders[pageKey](reqQuery);

    return {
        ...pageConfig,
        ...data,
        navGroups: buildAdminNav(pageKey),
        buildAdminUrl,
        formatDate,
        formatDateTime,
        formatNumber,
        formatBytes
    };
}

module.exports = {
    PAGE_CONFIG,
    LEGACY_TAB_MAP,
    buildAdminNav,
    formatDate,
    formatDateTime,
    formatNumber,
    formatBytes,
    getPageViewModel
};

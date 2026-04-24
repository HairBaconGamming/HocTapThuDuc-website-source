const Lesson = require('../models/Lesson');
const Subject = require('../models/Subject');
const {
    LEGACY_TAB_MAP,
    PAGE_CONFIG,
    getPageViewModel
} = require('../services/adminViewService');
const {
    updateUserRoles,
    setUserBanState,
    deleteUserAccount,
    toggleCoursePublish,
    deleteCourseWithContent,
    saveSubjectRecord,
    deleteSubjectRecord,
    saveNewsRecord,
    deleteNewsRecord,
    toggleLessonPublish,
    updateLessonFromAdmin,
    updateQuestionStatus,
    moderateComment,
    reviewGuildApplicationFromAdmin,
    saveAchievementType
} = require('../services/adminMutationService');
const { safeAdminReturnTo, getReturnTo } = require('../utils/adminHelpers');

function buildLegacyRedirect(req) {
    const targetPath = LEGACY_TAB_MAP[req.query.tab] || PAGE_CONFIG.overview.path;
    const params = new URLSearchParams();
    Object.entries(req.query || {}).forEach(([key, value]) => {
        if (key === 'tab') return;
        if (value === undefined || value === null || value === '') return;
        params.set(key, String(value));
    });
    const queryString = params.toString();
    return `${targetPath}${queryString ? `?${queryString}` : ''}`;
}

function renderPage(pageKey) {
    return async (req, res) => {
        try {
            const viewModel = await getPageViewModel(pageKey, req.query || {});
            return res.render('admin/index', {
                ...viewModel,
                clientData: viewModel.clientData || {},
                title: `${viewModel.pageTitle} · Admin`,
                currentUrl: req.originalUrl,
                adminCsrfToken: res.locals.adminCsrfToken,
                layout: false
            });
        } catch (error) {
            console.error(`Admin render error (${pageKey}):`, error);
            req.flash('error', 'Không thể tải khu quản trị này lúc này.');
            return res.redirect(PAGE_CONFIG.overview.path);
        }
    };
}

async function handleMutation(req, res, task, { successMessage, fallbackPath }) {
    try {
        await task();
        req.flash('success', successMessage);
    } catch (error) {
        console.error('Admin mutation error:', error);
        req.flash('error', error.message || 'Không thể hoàn tất thao tác quản trị.');
    }

    return res.redirect(getReturnTo(req, fallbackPath));
}

exports.redirectAdminEntry = async (req, res) => {
    if (req.query.tab) {
        return res.redirect(buildLegacyRedirect(req));
    }
    return res.redirect(PAGE_CONFIG.overview.path);
};

exports.getOverview = renderPage('overview');
exports.getUsers = renderPage('users');
exports.getCourses = renderPage('courses');
exports.getSubjects = renderPage('subjects');
exports.getLessons = renderPage('lessons');
exports.getNews = renderPage('news');
exports.getProImages = renderPage('proImages');
exports.getQuestions = renderPage('questions');
exports.getComments = renderPage('comments');
exports.getGuilds = renderPage('guilds');
exports.getGuildApplications = renderPage('guildApplications');
exports.getAchievements = renderPage('achievements');
exports.getRewards = renderPage('rewards');
exports.getStandings = renderPage('standings');
exports.getTraffic = renderPage('traffic');
exports.getBans = renderPage('bans');
exports.getAudit = renderPage('audit');

exports.getAdminLessonEditor = async (req, res) => {
    try {
        const lesson = await Lesson.findById(req.params.id).lean();
        if (!lesson) {
            req.flash('error', 'Không tìm thấy bài học cần biên tập.');
            return res.redirect(PAGE_CONFIG.lessons.path);
        }

        const subjects = await Subject.find({}).lean();
        const exitHref = safeAdminReturnTo(req.query.returnTo, `${PAGE_CONFIG.lessons.path}?detailId=${lesson._id}`);

        return res.render('ManageLesson', {
            mode: 'edit',
            user: req.user,
            lesson,
            subjects,
            activePage: 'admin',
            formAction: `/admin/content/lessons/${lesson._id}/edit`,
            exitHref,
            returnTo: exitHref,
            adminCsrfToken: res.locals.adminCsrfToken
        });
    } catch (error) {
        console.error('Admin lesson editor error:', error);
        req.flash('error', 'Không thể mở studio quản trị cho bài học này.');
        return res.redirect(PAGE_CONFIG.lessons.path);
    }
};

exports.saveAdminLessonEditor = async (req, res) => {
    return handleMutation(req, res, async () => {
        await updateLessonFromAdmin({
            actor: req.user,
            lessonId: req.params.id,
            body: req.body
        });
    }, {
        successMessage: 'Đã lưu thay đổi của bài học trong studio quản trị.',
        fallbackPath: `${PAGE_CONFIG.lessons.path}?detailId=${req.params.id}`
    });
};

exports.updateUser = async (req, res) => handleMutation(req, res, async () => {
    await updateUserRoles({
        actor: req.user,
        targetUserId: req.body.userId || req.params.id,
        isAdmin: req.body.isAdmin,
        isPro: req.body.isPro,
        isTeacher: req.body.isTeacher,
        proSecretKey: req.body.proSecretKey
    });
}, {
    successMessage: 'Đã cập nhật quyền tài khoản.',
    fallbackPath: PAGE_CONFIG.users.path
});

exports.banUser = async (req, res) => handleMutation(req, res, async () => {
    await setUserBanState({
        actor: req.user,
        targetUserId: req.body.userId || req.params.id,
        banned: true,
        reason: req.body.reason
    });
}, {
    successMessage: 'Đã khóa tài khoản người dùng.',
    fallbackPath: PAGE_CONFIG.users.path
});

exports.unbanUser = async (req, res) => handleMutation(req, res, async () => {
    await setUserBanState({
        actor: req.user,
        targetUserId: req.body.userId || req.params.id,
        banned: false,
        reason: req.body.reason
    });
}, {
    successMessage: 'Đã mở khóa tài khoản người dùng.',
    fallbackPath: PAGE_CONFIG.users.path
});

exports.deleteUser = async (req, res) => handleMutation(req, res, async () => {
    await deleteUserAccount({
        actor: req.user,
        targetUserId: req.body.userId || req.params.id
    });
}, {
    successMessage: 'Đã xóa tài khoản người dùng.',
    fallbackPath: PAGE_CONFIG.users.path
});

exports.approveCourse = async (req, res) => handleMutation(req, res, async () => {
    await toggleCoursePublish({
        actor: req.user,
        courseId: req.body.courseId || req.params.id,
        isPublished: req.body.isPublished === 'on' || req.body.isPublished === true || req.body.isPublished === 'true'
    });
}, {
    successMessage: 'Đã cập nhật trạng thái khóa học.',
    fallbackPath: PAGE_CONFIG.courses.path
});

exports.deleteCourse = async (req, res) => handleMutation(req, res, async () => {
    await deleteCourseWithContent({
        actor: req.user,
        courseId: req.body.courseId || req.params.id
    });
}, {
    successMessage: 'Đã xóa khóa học và nội dung liên quan.',
    fallbackPath: PAGE_CONFIG.courses.path
});

exports.saveSubject = async (req, res) => handleMutation(req, res, async () => {
    await saveSubjectRecord({
        actor: req.user,
        subjectId: req.body.subjectId,
        name: req.body.name,
        image: req.body.image
    });
}, {
    successMessage: 'Đã lưu môn học.',
    fallbackPath: PAGE_CONFIG.subjects.path
});

exports.deleteSubject = async (req, res) => handleMutation(req, res, async () => {
    await deleteSubjectRecord({
        actor: req.user,
        subjectId: req.body.subjectId || req.params.id
    });
}, {
    successMessage: 'Đã xóa môn học.',
    fallbackPath: PAGE_CONFIG.subjects.path
});

exports.saveNews = async (req, res) => handleMutation(req, res, async () => {
    await saveNewsRecord({
        actor: req.user,
        newsId: req.body.newsId,
        title: req.body.title,
        content: req.body.content,
        category: req.body.category,
        image: req.body.image,
        subject: req.body.subject
    });
}, {
    successMessage: 'Đã lưu bài viết tin tức.',
    fallbackPath: PAGE_CONFIG.news.path
});

exports.createNews = exports.saveNews;

exports.deleteNews = async (req, res) => handleMutation(req, res, async () => {
    await deleteNewsRecord({
        actor: req.user,
        newsId: req.body.newsId || req.params.id
    });
}, {
    successMessage: 'Đã xóa bài viết tin tức.',
    fallbackPath: PAGE_CONFIG.news.path
});

exports.toggleLessonPublish = async (req, res) => handleMutation(req, res, async () => {
    await toggleLessonPublish({
        actor: req.user,
        lessonId: req.body.lessonId || req.params.id,
        isPublished: req.body.isPublished === 'on' || req.body.isPublished === true || req.body.isPublished === 'true'
    });
}, {
    successMessage: 'Đã cập nhật trạng thái publish của bài học.',
    fallbackPath: PAGE_CONFIG.lessons.path
});

exports.updateQuestionStatus = async (req, res) => handleMutation(req, res, async () => {
    await updateQuestionStatus({
        actor: req.user,
        questionId: req.body.questionId || req.params.id,
        status: req.body.status
    });
}, {
    successMessage: 'Đã cập nhật trạng thái câu hỏi.',
    fallbackPath: PAGE_CONFIG.questions.path
});

exports.moderateComment = async (req, res) => handleMutation(req, res, async () => {
    await moderateComment({
        actor: req.user,
        commentId: req.body.commentId || req.params.id,
        action: req.body.action
    });
}, {
    successMessage: 'Đã cập nhật moderation cho bình luận.',
    fallbackPath: PAGE_CONFIG.comments.path
});

exports.reviewGuildApplication = async (req, res) => handleMutation(req, res, async () => {
    await reviewGuildApplicationFromAdmin({
        actor: req.user,
        applicationId: req.body.applicationId || req.params.id,
        decision: req.body.decision,
        reviewNote: req.body.reviewNote
    });
}, {
    successMessage: 'Đã xử lý đơn bang hội.',
    fallbackPath: PAGE_CONFIG.guildApplications.path
});

exports.saveAchievement = async (req, res) => handleMutation(req, res, async () => {
    await saveAchievementType({
        actor: req.user,
        achievementId: req.body.achievementId,
        id: req.body.id,
        name: req.body.name,
        description: req.body.description,
        icon: req.body.icon,
        color: req.body.color,
        category: req.body.category,
        points: req.body.points,
        rarity: req.body.rarity,
        conditionType: req.body.conditionType,
        conditionValue: req.body.conditionValue,
        conditionOperator: req.body.conditionOperator,
        unlockMessage: req.body.unlockMessage,
        isHidden: req.body.isHidden,
        isActive: req.body.isActive
    });
}, {
    successMessage: 'Đã lưu achievement type.',
    fallbackPath: PAGE_CONFIG.achievements.path
});

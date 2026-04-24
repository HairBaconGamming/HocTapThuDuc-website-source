const crypto = require('crypto');

const User = require('../models/User');
const Course = require('../models/Course');
const Unit = require('../models/Unit');
const Lesson = require('../models/Lesson');
const Subject = require('../models/Subject');
const News = require('../models/News');
const Question = require('../models/Question');
const Comment = require('../models/Comment');
const GuildApplication = require('../models/GuildApplication');
const Guild = require('../models/Guild');
const GuildAuditLog = require('../models/GuildAuditLog');
const BanEntry = require('../models/BanEntry');
const { AchievementType } = require('../models/Achievement');
const { processLessonContent } = require('../utils/essayHelpers');
const { OWNER_USERNAME } = require('../utils/adminHelpers');
const { recordAdminAction } = require('./adminAuditService');

function createDeps(overrides = {}) {
    return {
        User,
        Course,
        Unit,
        Lesson,
        Subject,
        News,
        Question,
        Comment,
        GuildApplication,
        Guild,
        GuildAuditLog,
        BanEntry,
        AchievementType,
        recordAdminAction,
        ...overrides
    };
}

function checkboxToBoolean(value) {
    if (typeof value === 'boolean') return value;
    return ['on', 'true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function assertAdminActor(actor) {
    if (!actor || !actor._id || !actor.isAdmin) {
        const error = new Error('Chỉ admin mới có quyền thực hiện thao tác này.');
        error.status = 403;
        throw error;
    }
}

async function updateUserRoles(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, targetUserId, isAdmin, isPro, isTeacher, proSecretKey = '' } = payload;
    assertAdminActor(actor);

    const targetUser = await deps.User.findById(targetUserId);
    if (!targetUser) {
        const error = new Error('Không tìm thấy người dùng cần cập nhật.');
        error.status = 404;
        throw error;
    }

    if (targetUser.username === OWNER_USERNAME) {
        targetUser.isAdmin = true;
        targetUser.isPro = true;
        targetUser.isTeacher = true;
        targetUser.proSecretKey = String(proSecretKey || '').trim();
    } else {
        targetUser.isPro = checkboxToBoolean(isPro);
        targetUser.isTeacher = checkboxToBoolean(isTeacher);
        targetUser.proSecretKey = String(proSecretKey || '').trim();

        if (actor.username === OWNER_USERNAME) {
            targetUser.isAdmin = checkboxToBoolean(isAdmin);
        }
    }

    await targetUser.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'users',
        action: 'update_roles',
        targetType: 'User',
        targetId: targetUser._id,
        summary: `Cập nhật quyền cho ${targetUser.username}`,
        metadata: {
            isAdmin: targetUser.isAdmin,
            isPro: targetUser.isPro,
            isTeacher: targetUser.isTeacher
        }
    });

    return targetUser;
}

async function setUserBanState(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, targetUserId, banned, reason = '' } = payload;
    assertAdminActor(actor);

    const targetUser = await deps.User.findById(targetUserId);
    if (!targetUser) {
        const error = new Error('Không tìm thấy người dùng cần cập nhật trạng thái cấm.');
        error.status = 404;
        throw error;
    }

    if (targetUser.username === OWNER_USERNAME) {
        const error = new Error('Không thể khóa tài khoản owner.');
        error.status = 400;
        throw error;
    }

    targetUser.isBanned = Boolean(banned);
    await targetUser.save();

    const deviceIp = targetUser.lastLoginIP || `user:${targetUser._id}`;
    const userAgent = targetUser.lastLoginUA || 'admin-ban-without-user-agent';

    if (targetUser.isBanned) {
        await deps.BanEntry.create({
            ip: deviceIp,
            userAgent,
            banToken: crypto.randomBytes(18).toString('hex'),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10)
        });
    } else {
        await deps.BanEntry.deleteMany({
            $or: [
                { ip: deviceIp },
                { userAgent }
            ]
        });
    }

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'users',
        action: targetUser.isBanned ? 'ban' : 'unban',
        targetType: 'User',
        targetId: targetUser._id,
        summary: `${targetUser.isBanned ? 'Khóa' : 'Mở khóa'} tài khoản ${targetUser.username}`,
        metadata: { reason: String(reason || '').trim() }
    });

    return targetUser;
}

async function deleteUserAccount(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, targetUserId } = payload;
    assertAdminActor(actor);

    const targetUser = await deps.User.findById(targetUserId);
    if (!targetUser) {
        const error = new Error('Không tìm thấy người dùng cần xóa.');
        error.status = 404;
        throw error;
    }

    if (targetUser.username === OWNER_USERNAME) {
        const error = new Error('Không thể xóa tài khoản owner.');
        error.status = 400;
        throw error;
    }

    await deps.User.deleteOne({ _id: targetUser._id });
    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'users',
        action: 'delete',
        targetType: 'User',
        targetId: targetUser._id,
        summary: `Xóa tài khoản ${targetUser.username}`
    });
}

async function toggleCoursePublish(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, courseId, isPublished } = payload;
    assertAdminActor(actor);

    const course = await deps.Course.findById(courseId);
    if (!course) {
        const error = new Error('Không tìm thấy khóa học.');
        error.status = 404;
        throw error;
    }

    course.isPublished = Boolean(isPublished);
    await course.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: course.isPublished ? 'publish_course' : 'unpublish_course',
        targetType: 'Course',
        targetId: course._id,
        summary: `${course.isPublished ? 'Xuất bản' : 'Ẩn'} khóa học ${course.title}`
    });

    return course;
}

async function deleteCourseWithContent(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, courseId } = payload;
    assertAdminActor(actor);

    const course = await deps.Course.findById(courseId);
    if (!course) {
        const error = new Error('Không tìm thấy khóa học cần xóa.');
        error.status = 404;
        throw error;
    }

    await deps.Course.deleteOne({ _id: course._id });
    await deps.Unit.deleteMany({ courseId: course._id });
    await deps.Lesson.deleteMany({ courseId: course._id });

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: 'delete_course',
        targetType: 'Course',
        targetId: course._id,
        summary: `Xóa khóa học ${course.title}`
    });
}

async function saveSubjectRecord(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, subjectId, name, image = '' } = payload;
    assertAdminActor(actor);

    const cleanName = String(name || '').trim();
    if (!cleanName) {
        const error = new Error('Tên môn học không được để trống.');
        error.status = 400;
        throw error;
    }

    let subject;
    if (subjectId) {
        subject = await deps.Subject.findById(subjectId);
        if (!subject) {
            const error = new Error('Không tìm thấy môn học cần cập nhật.');
            error.status = 404;
            throw error;
        }
        subject.name = cleanName;
        subject.image = String(image || '').trim();
    } else {
        subject = new deps.Subject({
            name: cleanName,
            image: String(image || '').trim()
        });
    }

    await subject.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: subjectId ? 'update_subject' : 'create_subject',
        targetType: 'Subject',
        targetId: subject._id,
        summary: `${subjectId ? 'Cập nhật' : 'Tạo'} môn học ${subject.name}`
    });

    return subject;
}

async function deleteSubjectRecord(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, subjectId } = payload;
    assertAdminActor(actor);

    const subject = await deps.Subject.findById(subjectId);
    if (!subject) {
        const error = new Error('Không tìm thấy môn học cần xóa.');
        error.status = 404;
        throw error;
    }

    await deps.Subject.deleteOne({ _id: subject._id });

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: 'delete_subject',
        targetType: 'Subject',
        targetId: subject._id,
        summary: `Xóa môn học ${subject.name}`
    });
}

async function saveNewsRecord(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, newsId, title, content, category, image = '', subject = '' } = payload;
    assertAdminActor(actor);

    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || '').trim();
    if (!cleanTitle || !cleanContent || !String(category || '').trim()) {
        const error = new Error('Tin tức cần có tiêu đề, danh mục và nội dung.');
        error.status = 400;
        throw error;
    }

    let news;
    if (newsId) {
        news = await deps.News.findById(newsId);
        if (!news) {
            const error = new Error('Không tìm thấy bài viết cần cập nhật.');
            error.status = 404;
            throw error;
        }
    } else {
        news = new deps.News({ postedBy: actor._id });
    }

    news.title = cleanTitle;
    news.content = cleanContent;
    news.category = String(category).trim();
    news.image = String(image || '').trim();
    news.subject = subject || null;
    news.postedBy = news.postedBy || actor._id;

    await news.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: newsId ? 'update_news' : 'create_news',
        targetType: 'News',
        targetId: news._id,
        summary: `${newsId ? 'Cập nhật' : 'Tạo'} bài viết ${news.title}`
    });

    return news;
}

async function deleteNewsRecord(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, newsId } = payload;
    assertAdminActor(actor);

    const news = await deps.News.findById(newsId);
    if (!news) {
        const error = new Error('Không tìm thấy bài viết cần xóa.');
        error.status = 404;
        throw error;
    }

    await deps.News.deleteOne({ _id: news._id });

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: 'delete_news',
        targetType: 'News',
        targetId: news._id,
        summary: `Xóa bài viết ${news.title}`
    });
}

async function toggleLessonPublish(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, lessonId, isPublished } = payload;
    assertAdminActor(actor);

    const lesson = await deps.Lesson.findById(lessonId);
    if (!lesson) {
        const error = new Error('Không tìm thấy bài học.');
        error.status = 404;
        throw error;
    }

    lesson.isPublished = Boolean(isPublished);
    await lesson.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: lesson.isPublished ? 'publish_lesson' : 'unpublish_lesson',
        targetType: 'Lesson',
        targetId: lesson._id,
        summary: `${lesson.isPublished ? 'Xuất bản' : 'Ẩn'} bài học ${lesson.title}`
    });

    return lesson;
}

async function updateLessonFromAdmin(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, lessonId, body } = payload;
    assertAdminActor(actor);

    const lesson = await deps.Lesson.findById(lessonId);
    if (!lesson) {
        const error = new Error('Không tìm thấy bài học cần cập nhật.');
        error.status = 404;
        throw error;
    }

    const { subjectId, title, category, type, editorData, isProOnly, tags } = body;
    lesson.subject = subjectId;
    lesson.subjectId = subjectId;
    lesson.title = title;
    lesson.category = category;
    lesson.type = type || 'markdown';
    lesson.editorData = editorData;
    lesson.isPro = String(isProOnly) === 'true';
    lesson.isProOnly = String(isProOnly) === 'true';
    lesson.tags = typeof tags === 'string'
        ? tags.split(',').map((tag) => tag.trim()).filter(Boolean)
        : [];
    lesson.content = processLessonContent(body);

    await lesson.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'content',
        action: 'edit_lesson',
        targetType: 'Lesson',
        targetId: lesson._id,
        summary: `Biên tập bài học ${lesson.title}`
    });

    return lesson;
}

async function updateQuestionStatus(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, questionId, status } = payload;
    assertAdminActor(actor);

    const nextStatus = String(status || '').trim();
    if (!['open', 'resolved', 'closed'].includes(nextStatus)) {
        const error = new Error('Trạng thái câu hỏi không hợp lệ.');
        error.status = 400;
        throw error;
    }

    const question = await deps.Question.findById(questionId);
    if (!question) {
        const error = new Error('Không tìm thấy câu hỏi.');
        error.status = 404;
        throw error;
    }

    question.status = nextStatus;
    await question.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'community',
        action: 'update_question_status',
        targetType: 'Question',
        targetId: question._id,
        summary: `Đổi trạng thái câu hỏi "${question.title}" sang ${nextStatus}`,
        metadata: { status: nextStatus }
    });

    return question;
}

async function moderateComment(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, commentId, action } = payload;
    assertAdminActor(actor);

    if (!['delete', 'restore'].includes(action)) {
        const error = new Error('Hành động moderation không hợp lệ.');
        error.status = 400;
        throw error;
    }

    const comment = await deps.Comment.findById(commentId);
    if (!comment) {
        const error = new Error('Không tìm thấy bình luận.');
        error.status = 404;
        throw error;
    }

    comment.isDeleted = action === 'delete';
    comment.deletedAt = action === 'delete' ? new Date() : null;
    await comment.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'community',
        action: action === 'delete' ? 'delete_comment' : 'restore_comment',
        targetType: 'Comment',
        targetId: comment._id,
        summary: `${action === 'delete' ? 'Ẩn' : 'Khôi phục'} bình luận ${comment._id}`
    });

    return comment;
}

async function reviewGuildApplicationFromAdmin(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, applicationId, decision, reviewNote = '' } = payload;
    assertAdminActor(actor);

    const nextStatus = String(decision || '').trim();
    if (!['approved', 'rejected', 'cancelled'].includes(nextStatus)) {
        const error = new Error('Quyết định duyệt đơn không hợp lệ.');
        error.status = 400;
        throw error;
    }

    const application = await deps.GuildApplication.findById(applicationId)
        .populate('guild', 'name slug');
    if (!application) {
        const error = new Error('Không tìm thấy đơn gia nhập bang hội.');
        error.status = 404;
        throw error;
    }

    application.status = nextStatus;
    application.reviewedBy = actor._id;
    application.reviewedAt = new Date();
    application.reviewNote = String(reviewNote || '').trim();
    await application.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'community',
        action: 'review_guild_application',
        targetType: 'GuildApplication',
        targetId: application._id,
        summary: `${nextStatus === 'approved' ? 'Duyệt' : 'Từ chối'} đơn vào ${application.guild?.name || 'bang hội'}`,
        metadata: { decision: nextStatus }
    });

    if (application.guild?._id) {
        await deps.GuildAuditLog.create({
            guild: application.guild._id,
            actor: actor._id,
            targetUser: application.applicant,
            actionType: nextStatus === 'approved' ? 'application_approved' : 'application_rejected',
            message: `Admin ${actor.username} ${nextStatus === 'approved' ? 'đã duyệt' : 'đã từ chối'} đơn gia nhập.`,
            metadata: {
                applicationId: String(application._id),
                reviewNote: application.reviewNote
            }
        });
    }

    return application;
}

async function saveAchievementType(payload, overrides = {}) {
    const deps = createDeps(overrides);
    const { actor, achievementId, id, name, description, icon, color, category, points, rarity, conditionType, conditionValue, conditionOperator, unlockMessage, isHidden, isActive } = payload;
    assertAdminActor(actor);

    const cleanExternalId = String(id || '').trim();
    const cleanName = String(name || '').trim();
    if (!cleanExternalId || !cleanName || !conditionType) {
        const error = new Error('Achievement cần mã, tên và loại điều kiện.');
        error.status = 400;
        throw error;
    }

    let achievement = achievementId
        ? await deps.AchievementType.findById(achievementId)
        : await deps.AchievementType.findOne({ id: cleanExternalId });

    if (!achievement) {
        achievement = new deps.AchievementType();
    }

    achievement.id = cleanExternalId;
    achievement.name = cleanName;
    achievement.description = String(description || '').trim();
    achievement.icon = String(icon || '🏆').trim() || '🏆';
    achievement.color = String(color || '#4f46e5').trim() || '#4f46e5';
    achievement.category = String(category || 'learning').trim();
    achievement.points = Number(points || 0);
    achievement.rarity = String(rarity || 'common').trim();
    achievement.condition = {
        type: String(conditionType).trim(),
        value: Number(conditionValue || 1),
        operator: String(conditionOperator || '>=').trim()
    };
    achievement.unlockMessage = String(unlockMessage || '').trim();
    achievement.isHidden = checkboxToBoolean(isHidden);
    achievement.isActive = checkboxToBoolean(isActive) || String(isActive || '').trim() === '';

    await achievement.save();

    await deps.recordAdminAction({
        actorId: actor._id,
        domain: 'gamification',
        action: achievementId ? 'update_achievement' : 'create_achievement',
        targetType: 'AchievementType',
        targetId: achievement._id,
        summary: `${achievementId ? 'Cập nhật' : 'Tạo'} achievement ${achievement.name}`
    });

    return achievement;
}

module.exports = {
    checkboxToBoolean,
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
};

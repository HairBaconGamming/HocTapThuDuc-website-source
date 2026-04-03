const Course = require('../models/Course');
const Lesson = require('../models/Lesson');

function normalizeId(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value._id) return normalizeId(value._id);
    if (typeof value.toString === 'function') return value.toString();
    return '';
}

function isObjectIdString(value) {
    return /^[a-f\d]{24}$/i.test(String(value || ''));
}

function hasProContentAccess(user) {
    return !!(user && (user.isPro || user.isAdmin || user.isTeacher));
}

function canManageCourse(user, course) {
    if (!user || !course) return false;
    if (user.isAdmin) return true;
    return normalizeId(user._id) === normalizeId(course.author);
}

function canManageLesson(user, lesson, course = null) {
    if (!user || !lesson) return false;
    if (user.isAdmin) return true;

    const userId = normalizeId(user._id);
    if (normalizeId(lesson.createdBy) === userId) return true;

    return canManageCourse(user, course);
}

async function loadCourseForLesson(lesson) {
    if (!lesson || !lesson.courseId) return null;

    if (typeof lesson.courseId === 'object' && lesson.courseId !== null) {
        if (lesson.courseId.author !== undefined || lesson.courseId.isPublished !== undefined) {
            return lesson.courseId;
        }
    }

    return Course.findById(lesson.courseId)
        .select('_id author isPublished isPro subjectId')
        .lean();
}

async function getCourseAccessState(user, course) {
    const canManage = canManageCourse(user, course);
    const isDraftBlocked = !!(course && course.isPublished === false && !canManage);
    const needsPro = !!(course && course.isPro && !hasProContentAccess(user) && !canManage);

    return {
        allowed: !isDraftBlocked && !needsPro,
        canManage,
        isDraftBlocked,
        needsPro
    };
}

async function getLessonAccessState(user, lesson, { course = null } = {}) {
    const resolvedCourse = course || await loadCourseForLesson(lesson);
    const canManage = canManageLesson(user, lesson, resolvedCourse);

    const isDraftBlocked = !!(
        (
            lesson && lesson.isPublished === false
        ) || (
            resolvedCourse && resolvedCourse.isPublished === false
        )
    ) && !canManage;

    const needsPro = !!(
        lesson && (lesson.isPro || lesson.isProOnly)
        || resolvedCourse && resolvedCourse.isPro
    ) && !hasProContentAccess(user) && !canManage;

    return {
        allowed: !isDraftBlocked && !needsPro,
        canManage,
        isDraftBlocked,
        needsPro,
        course: resolvedCourse
    };
}

function buildCourseVisibilityFilter(user, extra = {}) {
    const filter = { ...extra, isPublished: true };

    if (!hasProContentAccess(user)) {
        filter.isPro = { $ne: true };
    }

    return filter;
}

function buildLessonVisibilityFilter(user, extra = {}) {
    const filter = { ...extra, isPublished: true };

    if (!hasProContentAccess(user)) {
        filter.isPro = { $ne: true };
        filter.isProOnly = { $ne: true };
    }

    return filter;
}

function extractFileIdFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/\/documents\/(?:view|public-view)\/([a-f\d]{24})/i);
    return match ? match[1] : '';
}

function collectDocumentIds(value, bucket) {
    if (!value) return;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        const embeddedFileId = extractFileIdFromUrl(trimmed);
        if (embeddedFileId) bucket.add(embeddedFileId);

        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1) {
            try {
                collectDocumentIds(JSON.parse(trimmed), bucket);
            } catch (error) {
                return;
            }
        }
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => collectDocumentIds(entry, bucket));
        return;
    }

    if (typeof value === 'object') {
        if (isObjectIdString(value.fileId)) {
            bucket.add(String(value.fileId));
        }

        if (typeof value.url === 'string') {
            const fileIdFromUrl = extractFileIdFromUrl(value.url);
            if (fileIdFromUrl) bucket.add(fileIdFromUrl);
        }

        Object.values(value).forEach((entry) => collectDocumentIds(entry, bucket));
    }
}

function extractDocumentIdsFromLesson(lesson) {
    const bucket = new Set();
    if (!lesson) return [];

    collectDocumentIds(lesson.editorData, bucket);
    collectDocumentIds(lesson.content, bucket);

    return Array.from(bucket);
}

async function findLessonsReferencingDocument(fileId) {
    if (!isObjectIdString(fileId)) return [];

    const needle = String(fileId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lessons = await Lesson.find({
        $or: [
            { 'editorData.document': { $regex: needle, $options: 'i' } },
            { content: { $regex: needle, $options: 'i' } }
        ]
    }).select('_id courseId createdBy isPublished isPro isProOnly editorData content').lean();

    return lessons.filter((lesson) => extractDocumentIdsFromLesson(lesson).includes(String(fileId)));
}

module.exports = {
    hasProContentAccess,
    canManageCourse,
    canManageLesson,
    getCourseAccessState,
    getLessonAccessState,
    buildCourseVisibilityFilter,
    buildLessonVisibilityFilter,
    extractFileIdFromUrl,
    extractDocumentIdsFromLesson,
    findLessonsReferencingDocument
};

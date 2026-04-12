const slugify = require('slugify');

function normalizeSlugSegment(value, fallback = 'trang') {
    const slug = slugify(String(value || fallback), {
        lower: true,
        strict: true,
        locale: 'vi'
    });

    return slug || fallback;
}

function buildSubjectPath(subject) {
    if (!subject?._id) return '/subjects';
    const slug = subject.slug || normalizeSlugSegment(subject.name, 'mon-hoc');
    return `/subjects/${subject._id}/${slug}`;
}

function buildCoursePath(course) {
    if (!course?._id) return '/courses';
    const slug = course.slug || normalizeSlugSegment(course.title, 'khoa-hoc');
    return `/course/${course._id}/${slug}`;
}

function buildQuestionPath(question) {
    if (!question?._id) return '/qa';
    const slug = normalizeSlugSegment(question.slug || question.title, 'cau-hoi');
    return `/qa/questions/${question._id}/${slug}`;
}

function buildAbsoluteUrl(origin, pathname) {
    if (!origin) return pathname || '';
    if (!pathname) return origin;
    if (/^https?:\/\//i.test(pathname)) return pathname;
    return `${String(origin).replace(/\/$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

module.exports = {
    normalizeSlugSegment,
    buildSubjectPath,
    buildCoursePath,
    buildQuestionPath,
    buildAbsoluteUrl
};

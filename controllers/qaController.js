const mongoose = require('mongoose');
const QuestionModel = require('../models/Question');
const Answer = require('../models/Answer');
const User = require('../models/User');
const Garden = require('../models/Garden');
const GuildWeeklyStanding = require('../models/GuildWeeklyStanding');
const { refreshStandingRanks } = require('../services/guildCompetitionService');
const {
    getCurrentWeekKey,
    getCurrentMonthKey,
    getWeekRange,
    getMonthRange
} = require('../utils/guildPeriodUtils');
const { buildAbsoluteUrl, buildQuestionPath } = require('../utils/urlHelpers');

const Question = QuestionModel;
const QUESTION_SUBJECTS = QuestionModel.QUESTION_SUBJECTS || ['Toán', 'Lý', 'Hóa', 'Sinh', 'Anh', 'Văn', 'Khác'];
const QUESTION_GRADES = QuestionModel.QUESTION_GRADES || ['10', '11', '12', 'Chung'];

const ANSWER_UPVOTE_GOLD = 5;
const ANSWER_UPVOTE_POINTS = 2;
const ACCEPT_ANSWER_GOLD = 50;
const ACCEPT_ANSWER_POINTS = 20;
const MAX_BOUNTY = 50000;

function wantsJson(req) {
    const accept = String(req.get('accept') || '');
    return !!(
        req.xhr ||
        accept.includes('application/json') ||
        req.get('x-requested-with') === 'XMLHttpRequest'
    );
}

function asObjectId(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return new mongoose.Types.ObjectId(id);
}

function normalizeString(value, fallback = '') {
    return String(value || '').trim() || fallback;
}

function normalizeContent(value) {
    return normalizeString(value, '').replace(/\r\n/g, '\n');
}

function parseImagesInput(raw) {
    if (Array.isArray(raw)) {
        return raw.map((entry) => normalizeString(entry)).filter(Boolean).slice(0, 8);
    }
    if (typeof raw === 'string') {
        return raw
            .split(/\r?\n|,/)
            .map((entry) => normalizeString(entry))
            .filter(Boolean)
            .slice(0, 8);
    }
    return [];
}

function sanitizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function buildTier(points) {
    const score = Math.max(0, sanitizeNumber(points, 0));
    if (score >= 2000) return { label: 'Chiến Thần Giải Đề', icon: '⚔️' };
    if (score >= 1000) return { label: 'Học Bá', icon: '🏆' };
    if (score >= 300) return { label: 'Thư Sinh', icon: '📘' };
    return { label: 'Tân Binh', icon: '🌱' };
}

function buildQuestionQuery(filters, user) {
    const query = {};

    if (QUESTION_SUBJECTS.includes(filters.subject)) {
        query.subject = filters.subject;
    }

    if (QUESTION_GRADES.includes(filters.grade)) {
        query.grade = filters.grade;
    }

    if (filters.sort === 'unanswered') {
        query.answerCount = { $lt: 1 };
    }

    if (filters.sort === 'mine' && user?._id) {
        query.author = user._id;
    }

    if (filters.q) {
        const escaped = String(filters.q).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        query.$or = [{ title: regex }, { content: regex }];
    }

    return query;
}

function buildQuestionSort(sortKey) {
    if (sortKey === 'hot') {
        return { bountyAmount: -1, answerCount: -1, viewCount: -1, createdAt: -1 };
    }
    if (sortKey === 'unanswered') {
        return { bountyAmount: -1, createdAt: -1 };
    }
    if (sortKey === 'mine') {
        return { updatedAt: -1, createdAt: -1 };
    }
    return { createdAt: -1 };
}

async function adjustGuildContributionPoints(guildId, delta) {
    const pointDelta = Math.trunc(sanitizeNumber(delta, 0));
    if (!guildId || !pointDelta) return;

    const periods = [
        { periodType: 'weekly', periodKey: getCurrentWeekKey() },
        { periodType: 'monthly', periodKey: getCurrentMonthKey() }
    ];

    for (const period of periods) {
        let standing = await GuildWeeklyStanding.findOne({
            guild: guildId,
            periodType: period.periodType,
            periodKey: period.periodKey
        });

        if (!standing) {
            if (pointDelta < 0) {
                continue;
            }
            standing = new GuildWeeklyStanding({
                guild: guildId,
                periodType: period.periodType,
                periodKey: period.periodKey,
                memberCountSnapshot: 0
            });
        }

        standing.totalPoints = Math.max(0, sanitizeNumber(standing.totalPoints, 0) + pointDelta);
        await standing.save();
    }

    await Promise.all([
        refreshStandingRanks('weekly', getCurrentWeekKey()),
        refreshStandingRanks('monthly', getCurrentMonthKey())
    ]);
}

async function adjustUserRewards(userId, { goldDelta = 0, pointDelta = 0 }) {
    const targetUser = await User.findById(userId).select('_id points totalPoints guild');
    if (!targetUser) return null;

    const nextPoints = Math.max(0, sanitizeNumber(targetUser.points, 0) + pointDelta);
    targetUser.points = nextPoints;

    if (pointDelta > 0) {
        targetUser.totalPoints = Math.max(0, sanitizeNumber(targetUser.totalPoints, 0) + pointDelta);
    }

    await targetUser.save();

    if (goldDelta > 0) {
        await Garden.findOneAndUpdate(
            { user: targetUser._id },
            { $inc: { gold: goldDelta } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } else if (goldDelta < 0) {
        const garden = await Garden.findOne({ user: targetUser._id });
        if (garden) {
            garden.gold = Math.max(0, sanitizeNumber(garden.gold, 0) + goldDelta);
            await garden.save();
        }
    }

    if (pointDelta !== 0 && targetUser.guild) {
        await adjustGuildContributionPoints(targetUser.guild, pointDelta);
    }

    return targetUser;
}

async function buildContributorBoard(rangeBuilder) {
    const range = rangeBuilder();
    const rows = await Answer.aggregate([
        {
            $match: {
                createdAt: {
                    $gte: range.start,
                    $lte: range.end
                }
            }
        },
        {
            $project: {
                author: 1,
                upvoteCount: { $size: { $ifNull: ['$upvotes', []] } },
                acceptedCount: { $cond: ['$isAccepted', 1, 0] },
                answerCount: { $literal: 1 }
            }
        },
        {
            $group: {
                _id: '$author',
                answerCount: { $sum: '$answerCount' },
                upvoteCount: { $sum: '$upvoteCount' },
                acceptedCount: { $sum: '$acceptedCount' }
            }
        },
        {
            $addFields: {
                score: {
                    $add: [
                        '$answerCount',
                        { $multiply: ['$upvoteCount', ANSWER_UPVOTE_POINTS] },
                        { $multiply: ['$acceptedCount', ACCEPT_ANSWER_POINTS] }
                    ]
                }
            }
        },
        { $sort: { score: -1, acceptedCount: -1, upvoteCount: -1, answerCount: -1 } },
        { $limit: 5 },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: '$user' },
        {
            $project: {
                _id: 0,
                userId: '$user._id',
                username: '$user.username',
                avatar: '$user.avatar',
                points: '$user.points',
                isPro: '$user.isPro',
                answerCount: 1,
                upvoteCount: 1,
                acceptedCount: 1,
                score: 1
            }
        }
    ]);

    return rows.map((row, index) => ({
        ...row,
        rank: index + 1,
        tier: buildTier(row.points)
    }));
}

async function buildHotTags() {
    const rows = await Question.aggregate([
        {
            $group: {
                _id: { subject: '$subject', grade: '$grade' },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 8 }
    ]);

    return rows.map((row) => {
        const subject = row._id?.subject || 'Khác';
        const grade = row._id?.grade || 'Chung';
        const label = grade === 'Chung' ? `#${subject}` : `#${subject}${grade}`;
        const params = new URLSearchParams();
        params.set('subject', subject);
        if (grade && grade !== 'Chung') params.set('grade', grade);
        return {
            label,
            count: row.count,
            url: `/qa?${params.toString()}`
        };
    });
}

async function buildSidebarPayload() {
    const [weeklyContributors, monthlyContributors, hotTags, openCount, resolvedCount] = await Promise.all([
        buildContributorBoard(getWeekRange),
        buildContributorBoard(getMonthRange),
        buildHotTags(),
        Question.countDocuments({ status: 'open' }),
        Question.countDocuments({ status: 'resolved' })
    ]);

    return {
        contributors: {
            weekly: weeklyContributors,
            monthly: monthlyContributors
        },
        hotTags,
        stats: {
            openCount,
            resolvedCount
        }
    };
}

function buildBreadcrumbsForHub() {
    return [
        { label: 'Trang chủ', url: '/' },
        { label: 'Bảng Cầu Cứu', url: null }
    ];
}

function buildBreadcrumbsForQuestion(question) {
    return [
        { label: 'Trang chủ', url: '/' },
        { label: 'Bảng Cầu Cứu', url: '/qa' },
        { label: question?.title || 'Chi tiết câu hỏi', url: null }
    ];
}

function questionPreviewText(question) {
    const text = normalizeString(question?.content);
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function respond(req, res, payload, redirectUrl, successMessage) {
    if (wantsJson(req)) {
        return res.json({ success: true, redirectUrl, ...payload });
    }
    if (successMessage) {
        req.flash('success', successMessage);
    }
    return res.redirect(redirectUrl);
}

function respondError(req, res, statusCode, message, redirectUrl) {
    if (wantsJson(req)) {
        return res.status(statusCode).json({ success: false, error: message });
    }
    req.flash('error', message);
    return res.redirect(redirectUrl || '/qa');
}

async function loadQaFeedState(req) {
    const filters = {
        sort: ['newest', 'hot', 'unanswered', 'mine'].includes(req.query.sort) ? req.query.sort : 'newest',
        subject: QUESTION_SUBJECTS.includes(req.query.subject) ? req.query.subject : '',
        grade: QUESTION_GRADES.includes(req.query.grade) ? req.query.grade : '',
        q: normalizeString(req.query.q)
    };

    const query = buildQuestionQuery(filters, req.user);
    const sort = buildQuestionSort(filters.sort);

    const [questions, sidebar] = await Promise.all([
        Question.find(query)
            .sort(sort)
            .limit(30)
            .populate('author', 'username avatar isPro points')
            .lean(),
        buildSidebarPayload()
    ]);

    const feed = questions.map((question) => ({
        ...question,
        previewText: questionPreviewText(question),
        tier: buildTier(question.author?.points || 0),
        upvoteCount: Array.isArray(question.upvotes) ? question.upvotes.length : 0,
        href: buildQuestionPath(question)
    }));

    return { filters, sidebar, feed };
}

exports.getQaHub = async (req, res) => {
    try {
        const filters = {
            sort: ['newest', 'hot', 'unanswered', 'mine'].includes(req.query.sort) ? req.query.sort : 'newest',
            subject: QUESTION_SUBJECTS.includes(req.query.subject) ? req.query.subject : '',
            grade: QUESTION_GRADES.includes(req.query.grade) ? req.query.grade : '',
            q: normalizeString(req.query.q)
        };

        const query = buildQuestionQuery(filters, req.user);
        const sort = buildQuestionSort(filters.sort);

        const [questions, sidebar] = await Promise.all([
            Question.find(query)
                .sort(sort)
                .limit(30)
                .populate('author', 'username avatar isPro points')
                .lean(),
            buildSidebarPayload()
        ]);

        const feed = questions.map((question) => ({
            ...question,
            previewText: questionPreviewText(question),
            tier: buildTier(question.author?.points || 0),
            upvoteCount: Array.isArray(question.upvotes) ? question.upvotes.length : 0
        }));

        res.render('qa', {
            title: 'Bảng Cầu Cứu',
            user: req.user,
            questions: feed,
            filters,
            subjects: QUESTION_SUBJECTS,
            grades: QUESTION_GRADES,
            sidebar,
            breadcrumbs: buildBreadcrumbsForHub(),
            metaTitle: 'Bảng Cầu Cứu | Học Tập Thủ Đức',
            metaDescription: 'Không học một mình. Vào Bảng Cầu Cứu để hỏi bài, treo thưởng, xem cao thủ giải đề và theo dõi cộng đồng học thuật.',
            metaUrl: buildAbsoluteUrl(res.locals.siteOrigin, '/qa'),
            activePage: 'qa'
        });
    } catch (error) {
        console.error('QA Hub Error:', error);
        req.flash('error', 'Không thể tải Bảng Cầu Cứu lúc này.');
        res.redirect('/');
    }
};

exports.getQaFeed = async (req, res) => {
    try {
        const { filters, sidebar, feed } = await loadQaFeedState(req);
        res.render('qa', {
            title: 'Diễn đàn câu hỏi',
            user: req.user,
            questions: feed,
            filters,
            subjects: QUESTION_SUBJECTS,
            grades: QUESTION_GRADES,
            sidebar,
            breadcrumbs: [
                { label: 'Trang chủ', url: '/' },
                { label: 'Bảng Cầu Cứu', url: '/qa' },
                { label: 'Dòng câu hỏi', url: null }
            ],
            metaTitle: 'Dòng câu hỏi | Học Tập Thủ Đức',
            metaDescription: 'Theo dõi các câu hỏi mới nhất, bài đang hot, bài chưa có lời giải và những chủ đề được hỏi nhiều nhất.',
            metaUrl: buildAbsoluteUrl(res.locals.siteOrigin, '/qa/questions'),
            activePage: 'qa'
        });
    } catch (error) {
        console.error('QA Feed Error:', error);
        req.flash('error', 'Không thể tải dòng câu hỏi.');
        res.redirect('/qa');
    }
};

exports.getQaAskPage = async (req, res) => {
    try {
        const sidebar = await buildSidebarPayload();
        res.render('qaAsk', {
            title: 'Đăng câu hỏi mới',
            user: req.user,
            subjects: QUESTION_SUBJECTS,
            grades: QUESTION_GRADES,
            sidebar,
            breadcrumbs: [
                { label: 'Trang chủ', url: '/' },
                { label: 'Bảng Cầu Cứu', url: '/qa' },
                { label: 'Đăng câu hỏi', url: null }
            ],
            metaTitle: 'Đăng câu hỏi | Học Tập Thủ Đức',
            metaDescription: 'Đăng bài khó, treo thưởng vàng và mô tả rõ vấn đề để nhận lời giải chất lượng từ cộng đồng học tập.',
            metaUrl: buildAbsoluteUrl(res.locals.siteOrigin, '/qa/ask'),
            activePage: 'qa'
        });
    } catch (error) {
        console.error('QA Ask Page Error:', error);
        req.flash('error', 'Không thể mở trang đăng câu hỏi.');
        res.redirect('/qa');
    }
};

exports.getQaCommunityPage = async (req, res) => {
    try {
        const sidebar = await buildSidebarPayload();
        res.render('qaCommunity', {
            title: 'Cộng đồng học thuật',
            user: req.user,
            sidebar,
            breadcrumbs: [
                { label: 'Trang chủ', url: '/' },
                { label: 'Bảng Cầu Cứu', url: '/qa' },
                { label: 'Cộng đồng', url: null }
            ],
            metaTitle: 'Cộng đồng học thuật | Học Tập Thủ Đức',
            metaDescription: 'Theo dõi top contributor, hot tags và nhịp trao đổi học thuật đang sôi động trên HTTD.',
            metaUrl: buildAbsoluteUrl(res.locals.siteOrigin, '/qa/community'),
            activePage: 'qa'
        });
    } catch (error) {
        console.error('QA Community Error:', error);
        req.flash('error', 'Không thể tải trang cộng đồng.');
        res.redirect('/qa');
    }
};

exports.getQuestionDetail = async (req, res) => {
    try {
        const questionId = asObjectId(req.params.id);
        if (!questionId) {
            req.flash('error', 'Câu hỏi không hợp lệ.');
            return res.redirect('/qa');
        }

        const question = await Question.findById(questionId)
            .populate('author', 'username avatar isPro points guildRole')
            .lean();

        if (!question) {
            req.flash('error', 'Không tìm thấy câu hỏi này.');
            return res.redirect('/qa');
        }

        const canonicalPath = buildQuestionPath(question);
        const canonicalSlug = canonicalPath.split('/').pop();
        if (req.params.slug !== canonicalSlug) {
            return res.redirect(301, canonicalPath);
        }

        const [answers, sidebar, relatedQuestions] = await Promise.all([
            Answer.find({ question: questionId })
                .populate('author', 'username avatar isPro points guildRole')
                .populate('comments.author', 'username avatar isPro points')
                .sort({ isAccepted: -1, createdAt: 1 })
                .lean(),
            buildSidebarPayload(),
            Question.find({
                _id: { $ne: questionId },
                subject: question.subject,
                grade: question.grade
            })
                .sort({ createdAt: -1 })
                .limit(4)
                .populate('author', 'username avatar isPro points')
                .lean()
        ]);

        Question.updateOne({ _id: questionId }, { $inc: { viewCount: 1 } }).catch(() => null);

        const answerCards = answers.map((answer) => ({
            ...answer,
            tier: buildTier(answer.author?.points || 0),
            upvoteCount: Array.isArray(answer.upvotes) ? answer.upvotes.length : 0
        }));

        const viewerId = req.user ? String(req.user._id) : '';
        const detailQuestion = {
            ...question,
            previewText: questionPreviewText(question),
            tier: buildTier(question.author?.points || 0),
            upvoteCount: Array.isArray(question.upvotes) ? question.upvotes.length : 0,
            href: canonicalPath,
            viewerCanAccept: viewerId && String(question.author?._id || question.author) === viewerId && !question.acceptedAnswer
        };

        res.render('qaDetail', {
            title: question.title,
            user: req.user,
            question: detailQuestion,
            answers: answerCards,
            relatedQuestions: relatedQuestions.map((item) => ({
                ...item,
                previewText: questionPreviewText(item),
                href: buildQuestionPath(item)
            })),
            sidebar,
            subjects: QUESTION_SUBJECTS,
            grades: QUESTION_GRADES,
            breadcrumbs: buildBreadcrumbsForQuestion(question),
            metaTitle: `${question.title} | Bảng Cầu Cứu`,
            metaDescription: questionPreviewText(question),
            metaImage: question.images?.[0] || 'https://i.ibb.co/QBLckWj/Gemini-Generated-Image-wt3dr4wt3dr4wt3d-removebg-preview.png',
            metaUrl: buildAbsoluteUrl(res.locals.siteOrigin, canonicalPath),
            activePage: 'qa'
        });
    } catch (error) {
        console.error('QA Detail Error:', error);
        req.flash('error', 'Không thể tải chi tiết câu hỏi.');
        res.redirect('/qa');
    }
};

exports.createQuestion = async (req, res) => {
    const title = normalizeString(req.body.title);
    const content = normalizeContent(req.body.content);
    const subject = QUESTION_SUBJECTS.includes(req.body.subject) ? req.body.subject : 'Khác';
    const grade = QUESTION_GRADES.includes(req.body.grade) ? req.body.grade : 'Chung';
    const images = parseImagesInput(req.body.images);
    const bountyAmount = clamp(Math.floor(sanitizeNumber(req.body.bountyAmount, 0)), 0, MAX_BOUNTY);

    if (!title || !content) {
        return respondError(req, res, 400, 'Tiêu đề và nội dung câu hỏi là bắt buộc.', '/qa');
    }

    let reservedBounty = 0;
    let bountyGardenId = null;

    try {
        if (bountyAmount > 0) {
            const askerGarden = await Garden.findOne({ user: req.user._id });
            const currentGold = sanitizeNumber(askerGarden?.gold, 0);
            if (!askerGarden || currentGold < bountyAmount) {
                return respondError(req, res, 400, 'Không đủ vàng để treo thưởng câu hỏi này.', '/qa');
            }

            askerGarden.gold = currentGold - bountyAmount;
            await askerGarden.save();
            reservedBounty = bountyAmount;
            bountyGardenId = askerGarden._id;
        }

        const question = await Question.create({
            author: req.user._id,
            title,
            content,
            images,
            subject,
            grade,
            bountyAmount
        });

        return respond(
            req,
            res,
            { question },
            buildQuestionPath(question),
            'Đã treo câu hỏi lên Bảng Cầu Cứu.'
        );
    } catch (error) {
        if (reservedBounty > 0 && bountyGardenId) {
            await Garden.updateOne({ _id: bountyGardenId }, { $inc: { gold: reservedBounty } }).catch(() => null);
        }
        console.error('Create Question Error:', error);
        return respondError(req, res, 500, 'Không thể đăng câu hỏi lúc này.', '/qa');
    }
};

exports.createAnswer = async (req, res) => {
    const questionId = asObjectId(req.body.questionId);
    const content = normalizeContent(req.body.content);
    const images = parseImagesInput(req.body.images);

    if (!questionId || !content) {
        return respondError(req, res, 400, 'Cần chọn câu hỏi hợp lệ và nhập lời giải.', '/qa');
    }

    try {
        const question = await Question.findById(questionId).select('_id status');
        if (!question) {
            return respondError(req, res, 404, 'Không tìm thấy câu hỏi để trả lời.', '/qa');
        }
        if (question.status === 'closed') {
            return respondError(req, res, 400, 'Câu hỏi này đã đóng, không thể gửi thêm lời giải.', `/qa/questions/${questionId}`);
        }

        const answer = await Answer.create({
            question: questionId,
            author: req.user._id,
            content,
            images
        });

        await Question.updateOne({ _id: questionId }, { $inc: { answerCount: 1 } });

        return respond(
            req,
            res,
            { answer },
            `${buildQuestionPath({ _id: questionId })}#answer-${answer._id}`,
            'Lời giải của bạn đã được gửi.'
        );
    } catch (error) {
        console.error('Create Answer Error:', error);
        return respondError(req, res, 500, 'Không thể gửi lời giải lúc này.', `/qa/questions/${req.body.questionId || ''}`);
    }
};

exports.upvoteAnswer = async (req, res) => {
    try {
        const answerId = asObjectId(req.params.id);
        if (!answerId) {
            return respondError(req, res, 400, 'Câu trả lời không hợp lệ.', '/qa');
        }

        const answer = await Answer.findById(answerId)
            .populate('author', '_id username guild points totalPoints')
            .select('author upvotes question');

        if (!answer || !answer.author) {
            return respondError(req, res, 404, 'Không tìm thấy câu trả lời.', '/qa');
        }

        if (String(answer.author._id) === String(req.user._id)) {
            return respondError(req, res, 400, 'Bạn không thể tự upvote câu trả lời của mình.', `/qa/questions/${answer.question}`);
        }

        const hasUpvoted = answer.upvotes.some((voteId) => String(voteId) === String(req.user._id));
        if (hasUpvoted) {
            answer.upvotes.pull(req.user._id);
            await adjustUserRewards(answer.author._id, {
                goldDelta: -ANSWER_UPVOTE_GOLD,
                pointDelta: -ANSWER_UPVOTE_POINTS
            });
        } else {
            answer.upvotes.push(req.user._id);
            await adjustUserRewards(answer.author._id, {
                goldDelta: ANSWER_UPVOTE_GOLD,
                pointDelta: ANSWER_UPVOTE_POINTS
            });
        }

        await answer.save();

        return respond(
            req,
            res,
            {
                upvoted: !hasUpvoted,
                upvoteCount: answer.upvotes.length
            },
            `${buildQuestionPath({ _id: answer.question })}#answer-${answer._id}`,
            hasUpvoted ? 'Đã rút lại upvote.' : 'Đã upvote câu trả lời.'
        );
    } catch (error) {
        console.error('Upvote Answer Error:', error);
        return respondError(req, res, 500, 'Không thể cập nhật upvote lúc này.', '/qa');
    }
};

exports.acceptAnswer = async (req, res) => {
    try {
        const answerId = asObjectId(req.params.id);
        if (!answerId) {
            return respondError(req, res, 400, 'Câu trả lời không hợp lệ.', '/qa');
        }

        const answer = await Answer.findById(answerId)
            .populate('question')
            .populate('author', '_id guild')
            .select('question author isAccepted');

        if (!answer || !answer.question) {
            return respondError(req, res, 404, 'Không tìm thấy đáp án này.', '/qa');
        }

        const question = answer.question;
        if (String(question.author) !== String(req.user._id)) {
            return respondError(req, res, 403, 'Chỉ người hỏi mới được chốt đáp án.', `/qa/questions/${question._id}`);
        }

        if (question.acceptedAnswer && String(question.acceptedAnswer) !== String(answer._id)) {
            return respondError(req, res, 400, 'Câu hỏi này đã có đáp án được chốt rồi.', `/qa/questions/${question._id}`);
        }

        if (answer.isAccepted && question.status === 'resolved') {
            return respond(req, res, { answer }, `/qa/questions/${question._id}#answer-${answer._id}`, 'Đáp án này đã được chốt trước đó.');
        }

        await Answer.updateMany(
            { question: question._id, _id: { $ne: answer._id } },
            { $set: { isAccepted: false } }
        );

        answer.isAccepted = true;
        await answer.save();

        question.status = 'resolved';
        question.acceptedAnswer = answer._id;
        await question.save();

        await adjustUserRewards(answer.author._id, {
            goldDelta: ACCEPT_ANSWER_GOLD + Math.max(0, sanitizeNumber(question.bountyAmount, 0)),
            pointDelta: ACCEPT_ANSWER_POINTS
        });

        return respond(
            req,
            res,
            { answer },
            `/qa/questions/${question._id}#answer-${answer._id}`,
            'Đã chốt đáp án tốt nhất.'
        );
    } catch (error) {
        console.error('Accept Answer Error:', error);
        return respondError(req, res, 500, 'Không thể chốt đáp án lúc này.', '/qa');
    }
};

exports.addComment = async (req, res) => {
    try {
        const answerId = asObjectId(req.params.id);
        const content = normalizeContent(req.body.content);
        if (!answerId || !content) {
            return respondError(req, res, 400, 'Nội dung thảo luận không hợp lệ.', '/qa');
        }

        const answer = await Answer.findById(answerId).select('_id question comments');
        if (!answer) {
            return respondError(req, res, 404, 'Không tìm thấy câu trả lời để thảo luận.', '/qa');
        }

        answer.comments.push({
            author: req.user._id,
            content
        });
        await answer.save();

        return respond(
            req,
            res,
            { commentCount: answer.comments.length },
            `/qa/questions/${answer.question}#answer-${answer._id}`,
            'Đã thêm bình luận thảo luận.'
        );
    } catch (error) {
        console.error('Add Comment Error:', error);
        return respondError(req, res, 500, 'Không thể gửi bình luận lúc này.', '/qa');
    }
};

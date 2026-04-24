const assert = require('assert');
const path = require('path');
const ejs = require('ejs');

const adminController = require('../controllers/adminController');
const { adminCsrfGuard } = require('../middlewares/adminCsrf');
const { safeAdminReturnTo, buildAdminUrl } = require('../utils/adminHelpers');
const {
    updateUserRoles,
    setUserBanState,
    toggleCoursePublish,
    saveNewsRecord,
    updateQuestionStatus,
    moderateComment,
    reviewGuildApplicationFromAdmin,
    saveAchievementType
} = require('../services/adminMutationService');

function renderEjs(file, locals) {
    return new Promise((resolve, reject) => {
        ejs.renderFile(file, locals, {}, (error, html) => {
            if (error) return reject(error);
            return resolve(html);
        });
    });
}

async function runTest(name, fn) {
    try {
        await fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}

function createResponse() {
    return {
        locals: {},
        statusCode: 200,
        redirectPath: null,
        jsonBody: null,
        sentBody: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        redirect(pathname) {
            this.redirectPath = pathname;
            return this;
        },
        json(payload) {
            this.jsonBody = payload;
            return this;
        },
        send(payload) {
            this.sentBody = payload;
            return this;
        }
    };
}

function createBaseRenderLocals() {
    return {
        title: 'Admin Backoffice',
        key: 'overview',
        path: '/admin/overview',
        pageTitle: 'Trang kiểm thử',
        pageDescription: 'Smoke test cho layout admin.',
        summaryCards: [{ label: 'Users', value: '12', icon: 'fa-users', tone: 'accent', meta: 'active' }],
        navGroups: [{ label: 'Ops', items: [{ href: '/admin/overview', icon: 'fa-chart-line', label: 'Overview', active: true }] }],
        user: { _id: 'user-1', username: 'admin', avatar: '' },
        message: { type: null, message: '' },
        currentUrl: '/admin/overview',
        adminCsrfToken: 'csrf-token',
        clientData: { charts: {} },
        contextPanels: [{ title: 'Queue', kicker: 'Ops', rows: [{ label: 'Pending', value: '4' }] }],
        filters: {
            q: '',
            status: '',
            sort: 'newest',
            page: 1,
            pageSize: 12,
            subjectId: '',
            authorId: '',
            dateFrom: '',
            dateTo: ''
        },
        pagination: { page: 1, totalPages: 1, hasPrev: false, hasNext: false },
        buildAdminUrl,
        formatDate: (value) => new Date(value).toLocaleDateString('vi-VN'),
        formatDateTime: (value) => new Date(value).toLocaleString('vi-VN'),
        formatNumber: (value) => Number(value || 0).toLocaleString('vi-VN'),
        formatBytes: (value) => `${value || 0} B`
    };
}

async function main() {
    await runTest('safeAdminReturnTo only allows admin paths', () => {
        assert.strictEqual(safeAdminReturnTo('/admin/users'), '/admin/users');
        assert.strictEqual(safeAdminReturnTo('/login', '/admin/overview'), '/admin/overview');
    });

    await runTest('buildAdminUrl keeps query params stable', () => {
        assert.strictEqual(
            buildAdminUrl('/admin/users', { q: 'alice', page: 2 }, { detailId: 'u1' }),
            '/admin/users?q=alice&page=2&detailId=u1'
        );
    });

    await runTest('adminCsrfGuard seeds token on safe requests', async () => {
        const req = {
            method: 'GET',
            session: {},
            body: {},
            path: '/admin/overview',
            get: () => '',
            accepts: () => 'html',
            flash: () => {}
        };
        const res = createResponse();
        let nextCalled = false;

        await adminCsrfGuard(req, res, () => {
            nextCalled = true;
        });

        assert.ok(nextCalled);
        assert.ok(req.session.adminCsrfToken);
        assert.strictEqual(res.locals.adminCsrfToken, req.session.adminCsrfToken);
    });

    await runTest('adminCsrfGuard blocks invalid admin post', async () => {
        const flashes = [];
        const req = {
            method: 'POST',
            session: { adminCsrfToken: 'valid-token' },
            body: {},
            path: '/admin/users',
            get: (header) => (header === 'referer' ? '/admin/users' : ''),
            accepts: () => 'html',
            flash: (type, message) => flashes.push({ type, message })
        };
        const res = createResponse();

        await adminCsrfGuard(req, res, () => {
            throw new Error('next should not be called');
        });

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.redirectPath, '/admin/users');
        assert.strictEqual(flashes.length, 1);
    });

    await runTest('adminCsrfGuard allows valid admin post token', async () => {
        const req = {
            method: 'POST',
            session: { adminCsrfToken: 'valid-token' },
            body: { _csrf: 'valid-token' },
            path: '/admin/users',
            get: () => '',
            accepts: () => 'html',
            flash: () => {}
        };
        const res = createResponse();
        let nextCalled = false;

        await adminCsrfGuard(req, res, () => {
            nextCalled = true;
        });

        assert.ok(nextCalled);
    });

    await runTest('redirectAdminEntry maps legacy tabs to new routes', async () => {
        const req = { query: { tab: 'users', q: 'alice' } };
        const res = createResponse();

        await adminController.redirectAdminEntry(req, res);
        assert.strictEqual(res.redirectPath, '/admin/users?q=alice');
    });

    await runTest('updateUserRoles prevents non-owner admin escalation', async () => {
        let auditPayload = null;
        const targetUser = {
            _id: 'user-2',
            username: 'member',
            isAdmin: false,
            isTeacher: false,
            isPro: false,
            proSecretKey: '',
            async save() {
                return this;
            }
        };

        await updateUserRoles({
            actor: { _id: 'admin-1', username: 'another-admin', isAdmin: true },
            targetUserId: 'user-2',
            isAdmin: 'on',
            isTeacher: 'on',
            isPro: 'on',
            proSecretKey: 'pro-key'
        }, {
            User: { findById: async () => targetUser },
            recordAdminAction: async (payload) => {
                auditPayload = payload;
            }
        });

        assert.strictEqual(targetUser.isAdmin, false);
        assert.strictEqual(targetUser.isTeacher, true);
        assert.strictEqual(targetUser.isPro, true);
        assert.strictEqual(targetUser.proSecretKey, 'pro-key');
        assert.strictEqual(auditPayload.action, 'update_roles');
    });

    await runTest('setUserBanState creates and removes ban fingerprints', async () => {
        const createdEntries = [];
        const removedQueries = [];
        const targetUser = {
            _id: 'user-ban',
            username: 'blocked-user',
            lastLoginIP: '127.0.0.1',
            lastLoginUA: 'Mozilla/5.0',
            isBanned: false,
            async save() {
                return this;
            }
        };

        await setUserBanState({
            actor: { _id: 'admin-1', username: 'owner-admin', isAdmin: true },
            targetUserId: 'user-ban',
            banned: true,
            reason: 'spam'
        }, {
            User: { findById: async () => targetUser },
            BanEntry: {
                create: async (payload) => createdEntries.push(payload),
                deleteMany: async (payload) => removedQueries.push(payload)
            },
            recordAdminAction: async () => {}
        });

        assert.strictEqual(targetUser.isBanned, true);
        assert.strictEqual(createdEntries.length, 1);

        await setUserBanState({
            actor: { _id: 'admin-1', username: 'owner-admin', isAdmin: true },
            targetUserId: 'user-ban',
            banned: false
        }, {
            User: { findById: async () => targetUser },
            BanEntry: {
                create: async (payload) => createdEntries.push(payload),
                deleteMany: async (payload) => removedQueries.push(payload)
            },
            recordAdminAction: async () => {}
        });

        assert.strictEqual(targetUser.isBanned, false);
        assert.strictEqual(removedQueries.length, 1);
    });

    await runTest('toggleCoursePublish updates publish state', async () => {
        let logged = null;
        const course = {
            _id: 'course-1',
            title: 'Math Sprint',
            isPublished: false,
            async save() {
                return this;
            }
        };

        await toggleCoursePublish({
            actor: { _id: 'admin-1', username: 'admin', isAdmin: true },
            courseId: 'course-1',
            isPublished: true
        }, {
            Course: { findById: async () => course },
            recordAdminAction: async (payload) => {
                logged = payload;
            }
        });

        assert.strictEqual(course.isPublished, true);
        assert.strictEqual(logged.action, 'publish_course');
    });

    await runTest('saveNewsRecord creates news with actor as postedBy', async () => {
        let saved = null;
        function NewsStub(initial = {}) {
            Object.assign(this, initial);
            this._id = this._id || 'news-1';
        }
        NewsStub.prototype.save = async function save() {
            saved = this;
            return this;
        };
        NewsStub.findById = async () => null;

        const actor = { _id: 'admin-1', username: 'admin', isAdmin: true };

        await saveNewsRecord({
            actor,
            title: 'Tin mới',
            content: 'Nội dung',
            category: 'Thông báo',
            image: '',
            subject: ''
        }, {
            News: NewsStub,
            recordAdminAction: async () => {}
        });

        assert.strictEqual(saved.postedBy, actor._id);
        assert.strictEqual(saved.subject, null);
    });

    await runTest('updateQuestionStatus rejects invalid values', async () => {
        await assert.rejects(
            () => updateQuestionStatus({
                actor: { _id: 'admin-1', username: 'admin', isAdmin: true },
                questionId: 'q-1',
                status: 'archived'
            }, {
                Question: { findById: async () => null },
                recordAdminAction: async () => {}
            }),
            /Trạng thái câu hỏi không hợp lệ/
        );
    });

    await runTest('moderateComment toggles soft delete fields', async () => {
        const comment = {
            _id: 'comment-1',
            isDeleted: false,
            deletedAt: null,
            async save() {
                return this;
            }
        };

        await moderateComment({
            actor: { _id: 'admin-1', username: 'admin', isAdmin: true },
            commentId: 'comment-1',
            action: 'delete'
        }, {
            Comment: { findById: async () => comment },
            recordAdminAction: async () => {}
        });

        assert.strictEqual(comment.isDeleted, true);
        assert.ok(comment.deletedAt instanceof Date);

        await moderateComment({
            actor: { _id: 'admin-1', username: 'admin', isAdmin: true },
            commentId: 'comment-1',
            action: 'restore'
        }, {
            Comment: { findById: async () => comment },
            recordAdminAction: async () => {}
        });

        assert.strictEqual(comment.isDeleted, false);
        assert.strictEqual(comment.deletedAt, null);
    });

    await runTest('reviewGuildApplicationFromAdmin writes guild audit log', async () => {
        let guildAuditPayload = null;
        const application = {
            _id: 'application-1',
            applicant: 'user-22',
            guild: { _id: 'guild-1', name: 'Sky Guild' },
            status: 'pending',
            reviewedBy: null,
            reviewedAt: null,
            reviewNote: '',
            async save() {
                return this;
            }
        };

        await reviewGuildApplicationFromAdmin({
            actor: { _id: 'admin-1', username: 'admin', isAdmin: true },
            applicationId: 'application-1',
            decision: 'approved',
            reviewNote: 'Ổn'
        }, {
            GuildApplication: {
                findById: () => ({
                    populate: async () => application
                })
            },
            GuildAuditLog: {
                create: async (payload) => {
                    guildAuditPayload = payload;
                }
            },
            recordAdminAction: async () => {}
        });

        assert.strictEqual(application.status, 'approved');
        assert.strictEqual(guildAuditPayload.guild, 'guild-1');
        assert.strictEqual(guildAuditPayload.actionType, 'application_approved');
    });

    await runTest('saveAchievementType defaults active flag to true when omitted', async () => {
        let savedAchievement = null;
        function AchievementStub() {
            this._id = 'achievement-1';
        }
        AchievementStub.prototype.save = async function save() {
            savedAchievement = this;
            return this;
        };
        AchievementStub.findById = async () => null;
        AchievementStub.findOne = async () => null;

        await saveAchievementType({
            actor: { _id: 'admin-1', username: 'admin', isAdmin: true },
            id: 'study_starter',
            name: 'Study Starter',
            description: 'Unlock after first lesson',
            category: 'learning',
            rarity: 'common',
            conditionType: 'lessons_completed',
            conditionValue: 1,
            conditionOperator: '>=',
            isHidden: '',
            isActive: ''
        }, {
            AchievementType: AchievementStub,
            recordAdminAction: async () => {}
        });

        assert.strictEqual(savedAchievement.isActive, true);
        assert.strictEqual(savedAchievement.condition.type, 'lessons_completed');
    });

    await runTest('admin overview shell renders with dynamic includes', async () => {
        const file = path.join(process.cwd(), 'views', 'admin', 'index.ejs');
        const html = await renderEjs(file, {
            ...createBaseRenderLocals(),
            key: 'overview',
            mainPartial: 'admin/partials/pages/overview',
            asidePartial: 'admin/partials/asides/cards',
            recentActivity: [{ title: 'User mới', meta: 'alice', tone: 'accent', createdAt: new Date() }]
        });

        assert.ok(html.includes('Admin Ops'));
        assert.ok(html.includes('overviewGrowthChart'));
    });

    await runTest('admin users shell renders management rail', async () => {
        const file = path.join(process.cwd(), 'views', 'admin', 'index.ejs');
        const html = await renderEjs(file, {
            ...createBaseRenderLocals(),
            key: 'users',
            path: '/admin/users',
            mainPartial: 'admin/partials/pages/users',
            asidePartial: 'admin/partials/asides/users',
            users: [{
                _id: 'user-2',
                username: 'alice',
                email: 'alice@example.com',
                isAdmin: false,
                isTeacher: false,
                isPro: true,
                isBanned: false,
                points: 42,
                activity: { minutes: 120 }
            }],
            selectedUser: {
                _id: 'user-2',
                username: 'alice',
                email: 'alice@example.com',
                isAdmin: false,
                isTeacher: false,
                isPro: true,
                isBanned: false,
                proSecretKey: '',
                lastLoginIP: '127.0.0.1'
            },
            selectedUserMetrics: { minutes: 120, lastActive: new Date() },
            selectedUserLogs: [{ summary: 'Đổi quyền', actor: { username: 'admin' }, createdAt: new Date() }]
        });

        assert.ok(html.includes('Chi tiết user'));
        assert.ok(html.includes('/admin/users/user-2/roles'));
    });

    await runTest('admin news shell renders editor rail', async () => {
        const file = path.join(process.cwd(), 'views', 'admin', 'index.ejs');
        const html = await renderEjs(file, {
            ...createBaseRenderLocals(),
            key: 'news',
            path: '/admin/content/news',
            mainPartial: 'admin/partials/pages/news',
            asidePartial: 'admin/partials/asides/news',
            subjectOptions: [{ _id: 'subject-1', name: 'Toán' }],
            authorOptions: [{ _id: 'author-1', username: 'teacher-a' }],
            newsItems: [{
                _id: 'news-1',
                title: 'Tin số 1',
                content: 'Nội dung',
                category: 'Thông báo',
                subject: { _id: 'subject-1', name: 'Toán' },
                postedBy: { username: 'teacher-a' },
                createdAt: new Date()
            }],
            selectedNews: {
                _id: 'news-1',
                title: 'Tin số 1',
                content: 'Nội dung',
                category: 'Thông báo',
                subject: { _id: 'subject-1', name: 'Toán' },
                image: ''
            }
        });

        assert.ok(html.includes('News editor'));
        assert.ok(html.includes('/admin/content/news/save'));
    });

    await runTest('admin questions shell renders moderation rail', async () => {
        const file = path.join(process.cwd(), 'views', 'admin', 'index.ejs');
        const html = await renderEjs(file, {
            ...createBaseRenderLocals(),
            key: 'questions',
            path: '/admin/community/questions',
            mainPartial: 'admin/partials/pages/questions',
            asidePartial: 'admin/partials/asides/questions',
            authorOptions: [{ _id: 'author-1', username: 'student-a' }],
            questionSubjects: ['Toán'],
            questions: [{
                _id: 'question-1',
                title: 'Giúp em bài này',
                content: 'Nội dung câu hỏi',
                author: { username: 'student-a' },
                subject: 'Toán',
                grade: '12',
                answerCount: 0,
                viewCount: 25
            }],
            selectedQuestion: {
                _id: 'question-1',
                title: 'Giúp em bài này',
                content: 'Nội dung câu hỏi',
                author: { username: 'student-a' },
                subject: 'Toán',
                grade: '12',
                status: 'open',
                bountyAmount: 10,
                viewCount: 25,
                answerCount: 0,
                createdAt: new Date()
            }
        });

        assert.ok(html.includes('Question moderation'));
        assert.ok(html.includes('/admin/community/questions/question-1/status'));
    });

    await runTest('admin achievements shell renders editor rail', async () => {
        const file = path.join(process.cwd(), 'views', 'admin', 'index.ejs');
        const html = await renderEjs(file, {
            ...createBaseRenderLocals(),
            key: 'achievements',
            path: '/admin/gamification/achievements',
            mainPartial: 'admin/partials/pages/achievements',
            asidePartial: 'admin/partials/asides/achievements',
            achievements: [{
                _id: 'achievement-1',
                id: 'study_starter',
                icon: '🏆',
                name: 'Study Starter',
                category: 'learning',
                rarity: 'common',
                condition: { type: 'lessons_completed', operator: '>=', value: 1 },
                isActive: true,
                isHidden: false
            }],
            selectedAchievement: {
                _id: 'achievement-1',
                id: 'study_starter',
                icon: '🏆',
                name: 'Study Starter',
                description: 'Unlock after first lesson',
                color: '#0aa889',
                category: 'learning',
                rarity: 'common',
                points: 25,
                condition: { type: 'lessons_completed', operator: '>=', value: 1 },
                unlockMessage: 'Bạn đã bắt đầu rồi đấy!',
                isActive: true,
                isHidden: false,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            selectedAchievementUnlocks: 8
        });

        assert.ok(html.includes('Achievement editor'));
        assert.ok(html.includes('/admin/gamification/achievements/save'));
    });

    console.log('Admin backoffice tests OK.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

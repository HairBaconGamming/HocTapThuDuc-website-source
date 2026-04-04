const realmHelper = require('../utils/realmHelper');
const guildTreeAssets = require('../config/guildTreeAssets');
const { ensureGarden } = require('../services/gardenRewardService');
const { getInventorySnapshot } = require('../services/gardenInventoryService');
const {
    MIN_CREATE_LEVEL,
    getUserGuildContext,
    listGuilds,
    createGuild,
    joinGuild,
    leaveGuild,
    getGuildBySlug,
    GuildServiceError
} = require('../services/guildService');
const { contributeToGuild } = require('../services/guildContributionService');

function handleGuildError(req, res, error, fallbackRedirect = '/guilds') {
    if (error instanceof GuildServiceError) {
        req.flash('error', error.message);
        return res.redirect(fallbackRedirect);
    }

    console.error(error);
    req.flash('error', 'Da co loi xay ra voi Tong Mon.');
    return res.redirect(fallbackRedirect);
}

exports.getGuildHub = async (req, res) => {
    try {
        const guildContext = await getUserGuildContext(req.user._id);
        if (guildContext.guild) {
            return res.redirect(`/guilds/${guildContext.guild.slug}`);
        }

        const guilds = await listGuilds();
        const realmInfo = realmHelper.getRealmData(req.user.level || 0);

        res.render('guilds', {
            title: 'Tong Mon',
            user: req.user,
            guilds,
            realmInfo,
            minCreateLevel: MIN_CREATE_LEVEL,
            canCreateGuild: (req.user.level || 0) >= MIN_CREATE_LEVEL,
            activePage: 'guilds'
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Khong the tai Tong Mon luc nay.');
        res.redirect('/dashboard');
    }
};

exports.createGuild = async (req, res) => {
    try {
        const guild = await createGuild({
            userId: req.user._id,
            name: req.body.name,
            description: req.body.description
        });

        req.flash('success', `Da khai tong ${guild.name}!`);
        res.redirect(`/guilds/${guild.slug}`);
    } catch (error) {
        handleGuildError(req, res, error);
    }
};

exports.joinGuild = async (req, res) => {
    try {
        const guild = await joinGuild({
            userId: req.user._id,
            guildIdOrSlug: req.params.slug
        });

        req.flash('success', `Da gia nhap ${guild.name}.`);
        res.redirect(`/guilds/${guild.slug}`);
    } catch (error) {
        handleGuildError(req, res, error);
    }
};

exports.leaveGuild = async (req, res) => {
    try {
        await leaveGuild({ userId: req.user._id });
        req.flash('success', 'Ban da roi Tong Mon.');
        res.redirect('/guilds');
    } catch (error) {
        handleGuildError(req, res, error, req.get('referer') || '/guilds');
    }
};

exports.getGuildDetail = async (req, res) => {
    try {
        const guildDetail = await getGuildBySlug(req.params.slug);
        if (!guildDetail) {
            req.flash('error', 'Tong Mon khong ton tai.');
            return res.redirect('/guilds');
        }

        const viewerContext = await getUserGuildContext(req.user._id);
        const viewerGarden = await ensureGarden(req.user._id);
        const inventory = getInventorySnapshot(viewerGarden);
        const isMember = Boolean(viewerContext.guild && String(viewerContext.guild._id) === String(guildDetail.guild._id));
        const isLeader = isMember && String(guildDetail.guild.leader?._id || guildDetail.guild.leader) === String(req.user._id);
        const canJoin = !viewerContext.guild && (req.user.level || 0) >= (guildDetail.guild.levelRequirement || 0);

        res.render('guild', {
            title: guildDetail.guild.name,
            user: req.user,
            guildDetail,
            guildTreeAssets,
            viewerContext,
            viewerResources: {
                water: viewerGarden.water || 0,
                fertilizer: viewerGarden.fertilizer || 0,
                gold: viewerGarden.gold || 0,
                inventory
            },
            isMember,
            isLeader,
            canJoin,
            activePage: 'guilds'
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Khong the mo Tong Mon nay.');
        res.redirect('/guilds');
    }
};

exports.contribute = async (req, res) => {
    try {
        const result = await contributeToGuild({
            userId: req.user._id,
            resourceType: req.body.resourceType,
            amount: req.body.amount
        });

        req.flash('success', result.message);
        res.redirect(`/guilds/${result.guildDetail.guild.slug}`);
    } catch (error) {
        handleGuildError(req, res, error, req.get('referer') || '/guilds');
    }
};

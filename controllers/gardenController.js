const Garden = require('../models/Garden');
const ASSETS = require('../config/gardenAssets');
const {
    buildGardenViewData,
    syncGardenState
} = require('../services/gardenStateService');
const { ensureGarden } = require('../services/gardenRewardService');
const {
    GardenActionError,
    buyItem,
    moveItem,
    interactItem,
    removeItem,
    saveCamera,
    updateTutorialStep
} = require('../services/gardenMutationService');
const { claimDailyQuest } = require('../services/gardenQuestService');

function handleGardenError(res, error) {
    if (error instanceof GardenActionError) {
        return res.status(error.status).json({
            success: false,
            msg: error.message
        });
    }

    console.error(error);
    return res.status(500).json({
        success: false,
        msg: 'Lỗi server'
    });
}

exports.getGarden = async (req, res) => {
    try {
        const garden = await ensureGarden(req.user._id);
        await syncGardenState(garden, { persist: false });

        res.render('garden', {
            title: 'Nông Trại Vui Vẻ',
            user: req.user,
            garden: buildGardenViewData(garden, req.user),
            isOwner: true,
            assets: ASSETS
        });
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

exports.buyItem = async (req, res) => {
    try {
        const result = await buyItem({
            userId: req.user._id,
            itemId: req.body.itemId,
            type: req.body.type,
            x: req.body.x,
            y: req.body.y
        });

        res.json(result);
    } catch (error) {
        handleGardenError(res, error);
    }
};

exports.moveItem = async (req, res) => {
    try {
        const result = await moveItem({
            userId: req.user._id,
            uniqueId: req.body.uniqueId,
            x: req.body.x,
            y: req.body.y
        });

        res.json(result);
    } catch (error) {
        handleGardenError(res, error);
    }
};

exports.interactItem = async (req, res) => {
    try {
        const result = await interactItem({
            userId: req.user._id,
            uniqueId: req.body.uniqueId,
            action: req.body.action
        });

        res.json(result);
    } catch (error) {
        handleGardenError(res, error);
    }
};

exports.removeItem = async (req, res) => {
    try {
        const result = await removeItem({
            userId: req.user._id,
            uniqueId: req.body.uniqueId
        });

        res.json(result);
    } catch (error) {
        handleGardenError(res, error);
    }
};

exports.saveCamera = async (req, res) => {
    try {
        const result = await saveCamera({
            userId: req.user._id,
            x: req.body.x,
            y: req.body.y,
            zoom: req.body.zoom
        });

        res.json(result);
    } catch (error) {
        handleGardenError(res, error);
    }
};

exports.visitGarden = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        if (req.user._id.toString() === targetUserId) {
            return res.redirect('/my-garden');
        }

        const garden = await Garden.findOne({ user: targetUserId }).populate('user');
        if (!garden || !garden.user) {
            return res.render('error', { message: 'Vườn không tồn tại!' });
        }

        await syncGardenState(garden, { persist: false });

        res.render('garden', {
            title: `Vườn của ${garden.user.username}`,
            user: req.user,
            garden: buildGardenViewData(garden, garden.user),
            isOwner: false,
            assets: ASSETS
        });
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
};

exports.updateTutorialStep = async (req, res) => {
    try {
        const result = await updateTutorialStep({
            userId: req.user._id,
            step: req.body.step
        });

        res.json(result);
    } catch (error) {
        handleGardenError(res, error);
    }
};

exports.claimDailyQuest = async (req, res) => {
    try {
        const result = await claimDailyQuest(req.user._id, req.body.questId);
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error) {
        handleGardenError(res, error);
    }
};

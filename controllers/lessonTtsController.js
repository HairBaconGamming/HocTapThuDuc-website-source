const mongoose = require('mongoose');

const {
    DEFAULT_TTS_VOICE,
    ensureLessonTtsManifest,
    loadSegmentForStreaming
} = require('../services/lessonTtsService');

function getErrorStatus(error, fallbackStatus = 500) {
    return Number.isInteger(error && error.status) ? error.status : fallbackStatus;
}

exports.getLessonTtsManifest = async (req, res) => {
    try {
        const manifest = await ensureLessonTtsManifest({
            lessonId: req.params.id,
            user: req.user,
            preferredVoice: DEFAULT_TTS_VOICE
        });

        return res.json({
            success: true,
            ...manifest
        });
    } catch (error) {
        const status = getErrorStatus(error);

        if (status >= 500) {
            console.error('Lesson TTS manifest error:', error);
        }

        return res.status(status).json({
            success: false,
            error: error.message || 'Không thể tạo audio cho bài học lúc này.'
        });
    }
};

exports.streamLessonTtsAudio = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.segmentId)) {
            return res.status(400).send('Segment audio không hợp lệ.');
        }

        const { segment, stream } = await loadSegmentForStreaming({
            segmentId: req.params.segmentId,
            user: req.user
        });

        res.set('Content-Type', 'audio/mpeg');
        res.set('Content-Disposition', `inline; filename="lesson-${segment.lesson}-${segment.segmentIndex + 1}.mp3"`);
        res.set('Cache-Control', 'private, max-age=300');
        res.set('Accept-Ranges', 'none');

        stream.on('error', (error) => {
            console.error('Lesson TTS audio stream error:', error);
            if (!res.headersSent) {
                res.status(500).send('Không thể stream audio của bài học.');
            } else {
                res.destroy(error);
            }
        });

        stream.pipe(res);
    } catch (error) {
        const status = getErrorStatus(error);

        if (status >= 500) {
            console.error('Lesson TTS audio error:', error);
        }

        return res.status(status).send(error.message || 'Không thể tải audio của bài học.');
    }
};

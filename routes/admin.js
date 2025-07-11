const express = require('express');
const router = express.Router();

// Middleware to check if user is truonghoangnam
function isAdmin(req, res, next) {
    if (req.user && req.user.username === 'truonghoangnam') {
        return next();
    }
    return res.status(403).send('Forbidden');
}

// Admin panel page
router.get('/', isAdmin, (req, res) => {
    res.render('admin', { user: req.user });
});

module.exports = router;

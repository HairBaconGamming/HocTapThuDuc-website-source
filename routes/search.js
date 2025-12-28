// routes/search.js
const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

// GET /search
router.get('/', searchController.searchPage);
router.get('/suggest', searchController.getSuggestions);

module.exports = router;
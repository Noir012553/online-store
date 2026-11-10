const express = require('express');
const contactController = require('../controllers/contactController');
const { contactLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

router.post('/', contactLimiter, contactController.submit);

module.exports = router;

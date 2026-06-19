const express = require('express');
const router = express.Router();
const { book } = require('../controllers/bookingController');
const authMiddleware = require('../middleware/auth');

router.post('/', authMiddleware, book);

module.exports = router;

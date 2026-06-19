const express = require('express');
const router = express.Router();
const { getAllEvents, getEventById } = require('../controllers/eventController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, getAllEvents);
router.get('/:id', authMiddleware, getEventById);

module.exports = router;

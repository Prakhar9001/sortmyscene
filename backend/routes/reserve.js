const express = require('express');
const router = express.Router();
const { reserve, getMyReservation } = require('../controllers/reservationController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, getMyReservation);
router.post('/', authMiddleware, reserve);

module.exports = router;

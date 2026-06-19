const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { register, login } = require('../controllers/authController');

// Disabled only when explicitly requested via env var — used by the automated test
// suite, which legitimately registers/logs in many accounts per run. Never disabled
// in a normal dev/prod boot, since DISABLE_RATE_LIMIT is never set outside of tests.
const skipRateLimit = () => process.env.DISABLE_RATE_LIMIT === 'true';

// Login is the real credential-stuffing vector, so it stays tight: 10 attempts
// per 15 minutes per IP is generous enough for a user who mistypes a password a
// few times, but makes brute-forcing a single account impractical.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' }
});

// Registration abuse (bot/spam signups) is a different, lower-severity threat than
// credential stuffing — it gets a more generous budget so it doesn't punish bursts
// of legitimate signups (e.g. a shared office/campus IP during a popular event).
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: 'Too many registration attempts. Please try again in a few minutes.' }
});

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);

module.exports = router;

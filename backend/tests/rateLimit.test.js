// This file deliberately re-enables the limiter (every other test file disables it
// via DISABLE_RATE_LIMIT, since they need to register/login many accounts quickly).
process.env.DISABLE_RATE_LIMIT = 'false';

const request = require('supertest');
const { app, connectTestDB, clearTestDB, disconnectTestDB } = require('./testUtils');

beforeAll(connectTestDB);
afterAll(async () => {
  await disconnectTestDB();
  // Restore so this doesn't leak into other test files sharing the same process
  // under --runInBand.
  process.env.DISABLE_RATE_LIMIT = 'true';
});

describe('Rate limiting on /api/auth/login', () => {
  it('blocks after the configured number of attempts from the same client', async () => {
    await clearTestDB();

    const attempts = [];
    for (let i = 0; i < 11; i++) {
      attempts.push(
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'nobody@example.com', password: 'wrongpassword' })
      );
    }

    const blocked = attempts.filter((r) => r.status === 429);
    const authFailures = attempts.filter((r) => r.status === 401);

    // First 10 are normal auth failures; the 11th+ is rate-limited, not a credential check.
    expect(authFailures.length).toBe(10);
    expect(blocked.length).toBe(1);
    expect(attempts[10].status).toBe(429);
  }, 20000);
});

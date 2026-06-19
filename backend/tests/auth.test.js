const request = require('supertest');
const { app, connectTestDB, clearTestDB, disconnectTestDB } = require('./testUtils');

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

describe('POST /api/auth/register', () => {
  it('registers a new user successfully', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123'
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'dupe@example.com',
      password: 'password123'
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice 2',
      email: 'dupe@example.com',
      password: 'password123'
    });

    expect(res.status).toBe(409);
  });

  it('rejects a NoSQL-injection-shaped payload instead of casting it into the query', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Hacker',
      email: { $ne: null },
      password: { $ne: null }
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123'
    });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'password123'
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects an incorrect password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'wrongpassword'
    });

    expect(res.status).toBe(401);
  });

  it('rejects a NoSQL-injection-shaped email instead of matching any user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: { $ne: null },
      password: 'password123'
    });

    expect(res.status).toBe(400);
  });
});

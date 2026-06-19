const request = require('supertest');
const { app, connectTestDB, clearTestDB, disconnectTestDB } = require('./testUtils');
const Event = require('../models/Event');
const Seat = require('../models/Seat');

let token;
let eventId;

beforeAll(connectTestDB);

beforeEach(async () => {
  await clearTestDB();

  const registerRes = await request(app).post('/api/auth/register').send({
    name: 'Viewer',
    email: 'viewer@example.com',
    password: 'password123'
  });
  token = registerRes.body.token;

  const event = await Event.create({
    name: 'Test Concert',
    dateTime: new Date('2030-01-01T20:00:00Z'),
    venue: 'Test Arena',
    totalSeats: 5
  });
  eventId = event._id.toString();

  await Seat.insertMany(
    Array.from({ length: 5 }, (_, i) => ({ eventId, seatNumber: i + 1, status: 'available' }))
  );
});

afterAll(disconnectTestDB);

describe('GET /api/events', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });

  it('returns the list of events for an authenticated user', async () => {
    const res = await request(app).get('/api/events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((e) => e.name === 'Test Concert')).toBe(true);
  });
});

describe('GET /api/events/:id', () => {
  it('returns event details with seats', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.event.name).toBe('Test Concert');
    expect(res.body.seats).toHaveLength(5);
  });

  it('returns 404 for a well-formed but non-existent event id', async () => {
    const res = await request(app)
      .get('/api/events/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed event id instead of a 500', async () => {
    const res = await request(app)
      .get('/api/events/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

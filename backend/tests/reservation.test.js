const request = require('supertest');
const { app, connectTestDB, clearTestDB, disconnectTestDB } = require('./testUtils');
const Event = require('../models/Event');
const Seat = require('../models/Seat');

let tokenA;
let tokenB;
let eventId;

beforeAll(connectTestDB);

beforeEach(async () => {
  await clearTestDB();

  const a = await request(app).post('/api/auth/register').send({
    name: 'User A',
    email: 'usera@example.com',
    password: 'password123'
  });
  tokenA = a.body.token;

  const b = await request(app).post('/api/auth/register').send({
    name: 'User B',
    email: 'userb@example.com',
    password: 'password123'
  });
  tokenB = b.body.token;

  const event = await Event.create({
    name: 'Reservation Test Event',
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

describe('POST /api/reserve', () => {
  it('reserves an available seat successfully', async () => {
    const res = await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [1] });

    expect(res.status).toBe(201);
    expect(res.body.reservation.seatNumbers).toEqual([1]);

    const seat = await Seat.findOne({ eventId, seatNumber: 1 });
    expect(seat.status).toBe('reserved');
  });

  it('rejects reserving a seat that is already reserved by another user', async () => {
    await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [2] });

    const res = await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ eventId, seatNumbers: [2] });

    expect(res.status).toBe(409);
  });

  it('rejects reserving a seat that is already booked', async () => {
    await Seat.updateOne({ eventId, seatNumber: 3 }, { $set: { status: 'booked' } });

    const res = await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [3] });

    expect(res.status).toBe(409);
  });

  it('rejects a non-integer / injection-shaped seat number', async () => {
    const res = await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [{ $gt: 0 }] });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid eventId instead of querying with it', async () => {
    const res = await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId: { $ne: null }, seatNumbers: [1] });

    expect(res.status).toBe(400);
  });

  it('rolls back partially-claimed seats when one seat in a multi-seat request is unavailable', async () => {
    await Seat.updateOne({ eventId, seatNumber: 5 }, { $set: { status: 'booked' } });

    const res = await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [4, 5] });

    expect(res.status).toBe(409);

    // Seat 4 must have been rolled back to available, not left dangling as 'reserved'.
    const seat4 = await Seat.findOne({ eventId, seatNumber: 4 });
    expect(seat4.status).toBe('available');
  });

  it('rejects a second active reservation by the same user for the same event', async () => {
    await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [1] });

    const res = await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [2] });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/reserve (active reservation lookup)', () => {
  it('returns null when the user has no active reservation', async () => {
    const res = await request(app)
      .get('/api/reserve')
      .query({ eventId })
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.reservation).toBeNull();
  });

  it('returns the active reservation after one is created', async () => {
    await request(app)
      .post('/api/reserve')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ eventId, seatNumbers: [1] });

    const res = await request(app)
      .get('/api/reserve')
      .query({ eventId })
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.reservation.seatNumbers).toEqual([1]);
  });
});

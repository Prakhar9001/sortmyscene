const request = require('supertest');
const { app, connectTestDB, clearTestDB, disconnectTestDB } = require('./testUtils');
const Event = require('../models/Event');
const Seat = require('../models/Seat');
const Reservation = require('../models/Reservation');
const User = require('../models/User');

let tokenA;
let tokenB;
let userAId;
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
  userAId = (await User.findOne({ email: 'usera@example.com' }))._id;

  const b = await request(app).post('/api/auth/register').send({
    name: 'User B',
    email: 'userb@example.com',
    password: 'password123'
  });
  tokenB = b.body.token;

  const event = await Event.create({
    name: 'Booking Test Event',
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

async function makeReservation(token, seatNumbers, expiresAt) {
  if (expiresAt) {
    // Create directly so we can control expiresAt precisely (the API always sets +10min).
    await Seat.updateMany(
      { eventId, seatNumber: { $in: seatNumbers } },
      { $set: { status: 'reserved' } }
    );
    return Reservation.create({ userId: userAId, eventId, seatNumbers, expiresAt });
  }
  const res = await request(app)
    .post('/api/reserve')
    .set('Authorization', `Bearer ${token}`)
    .send({ eventId, seatNumbers });
  return res.body.reservation;
}

describe('POST /api/bookings', () => {
  it('confirms a valid booking and marks seats as booked', async () => {
    const reservation = await makeReservation(tokenA, [1]);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reservationId: reservation._id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bookedSeats).toEqual([1]);

    const seat = await Seat.findOne({ eventId, seatNumber: 1 });
    expect(seat.status).toBe('booked');

    const stillExists = await Reservation.findById(reservation._id);
    expect(stillExists).toBeNull();
  });

  it('rejects booking an expired reservation with 410', async () => {
    const reservation = await makeReservation(tokenA, [2], new Date(Date.now() - 1000));

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reservationId: reservation._id });

    expect(res.status).toBe(410);

    const seat = await Seat.findOne({ eventId, seatNumber: 2 });
    expect(seat.status).toBe('reserved'); // not booked
  });

  it('rejects booking by a user who does not own the reservation', async () => {
    const reservation = await makeReservation(tokenA, [3]);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ reservationId: reservation._id });

    expect(res.status).toBe(403);

    const seat = await Seat.findOne({ eventId, seatNumber: 3 });
    expect(seat.status).toBe('reserved'); // unaffected by the rejected attempt
  });

  it('rejects booking a non-existent reservation', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reservationId: '000000000000000000000000' });

    expect(res.status).toBe(404);
  });

  it('rejects an invalid reservationId instead of querying with it', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reservationId: { $ne: null } });

    expect(res.status).toBe(400);
  });

  it('never reports success if the seats were released out from under the booking (cleanup race)', async () => {
    const reservation = await makeReservation(tokenA, [4]);

    // Simulate the 30s background cleanup job winning a race and releasing the
    // seat back to available between the expiry check and the seat update.
    await Seat.updateOne({ eventId, seatNumber: 4 }, { $set: { status: 'available' } });

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reservationId: reservation._id });

    expect(res.status).toBe(410);
    expect(res.body.success).not.toBe(true);
  });
});

const request = require('supertest');
const { app, connectTestDB, clearTestDB, disconnectTestDB } = require('./testUtils');
const Event = require('../models/Event');
const Seat = require('../models/Seat');
const Reservation = require('../models/Reservation');

let eventId;

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

async function registerUser(i) {
  const res = await request(app).post('/api/auth/register').send({
    name: `Concurrent User ${i}`,
    email: `concurrent${i}@example.com`,
    password: 'password123'
  });
  return res.body.token;
}

async function setUpEventWithSeat() {
  await clearTestDB();
  const event = await Event.create({
    name: 'Concurrency Test Event',
    dateTime: new Date('2030-01-01T20:00:00Z'),
    venue: 'Test Arena',
    totalSeats: 1
  });
  eventId = event._id.toString();
  await Seat.create({ eventId, seatNumber: 1, status: 'available' });
}

async function runConcurrentReserveAttempt(n) {
  await setUpEventWithSeat();

  const tokens = await Promise.all(Array.from({ length: n }, (_, i) => registerUser(`${n}_${i}`)));

  const results = await Promise.all(
    tokens.map((token) =>
      request(app)
        .post('/api/reserve')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventId, seatNumbers: [1] })
    )
  );

  return results;
}

describe('Concurrency: double-booking prevention under simultaneous load', () => {
  it.each([10, 25, 50])(
    'allows exactly one success out of %i simultaneous reservation requests for the same seat',
    async (n) => {
      const results = await runConcurrentReserveAttempt(n);

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      const unexpected = results.filter((r) => r.status !== 201 && r.status !== 409);

      expect(unexpected).toHaveLength(0);
      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(n - 1);

      // No duplicate Reservation documents for the seat.
      const reservations = await Reservation.find({ eventId, seatNumbers: 1 });
      expect(reservations).toHaveLength(1);

      // Seat state is consistent: exactly 'reserved', not stuck in some hybrid state.
      const seat = await Seat.findOne({ eventId, seatNumber: 1 });
      expect(seat.status).toBe('reserved');
    },
    30000
  );

  it('produces exactly one booked seat when concurrent reservation winners race to confirm', async () => {
    await setUpEventWithSeat();

    // Two users race for the same seat; only one can win the reservation.
    const [tokenA, tokenB] = await Promise.all([
      registerUser('book_a'),
      registerUser('book_b')
    ]);

    const [resA, resB] = await Promise.all([
      request(app).post('/api/reserve').set('Authorization', `Bearer ${tokenA}`).send({ eventId, seatNumbers: [1] }),
      request(app).post('/api/reserve').set('Authorization', `Bearer ${tokenB}`).send({ eventId, seatNumbers: [1] })
    ]);

    const winnerRes = resA.status === 201 ? resA : resB;
    const winnerToken = resA.status === 201 ? tokenA : tokenB;
    expect(winnerRes.status).toBe(201);

    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${winnerToken}`)
      .send({ reservationId: winnerRes.body.reservation._id });

    expect(bookRes.status).toBe(200);

    const seat = await Seat.findOne({ eventId, seatNumber: 1 });
    expect(seat.status).toBe('booked');

    const remainingReservations = await Reservation.countDocuments({ eventId });
    expect(remainingReservations).toBe(0);
  }, 30000);
});

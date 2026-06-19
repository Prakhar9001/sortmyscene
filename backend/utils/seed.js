require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Seat = require('../models/Seat');

const events = [
  {
    name: 'The Weeknd - After Hours Tour',
    dateTime: new Date('2025-08-15T20:00:00'),
    venue: 'Madison Square Garden, New York',
    totalSeats: 36
  },
  {
    name: 'Tech Summit 2025',
    dateTime: new Date('2025-09-10T09:00:00'),
    venue: 'Moscone Center, San Francisco',
    totalSeats: 40
  },
  {
    name: 'Hamilton — The Musical',
    dateTime: new Date('2025-07-20T18:30:00'),
    venue: 'Richard Rodgers Theatre, New York',
    totalSeats: 30
  },
  {
    name: 'IPL Final 2025',
    dateTime: new Date('2025-06-25T19:30:00'),
    venue: 'Wankhede Stadium, Mumbai',
    totalSeats: 48
  }
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await Event.deleteMany({});
  await Seat.deleteMany({});
  console.log('Cleared existing events and seats');

  for (const eventData of events) {
    const event = await Event.create(eventData);

    const seats = Array.from({ length: event.totalSeats }, (_, i) => ({
      eventId: event._id,
      seatNumber: i + 1,
      status: 'available'
    }));

    await Seat.insertMany(seats);
    console.log(`Created: "${event.name}" with ${event.totalSeats} seats`);
  }

  console.log('\nSeed complete!');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  seatNumber: { type: Number, required: true },
  status: {
    type: String,
    enum: ['available', 'reserved', 'booked'],
    default: 'available'
  }
});

// Enforce uniqueness of seat numbers per event
seatSchema.index({ eventId: 1, seatNumber: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);

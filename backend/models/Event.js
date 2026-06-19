const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dateTime: { type: Date, required: true },
    venue: { type: String, required: true, trim: true },
    totalSeats: { type: Number, required: true, min: 1 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);

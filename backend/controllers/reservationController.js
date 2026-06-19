const Seat = require('../models/Seat');
const Reservation = require('../models/Reservation');
const Event = require('../models/Event');
const { isValidObjectId, isSeatNumberArray } = require('../utils/validate');

exports.getMyReservation = async (req, res, next) => {
  try {
    const { eventId } = req.query;
    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: 'A valid eventId is required' });
    }

    const reservation = await Reservation.findOne({
      userId: req.user.id,
      eventId,
      expiresAt: { $gt: new Date() }
    });

    res.json({ reservation: reservation || null });
  } catch (err) {
    next(err);
  }
};

exports.reserve = async (req, res, next) => {
  try {
    const { eventId, seatNumbers } = req.body;

    if (!isValidObjectId(eventId)) {
      return res.status(400).json({ error: 'A valid eventId is required' });
    }
    if (!isSeatNumberArray(seatNumbers)) {
      return res.status(400).json({ error: 'seatNumbers must be a non-empty array of positive integers' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Prevent duplicate active reservation by the same user for this event
    const existingReservation = await Reservation.findOne({
      userId: req.user.id,
      eventId,
      expiresAt: { $gt: new Date() }
    });

    if (existingReservation) {
      return res.status(409).json({
        error: 'You already have an active reservation for this event. Complete or wait for it to expire.'
      });
    }

    // Atomically attempt to claim each seat: only succeeds if status is currently 'available'.
    // No transaction (requires a replica set) — instead, roll back any seats claimed before
    // a failure so a partial reservation never persists.
    const claimedSeats = [];
    const unavailableSeats = [];

    for (const seatNum of seatNumbers) {
      const updated = await Seat.findOneAndUpdate(
        { eventId, seatNumber: seatNum, status: 'available' },
        { $set: { status: 'reserved' } },
        { new: true }
      );

      if (updated) {
        claimedSeats.push(seatNum);
      } else {
        unavailableSeats.push(seatNum);
      }
    }

    if (unavailableSeats.length > 0) {
      if (claimedSeats.length > 0) {
        await Seat.updateMany(
          { eventId, seatNumber: { $in: claimedSeats }, status: 'reserved' },
          { $set: { status: 'available' } }
        );
      }
      return res.status(409).json({
        error: `Seat(s) ${unavailableSeats.join(', ')} are no longer available. Please refresh and try again.`
      });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const reservation = await Reservation.create({ userId: req.user.id, eventId, seatNumbers, expiresAt });

    res.status(201).json({ reservation });
  } catch (err) {
    next(err);
  }
};

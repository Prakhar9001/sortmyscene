const Seat = require('../models/Seat');
const Reservation = require('../models/Reservation');
const { isValidObjectId } = require('../utils/validate');

exports.book = async (req, res, next) => {
  try {
    const { reservationId } = req.body;

    if (!isValidObjectId(reservationId)) {
      return res.status(400).json({ error: 'A valid reservationId is required' });
    }

    const reservation = await Reservation.findById(reservationId);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found. It may have already been completed or expired.' });
    }

    if (reservation.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Unauthorized: This reservation does not belong to you.' });
    }

    if (reservation.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Your reservation has expired. Please select seats and reserve again.' });
    }

    // Mark reserved seats as booked
    const updateResult = await Seat.updateMany(
      {
        eventId: reservation.eventId,
        seatNumber: { $in: reservation.seatNumbers },
        status: 'reserved'
      },
      { $set: { status: 'booked' } }
    );

    // If fewer seats were updated than expected, the background cleanup job
    // released some of them (expiry race) between our expiry check above and
    // this update. Don't report success for seats that were never actually booked.
    if (updateResult.modifiedCount !== reservation.seatNumbers.length) {
      await Reservation.findByIdAndDelete(reservationId);
      return res.status(410).json({
        error: 'Your reservation expired before booking could be confirmed. Please select seats and reserve again.'
      });
    }

    // Remove the reservation document
    await Reservation.findByIdAndDelete(reservationId);

    res.json({
      success: true,
      message: 'Booking confirmed! Your seats are secured.',
      bookedSeats: reservation.seatNumbers,
      eventId: reservation.eventId
    });
  } catch (err) {
    next(err);
  }
};

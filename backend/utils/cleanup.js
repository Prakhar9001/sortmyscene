const Seat = require('../models/Seat');
const Reservation = require('../models/Reservation');

const cleanupExpiredReservations = async () => {
  try {
    const now = new Date();
    const expired = await Reservation.find({ expiresAt: { $lt: now } });

    if (expired.length === 0) return;

    for (const reservation of expired) {
      // Release reserved seats back to available
      await Seat.updateMany(
        {
          eventId: reservation.eventId,
          seatNumber: { $in: reservation.seatNumbers },
          status: 'reserved'
        },
        { $set: { status: 'available' } }
      );

      await Reservation.findByIdAndDelete(reservation._id);
    }

    console.log(`[Cleanup] Released ${expired.length} expired reservation(s)`);
  } catch (err) {
    console.error('[Cleanup] Error:', err.message);
  }
};

module.exports = { cleanupExpiredReservations };

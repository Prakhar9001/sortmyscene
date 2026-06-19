const Event = require('../models/Event');
const Seat = require('../models/Seat');
const { isValidObjectId } = require('../utils/validate');

exports.getAllEvents = async (req, res, next) => {
  try {
    const events = await Event.find().sort({ dateTime: 1 });
    res.json(events);
  } catch (err) {
    next(err);
  }
};

exports.getEventById = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const seats = await Seat.find({ eventId: event._id }).sort({ seatNumber: 1 });

    res.json({ event, seats });
  } catch (err) {
    next(err);
  }
};

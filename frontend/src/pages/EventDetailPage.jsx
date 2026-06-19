import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/api';
import SeatGrid from '../components/SeatGrid';
import ReservationTimer from '../components/ReservationTimer';
import BookingConfirmation from '../components/BookingConfirmation';

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

export default function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedSeats, setSelectedSeats] = useState([]);
  const [reserving, setReserving] = useState(false);
  const [reservation, setReservation] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);

  const fetchEvent = useCallback(async () => {
    try {
      const { data } = await api.get(`/events/${id}`);
      setEvent(data.event);
      setSeats(data.seats);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load event. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMyReservation = useCallback(async () => {
    // The endpoint always responds 200 with { reservation: null } when there's
    // simply no active reservation — that is not an error path. Anything that
    // throws here is a genuine failure (bad request, server error, etc.) and
    // must be surfaced, not swallowed, since silently hiding it would make an
    // existing reservation invisible to the user with no indication why.
    try {
      const { data } = await api.get('/reserve', { params: { eventId: id } });
      if (data.reservation) {
        setReservation(data.reservation);
        setSelectedSeats(data.reservation.seatNumbers);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check your reservation status. Please refresh the page.');
    }
  }, [id]);

  useEffect(() => {
    fetchEvent();
    fetchMyReservation();
  }, [fetchEvent, fetchMyReservation]);

  const toggleSeat = (seatNumber) => {
    setSelectedSeats((prev) =>
      prev.includes(seatNumber)
        ? prev.filter((n) => n !== seatNumber)
        : [...prev, seatNumber]
    );
  };

  const handleReserve = async () => {
    if (selectedSeats.length === 0) return;
    setReserving(true);
    setError('');
    try {
      const { data } = await api.post('/reserve', {
        eventId: id,
        seatNumbers: selectedSeats
      });
      setReservation(data.reservation);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reserve seats. Please try again.');
      if (err.response?.status === 409 && err.response?.data?.error?.includes('active reservation')) {
        await fetchMyReservation();
      } else {
        await fetchEvent();
        setSelectedSeats([]);
      }
    } finally {
      setReserving(false);
    }
  };

  const handleExpired = useCallback(async () => {
    setReservation(null);
    setSelectedSeats([]);
    setError('Your reservation expired. Please select seats again.');
    await fetchEvent();
  }, [fetchEvent]);

  const handleConfirm = async () => {
    setConfirming(true);
    setError('');
    try {
      const { data } = await api.post('/bookings', {
        reservationId: reservation._id
      });
      setReservation(null);
      setBookingResult({
        success: true,
        message: data.message,
        seats: data.bookedSeats
      });
    } catch (err) {
      const status = err.response?.status;
      // 404/410/403 mean the reservation is definitively gone (expired, already
      // completed, or not the caller's) — there's nothing left to retry, so show
      // the terminal failure screen. Anything else (network blip, 500) is
      // transient: keep the reservation and timer alive so the user can hit
      // Confirm again instead of losing their held seats.
      const isTerminal = status === 404 || status === 410 || status === 403;
      if (isTerminal) {
        setReservation(null);
        setBookingResult({
          success: false,
          message: err.response?.data?.error || 'Booking failed. Please try again.'
        });
      } else {
        setError(err.response?.data?.error || 'Could not confirm booking. Please try again.');
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleBack = () => navigate('/events');

  const handleTryAgain = async () => {
    setBookingResult(null);
    setSelectedSeats([]);
    await fetchEvent();
  };

  if (loading) {
    return <div className="loading-screen">Loading event...</div>;
  }

  if (error && !event) {
    return <div className="error-screen">{error}</div>;
  }

  if (bookingResult) {
    return (
      <div className="page-container">
        <BookingConfirmation
          result={bookingResult}
          event={event}
          onBack={handleBack}
          onTryAgain={handleTryAgain}
        />
      </div>
    );
  }

  const availableCount = seats.filter((s) => s.status === 'available').length;

  return (
    <div className="page-container">
      <button className="btn-back" onClick={handleBack}>
        &larr; Back to Events
      </button>

      <div className="event-detail-header">
        <h1>{event.name}</h1>
        <div className="event-detail-meta">
          <span>{formatDate(event.dateTime)}</span>
          <span className="meta-sep">&bull;</span>
          <span>{event.venue}</span>
          <span className="meta-sep">&bull;</span>
          {availableCount > 0 ? (
            <span className="seats-available">{availableCount} seats available</span>
          ) : (
            <span className="seats-soldout">Sold out</span>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="seat-legend">
        <div className="legend-item">
          <span className="legend-dot dot-available" /> Available
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-selected" /> Selected
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-reserved" /> Reserved
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-booked" /> Booked
        </div>
      </div>

      <SeatGrid
        seats={seats}
        selectedSeats={selectedSeats}
        onToggle={toggleSeat}
        disabled={!!reservation}
      />

      {reservation ? (
        <ReservationTimer
          reservation={reservation}
          onExpired={handleExpired}
          onConfirm={handleConfirm}
          confirming={confirming}
        />
      ) : (
        <div className="action-bar">
          <div className="selection-summary">
            {selectedSeats.length === 0 ? (
              'Select one or more seats to reserve'
            ) : (
              <>
                Selected: <strong>{[...selectedSeats].sort((a, b) => a - b).join(', ')}</strong>
              </>
            )}
          </div>
          <button
            className="btn-primary btn-reserve"
            onClick={handleReserve}
            disabled={selectedSeats.length === 0 || reserving}
          >
            {reserving ? 'Reserving...' : 'Reserve Seats'}
          </button>
        </div>
      )}
    </div>
  );
}

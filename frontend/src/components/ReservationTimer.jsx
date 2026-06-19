import React, { useState, useEffect, useCallback } from 'react';

export default function ReservationTimer({ reservation, onExpired, onConfirm, confirming }) {
  const [timeLeft, setTimeLeft] = useState(0);

  const calcTimeLeft = useCallback(() => {
    const diff = new Date(reservation.expiresAt) - new Date();
    return Math.max(0, Math.floor(diff / 1000));
  }, [reservation.expiresAt]);

  useEffect(() => {
    setTimeLeft(calcTimeLeft());

    const interval = setInterval(() => {
      const remaining = calcTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calcTimeLeft, onExpired]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isUrgent = timeLeft <= 60 && timeLeft > 0;

  return (
    <div className={`reservation-timer ${isUrgent ? 'timer-urgent' : ''}`}>
      <div className="timer-top">
        <div className="timer-title">Seats Reserved!</div>
        <div className="timer-seats">
          Seat(s):{' '}
          <strong>
            {[...reservation.seatNumbers].sort((a, b) => a - b).join(', ')}
          </strong>
        </div>
      </div>

      <div className="timer-display-wrapper">
        <div className="timer-display">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <div className="timer-sublabel">
          {isUrgent ? 'Hurry! Time is running out' : 'remaining to confirm booking'}
        </div>
      </div>

      <button
        className="btn-confirm"
        onClick={onConfirm}
        disabled={confirming || timeLeft === 0}
      >
        {confirming ? 'Confirming...' : 'Confirm Booking'}
      </button>
    </div>
  );
}

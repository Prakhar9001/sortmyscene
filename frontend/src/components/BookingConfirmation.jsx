import React from 'react';

export default function BookingConfirmation({ result, event, onBack, onTryAgain }) {
  return (
    <div className="booking-confirmation">
      <div className={`confirmation-icon ${result.success ? 'icon-success' : 'icon-failure'}`}>
        {result.success ? '✓' : '✗'}
      </div>

      <h2 className="confirmation-title">
        {result.success ? 'Booking Confirmed!' : 'Booking Failed'}
      </h2>

      <p className="confirmation-message">{result.message}</p>

      {result.success && result.seats && (
        <div className="confirmation-details">
          <div className="confirmation-row">
            <span className="conf-label">Event</span>
            <span className="conf-value">{event.name}</span>
          </div>
          <div className="confirmation-row">
            <span className="conf-label">Seat(s)</span>
            <span className="conf-value">
              {[...result.seats].sort((a, b) => a - b).join(', ')}
            </span>
          </div>
          <div className="confirmation-row">
            <span className="conf-label">Venue</span>
            <span className="conf-value">{event.venue}</span>
          </div>
        </div>
      )}

      <div className="confirmation-actions">
        {result.success ? (
          <button className="btn-primary" onClick={onBack}>
            Back to Events
          </button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onBack}>
              Back to Events
            </button>
            <button className="btn-primary" onClick={onTryAgain}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

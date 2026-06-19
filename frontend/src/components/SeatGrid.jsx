import React from 'react';
import Seat from './Seat';

export default function SeatGrid({ seats, selectedSeats, onToggle, disabled }) {
  return (
    <div className="seat-grid-wrapper">
      <div className="stage-label">STAGE</div>
      <div className="seat-grid">
        {seats.map((seat) => (
          <Seat
            key={seat._id}
            seat={seat}
            isSelected={selectedSeats.includes(seat.seatNumber)}
            onToggle={onToggle}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

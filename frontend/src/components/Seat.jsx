import React from 'react';

export default function Seat({ seat, isSelected, onToggle, disabled }) {
  const getEffectiveStatus = () => {
    if (isSelected) return 'selected';
    return seat.status;
  };

  const status = getEffectiveStatus();
  const isClickable = seat.status === 'available' && !disabled;

  return (
    <button
      className={`seat seat-${status}`}
      onClick={() => isClickable && onToggle(seat.seatNumber)}
      disabled={!isClickable}
      title={`Seat ${seat.seatNumber} — ${status}`}
      aria-label={`Seat ${seat.seatNumber}, ${status}`}
    >
      {seat.seatNumber}
    </button>
  );
}

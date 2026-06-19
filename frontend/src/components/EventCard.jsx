import React from 'react';
import { useNavigate } from 'react-router-dom';

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

export default function EventCard({ event }) {
  const navigate = useNavigate();

  return (
    <div className="event-card" onClick={() => navigate(`/events/${event._id}`)}>
      <div className="event-card-header">
        <h2 className="event-card-title">{event.name}</h2>
      </div>
      <div className="event-card-body">
        <div className="event-meta">
          <span className="meta-label">Date</span>
          <span>{formatDate(event.dateTime)}</span>
        </div>
        <div className="event-meta">
          <span className="meta-label">Venue</span>
          <span>{event.venue}</span>
        </div>
        <div className="event-meta">
          <span className="meta-label">Capacity</span>
          <span>{event.totalSeats} seats</span>
        </div>
      </div>
      <div className="event-card-footer">
        <span className="btn-view-seats">View Seats &rarr;</span>
      </div>
    </div>
  );
}

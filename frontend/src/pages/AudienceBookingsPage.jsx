import React, { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

function eventLocation(booking) {
  return [booking.city, booking.state, booking.country].filter(Boolean).join(", ") || booking.venue || "Venue to be announced";
}

function statusLabel(booking) {
  if (booking.ticket_status === "CANCELLED") return "Cancelled";
  if (booking.entry_status === "CHECKED_IN") return "Used / Checked in";
  return "Active";
}

function amount(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function BookingCard({ booking, onCancel, busyTicketId }) {
  const canCancel = booking.ticket_status !== "CANCELLED" && booking.entry_status !== "CHECKED_IN";

  return (
    <article className="audience-booking-card">
      <div className="audience-booking-poster">
        {booking.poster_image ? <img src={booking.poster_image} alt={`${booking.event_name} poster`} /> : <div className="poster-placeholder">1F</div>}
      </div>

      <div className="audience-booking-details">
        <div className="booking-card-title-row">
          <div>
            <p className="eyebrow">{booking.event_type || "Event"}</p>
            <h3>{booking.event_name}</h3>
          </div>
          <span className={booking.ticket_status === "CANCELLED" ? "status-chip danger" : "status-chip success"}>{statusLabel(booking)}</span>
        </div>

        <div className="booking-info-grid">
          <span>Date</span><strong>{booking.event_date || "TBA"}</strong>
          <span>Time</span><strong>{booking.event_time || "TBA"}</strong>
          <span>Location</span><strong>{eventLocation(booking)}</strong>
          <span>Seat</span><strong>{booking.seat_id || "Class-based entry"}</strong>
          <span>Class</span><strong>{booking.section || "General"}</strong>
          <span>Amount</span><strong>{amount(booking.amount_paid)}</strong>
          <span>Ticket ID</span><strong>{booking.ticket_id}</strong>
          <span>Booking ID</span><strong>{booking.booking_group_id || "-"}</strong>
        </div>

        {booking.ticket_status === "CANCELLED" && (
          <div className="cancel-note">Cancelled on {booking.cancelled_at || "-"}</div>
        )}

        <div className="booking-card-actions">
          {booking.qr_data_url && <img className="mini-ticket-qr" src={booking.qr_data_url} alt="Ticket QR" />}
          <button className="secondary-btn" onClick={() => window.print()}>Print Page</button>
          {canCancel && (
            <button className="danger-btn" disabled={busyTicketId === booking.ticket_id} onClick={() => onCancel(booking)}>
              {busyTicketId === booking.ticket_id ? "Cancelling..." : "Cancel Ticket"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function AudienceBookingsPage({ currentUser }) {
  const [bookings, setBookings] = useState([]);
  const [activeBookings, setActiveBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [view, setView] = useState("ACTIVE");
  const [message, setMessage] = useState("");
  const [busyTicketId, setBusyTicketId] = useState("");

  const mobile = currentUser?.mobile || currentUser?.username || "";

  const loadBookings = async () => {
    if (!mobile) {
      setMessage("Mobile number is missing from your user profile.");
      return;
    }

    const res = await fetch(`${API}/audience/bookings?mobile=${encodeURIComponent(mobile)}&username=${encodeURIComponent(currentUser?.username || "")}&view=ALL`);
    const data = await res.json();

    if (data.status !== "SUCCESS") {
      setMessage(data.message || "Unable to load bookings.");
      return;
    }

    setBookings(data.bookings || []);
    setActiveBookings(data.active || []);
    setPastBookings(data.past || []);
    setMessage("");
  };

  useEffect(() => {
    loadBookings().catch(() => setMessage("Backend not available. Start FastAPI on port 8000."));
  }, [mobile]);

  const visibleBookings = useMemo(() => {
    if (view === "ACTIVE") return activeBookings;
    if (view === "PAST") return pastBookings;
    return bookings;
  }, [view, bookings, activeBookings, pastBookings]);

  const cancelTicket = async (booking) => {
    const ok = window.confirm(`Cancel ticket ${booking.ticket_id} for ${booking.event_name}? This will release the seat if it has not been used.`);
    if (!ok) return;

    setBusyTicketId(booking.ticket_id);
    try {
      const res = await fetch(`${API}/audience/tickets/${booking.ticket_id}/cancel?mobile=${encodeURIComponent(mobile)}&reason=${encodeURIComponent("Audience cancellation")}`, {
        method: "POST",
      });
      const data = await res.json();
      setMessage(data.message || "Cancellation completed.");
      await loadBookings();
    } catch (error) {
      setMessage("Unable to cancel ticket. Please check backend status.");
    } finally {
      setBusyTicketId("");
    }
  };

  return (
    <main className="page audience-bookings-page">
      <section className="audience-bookings-hero">
        <div>
          <p className="eyebrow">My tickets</p>
          <h1>Bookings and cancellations</h1>
          <p>View active tickets, past bookings, checked-in tickets, and cancelled tickets linked to your mobile number.</p>
        </div>
        <div className="booking-count-panel">
          <strong>{activeBookings.length}</strong>
          <span>Active bookings</span>
        </div>
      </section>

      <section className="audience-booking-tabs">
        <button className={view === "ACTIVE" ? "tab-pill active" : "tab-pill"} onClick={() => setView("ACTIVE")}>Active Bookings ({activeBookings.length})</button>
        <button className={view === "PAST" ? "tab-pill active" : "tab-pill"} onClick={() => setView("PAST")}>Past / Cancelled ({pastBookings.length})</button>
        <button className={view === "ALL" ? "tab-pill active" : "tab-pill"} onClick={() => setView("ALL")}>All ({bookings.length})</button>
        <button className="secondary-btn" onClick={loadBookings}>Refresh</button>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="audience-booking-list">
        {visibleBookings.length === 0 ? (
          <div className="empty-discovery-card">
            <strong>No bookings found</strong>
            <span>{view === "ACTIVE" ? "Active tickets will appear here after booking." : "Past and cancelled tickets will appear here."}</span>
          </div>
        ) : (
          visibleBookings.map((booking) => (
            <BookingCard key={booking.ticket_id} booking={booking} onCancel={cancelTicket} busyTicketId={busyTicketId} />
          ))
        )}
      </section>
    </main>
  );
}

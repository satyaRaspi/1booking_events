import React, { useEffect, useState } from "react";
const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

export default function AdminDashboard() {
  const [tickets, setTickets] = useState([]);
  const [events, setEvents] = useState([]);

  const refresh = async () => {
    const [ticketRes, eventRes] = await Promise.all([fetch(`${API}/tickets`), fetch(`${API}/events`)]);
    setTickets(await ticketRes.json());
    setEvents(await eventRes.json());
  };

  useEffect(() => { refresh().catch(() => {}); }, []);

  return (
    <main className="page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Bookings and Entry Monitor</h1>
        </div>
        <button className="primary-btn" onClick={refresh}>Refresh</button>
      </section>
      <div className="stats-grid">
        <div className="stat-card"><span>Events</span><strong>{events.length}</strong></div>
        <div className="stat-card"><span>Tickets</span><strong>{tickets.length}</strong></div>
        <div className="stat-card"><span>Checked In</span><strong>{tickets.filter((t) => t.entry_status === "CHECKED_IN").length}</strong></div>
      </div>
      <div className="card">
        <h2>Ticket List</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ticket</th><th>Buyer</th><th>Seat</th><th>Class</th><th>Amount</th><th>Entry</th></tr></thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.ticket_id}><td>{ticket.ticket_id}</td><td>{ticket.buyer_name}</td><td>{ticket.seat_id}</td><td>{ticket.section}</td><td>₹{ticket.amount_paid}</td><td>{ticket.entry_status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

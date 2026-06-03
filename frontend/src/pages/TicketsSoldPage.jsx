import React, { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function getEventSchedules(event) {
  if (!event) return [];
  const schedules = Array.isArray(event.show_schedules) ? event.show_schedules : [];
  const normalized = schedules
    .filter((item) => item?.show_date && item?.show_time && item?.status !== "CANCELLED")
    .map((item, index) => ({
      show_id: item.show_id || `SCH${index + 1}`,
      show_date: item.show_date,
      show_time: item.show_time,
      status: item.status || "ACTIVE",
    }));
  if (!normalized.length && event.event_date && event.event_time) {
    normalized.push({ show_id: "SCH001", show_date: event.event_date, show_time: event.event_time, status: event.status || "ACTIVE" });
  }
  return normalized;
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function downloadTicketPdf(ticket) {
  const qrImg = ticket.qr_data_url || "";
  const html = `
    <html>
      <head>
        <title>${escapeHtml(ticket.ticket_id || ticket.booking_group_id || "1Booking FaceID Ticket")}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
          .ticket { max-width: 760px; border: 2px solid #111827; border-radius: 18px; padding: 24px; }
          .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
          h1 { margin: 0 0 8px; font-size: 26px; }
          h2 { margin: 0 0 20px; color: #4b5563; font-size: 16px; }
          .grid { display: grid; grid-template-columns: 140px 1fr; gap: 10px; margin-top: 18px; }
          .grid span { color: #6b7280; }
          .grid strong { color: #111827; }
          .qr { width: 230px; height: 230px; object-fit: contain; border: 1px solid #e5e7eb; padding: 8px; }
          .note { margin-top: 24px; font-size: 12px; color: #6b7280; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="top">
            <div>
              <h1>Reissued 1Booking Event Ticket</h1>
              <h2>${escapeHtml(ticket.event_name)}</h2>
              <div class="grid">
                <span>Venue</span><strong>${escapeHtml(ticket.venue)}${ticket.city ? `, ${escapeHtml(ticket.city)}` : ""}</strong>
                <span>Date</span><strong>${escapeHtml(ticket.event_date)}</strong>
                <span>Time</span><strong>${escapeHtml(ticket.event_time)}</strong>
                <span>Purchaser</span><strong>${escapeHtml(ticket.buyer_name)}</strong>
                <span>Mobile</span><strong>${escapeHtml(ticket.buyer_mobile)}</strong>
                <span>Seat</span><strong>${escapeHtml((ticket.seat_numbers || []).join(", "))}</strong>
                <span>Ticket ID</span><strong>${escapeHtml(ticket.ticket_id)}</strong>
                <span>Booking ID</span><strong>${escapeHtml(ticket.booking_group_id)}</strong>
                <span>Biometric ID</span><strong>${escapeHtml(ticket.biometric_id)}</strong>
                <span>Reissue ID</span><strong>${escapeHtml(ticket.reissue_id)}</strong>
              </div>
            </div>
            ${qrImg ? `<img class="qr" src="${qrImg}" />` : `<div>No QR image available</div>`}
          </div>
          <p class="note">QR format: ${escapeHtml(ticket.qr_format || "1BOOKING_FACEID_TICKET_QR_V1")}. This reissued QR is linked to the same purchaser biometric identity and this specific ticket.</p>
        </div>
        <button onclick="window.print()">Print / Save as PDF</button>
      </body>
    </html>`;
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
}

function ReissuedTicketDialog({ ticket, onClose }) {
  if (!ticket) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card reissue-modal-card">
        <div className="modal-title-row">
          <div>
            <p className="eyebrow">Ticket reissued</p>
            <h2>1Booking FaceID Ticket QR</h2>
            <p className="muted-small">Use this QR for the reissued ticket. A PDF file is created on the backend during reissue.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>×</button>
        </div>

        <div className="reissued-ticket-preview">
          <div className="ticket-detail-grid">
            <span>Event</span><strong>{ticket.event_name}</strong>
            <span>Date</span><strong>{ticket.event_date}</strong>
            <span>Time</span><strong>{ticket.event_time}</strong>
            <span>Seat</span><strong>{(ticket.seat_numbers || []).join(", ")}</strong>
            <span>Ticket ID</span><strong>{ticket.ticket_id}</strong>
            <span>Booking ID</span><strong>{ticket.booking_group_id}</strong>
            <span>Biometric ID</span><strong>{ticket.biometric_id}</strong>
            <span>Reissue ID</span><strong>{ticket.reissue_id}</strong>
            <span>PDF File</span><strong>{ticket.pdf_filename || "Not created"}</strong>
          </div>

          <div className="ticket-qr-panel compact">
            {ticket.qr_data_url ? (
              <img className="real-qr-image" src={ticket.qr_data_url} alt="Reissued 1Booking FaceID QR" />
            ) : (
              <div className="qr-missing">QR image unavailable</div>
            )}
            <small>Real 1Booking FaceID QR, linked to this reissued ticket</small>
          </div>
        </div>

        <div className="modal-actions">
          <button className="secondary-btn" type="button" onClick={onClose}>Close</button>
          {ticket.pdf_download_url && (
            <a className="secondary-btn link-button" href={ticket.pdf_download_url} target="_blank" rel="noreferrer">
              Download Created PDF
            </a>
          )}
          <button className="primary-btn" type="button" onClick={() => downloadTicketPdf(ticket)}>Browser Print / Save PDF</button>
        </div>
      </div>
    </div>
  );
}

export default function TicketsSoldPage() {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [report, setReport] = useState({ tickets: [], bookings: [], count: 0, booking_count: 0, total_revenue: 0 });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [reissueLoadingTicketId, setReissueLoadingTicketId] = useState("");
  const [reissuedTicket, setReissuedTicket] = useState(null);

  const selectedEvent = events.find((event) => event.event_id === selectedEventId);

  const selectedSchedules = useMemo(() => getEventSchedules(selectedEvent), [selectedEvent]);

  const eventDates = useMemo(() => {
    return uniqueValues(selectedSchedules.map((item) => item.show_date));
  }, [selectedSchedules]);

  const eventTimes = useMemo(() => {
    return uniqueValues(selectedSchedules.filter((item) => !selectedDate || item.show_date === selectedDate).map((item) => item.show_time));
  }, [selectedSchedules, selectedDate]);

  const loadEvents = async () => {
    const response = await fetch(`${API}/events`);
    const data = await response.json();
    setEvents(Array.isArray(data) ? data : []);
  };

  const loadTransactions = async ({ eventId = selectedEventId, date = selectedDate, time = selectedTime } = {}) => {
    if (!eventId) {
      setReport({ tickets: [], bookings: [], count: 0, booking_count: 0, total_revenue: 0 });
      return;
    }

    setLoading(true);
    setMessage("");

    const params = new URLSearchParams();
    params.set("event_id", eventId);
    if (date) params.set("event_date", date);
    if (time) params.set("event_time", time);

    try {
      const response = await fetch(`${API}/admin/ticket-transactions?${params.toString()}`);
      const data = await response.json();
      if (data.status !== "SUCCESS") {
        setMessage(data.message || "Unable to load ticket transactions.");
        setReport({ tickets: [], bookings: [], count: 0, booking_count: 0, total_revenue: 0 });
        return;
      }
      setReport(data);
    } catch (error) {
      setMessage("Backend is not available. Start FastAPI on port 8000.");
      setReport({ tickets: [], bookings: [], count: 0, booking_count: 0, total_revenue: 0 });
    } finally {
      setLoading(false);
    }
  };

  const reissueTicket = async (ticketId) => {
    setReissueLoadingTicketId(ticketId);
    setMessage("");

    try {
      const response = await fetch(`${API}/admin/tickets/${ticketId}/reissue`, { method: "POST" });
      const data = await response.json();

      if (data.status !== "SUCCESS") {
        setMessage(data.message || "Unable to reissue ticket.");
        return;
      }

      setReissuedTicket(data.issued_ticket);
      setMessage(`Ticket ${ticketId} reissued successfully. PDF file created.`);
      await loadTransactions();
    } catch (error) {
      setMessage("Unable to reissue ticket. Please check that the backend is running.");
    } finally {
      setReissueLoadingTicketId("");
    }
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Backend is not available. Start FastAPI on port 8000."));
  }, []);

  const handleEventSelect = async (eventId) => {
    // Load ALL tickets for the selected event first.
    // Earlier versions auto-selected the first show date/time here, which made
    // valid ticket sales from other shows look like they were missing.
    setSelectedEventId(eventId);
    setSelectedDate("");
    setSelectedTime("");
    await loadTransactions({ eventId, date: "", time: "" });
  };

  const handleDateChange = async (date) => {
    // Date and time filters are optional. Selecting a date keeps time as ALL by
    // default so the admin can see every show on that day.
    setSelectedDate(date);
    setSelectedTime("");
    await loadTransactions({ date, time: "" });
  };

  const handleTimeChange = async (time) => {
    setSelectedTime(time);
    await loadTransactions({ time });
  };

  return (
    <main className="page tickets-sold-page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Admin ticket sales</p>
          <h1>Tickets Sold by Event</h1>
          <p className="hero-sub">Select an event from the left, choose date and time, view ticket transactions, and reissue individual tickets.</p>
        </div>
        <button className="secondary-btn" onClick={() => loadTransactions()}>Refresh</button>
      </section>

      <section className="tickets-sold-shell">
        <aside className="event-side-panel">
          <div className="side-panel-header">
            <h2>Events</h2>
            <span>{events.length}</span>
          </div>

          <div className="event-list-scroll">
            {events.length === 0 && <p className="empty-text">No events available.</p>}
            {events.map((event) => (
              <button
                key={event.event_id}
                className={selectedEventId === event.event_id ? "event-list-card active" : "event-list-card"}
                onClick={() => handleEventSelect(event.event_id)}
              >
                <strong>{event.event_name}</strong>
                <small>{getEventSchedules(event).length ? `${getEventSchedules(event).length} shows from ${getEventSchedules(event)[0].show_date}` : `${event.event_date} · ${event.event_time}`}</small>
                <span>{event.venue}{event.city ? `, ${event.city}` : ""}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="ticket-transaction-panel">
          <div className="transaction-filter-card">
            <div>
              <label>Selected Event</label>
              <strong>{selectedEvent ? selectedEvent.event_name : "Choose an event"}</strong>
            </div>

            <div>
              <label>Date</label>
              <select className="input" value={selectedDate} onChange={(e) => handleDateChange(e.target.value)} disabled={!selectedEventId}>
                <option value="">All dates</option>
                {eventDates.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>
            </div>

            <div>
              <label>Time</label>
              <select className="input" value={selectedTime} onChange={(e) => handleTimeChange(e.target.value)} disabled={!selectedEventId}>
                <option value="">All times</option>
                {eventTimes.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>
          </div>

          <div className="sales-kpi-grid">
            <div className="kpi-card"><span>Tickets Sold</span><strong>{report.count || 0}</strong></div>
            <div className="kpi-card"><span>Bookings</span><strong>{report.booking_count || 0}</strong></div>
            <div className="kpi-card"><span>Total Sales</span><strong>{formatCurrency(report.total_revenue)}</strong></div>
            <div className="kpi-card"><span>Event Status</span><strong>{selectedEvent?.status || "-"}</strong></div>
          </div>

          {message && <div className="message-box">{message}</div>}
          {loading && <div className="message-box">Loading ticket transactions...</div>}

          <div className="card">
            <div className="card-title-row">
              <div>
                <h2>Ticket Transactions</h2>
                <p className="muted-small">Each row represents one ticket / seat sold. Use Reissue to regenerate the 1Booking FaceID ticket QR and PDF.</p>
              </div>
            </div>

            <div className="transaction-table-wrap">
              <table className="transaction-table">
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Ticket ID</th>
                    <th>Buyer</th>
                    <th>Mobile</th>
                    <th>Seat</th>
                    <th>Class</th>
                    <th>Amount</th>
                    <th>Entry</th>
                    <th>Reissues</th>
                    <th>Booked At</th>
                    <th>PDF</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.tickets || []).length === 0 ? (
                    <tr>
                      <td colSpan="12" className="table-empty">No tickets found for the selected event/date/time. Clear the date and time filters to view all shows.</td>
                    </tr>
                  ) : (
                    report.tickets.map((ticket) => (
                      <tr key={ticket.ticket_id}>
                        <td>{ticket.booking_group_id}</td>
                        <td>{ticket.ticket_id}</td>
                        <td>{ticket.buyer_name}</td>
                        <td>{ticket.buyer_mobile}</td>
                        <td>{ticket.seat_id}</td>
                        <td>{ticket.section}</td>
                        <td>{formatCurrency(ticket.amount_paid)}</td>
                        <td><span className={ticket.entry_status === "CHECKED_IN" ? "status-pill success" : "status-pill"}>{ticket.entry_status}</span></td>
                        <td>{ticket.reissue_count || 0}</td>
                        <td>{ticket.booking_time ? ticket.booking_time.replace("T", " ").slice(0, 19) : ""}</td>
                        <td>{ticket.last_reissue_pdf_url ? <a href={ticket.last_reissue_pdf_url} target="_blank" rel="noreferrer">Download</a> : "-"}</td>
                        <td>
                          <button
                            className="table-action-btn"
                            type="button"
                            onClick={() => reissueTicket(ticket.ticket_id)}
                            disabled={reissueLoadingTicketId === ticket.ticket_id}
                          >
                            {reissueLoadingTicketId === ticket.ticket_id ? "Reissuing..." : "Reissue"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>

      <ReissuedTicketDialog ticket={reissuedTicket} onClose={() => setReissuedTicket(null)} />
    </main>
  );
}

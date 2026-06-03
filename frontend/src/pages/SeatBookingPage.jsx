import React, { useEffect, useMemo, useState } from "react";
import WebcamCapture from "../components/WebcamCapture.jsx";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");
const MAX_TICKETS_PER_BOOKING = 6;
const MAX_TICKETS_MESSAGE = "You can book a maximum of 6 tickets at once. For more than 6 tickets, please contact the office.";

const defaultWorkflowConfig = {
  biometric_enabled: true,
  multiple_shows_enabled: true,
  qr_ticket_enabled: true,
  ticket_cancellation_enabled: true,
  require_adjacent_seats: true,
  demo_data_enabled: true,
};

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

const highlightOptions = [
  { id: "COMING_SOON", title: "Coming Soon", artwork: "/artwork/coming-soon.png" },
  { id: "TRENDING", title: "Trending", artwork: "/artwork/trending.png" },
  { id: "RECOMMENDED", title: "Recommended", artwork: "/artwork/recommended.png" },
];

function getEventPoster(event) {
  const tags = Array.isArray(event?.highlight_tags) ? event.highlight_tags : [];
  const fallback = highlightOptions.find((option) => tags.includes(option.id))?.artwork;
  return event?.poster_image || fallback || "/artwork/create-event-ui-reference.png";
}

function eventLocationText(event) {
  return [event?.city, event?.state, event?.country].filter(Boolean).join(", ") || event?.venue || "Location to be announced";
}

function getEventTags(event) {
  const tags = Array.isArray(event?.highlight_tags) ? event.highlight_tags : [];
  return tags.map((tag) => highlightOptions.find((option) => option.id === tag)?.title || tag);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isSaleOpen(event) {
  if (!event?.sale_start_date) return true;
  return String(event.sale_start_date) <= todayIsoDate();
}

function saleClosedMessage(event) {
  if (!event?.sale_start_date) return "";
  return `Sales open on ${event.sale_start_date}`;
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
      doors_open_time: item.doors_open_time || "",
      duration_minutes: item.duration_minutes || 0,
      status: item.status || "ACTIVE",
    }));
  if (!normalized.length && event.event_date && event.event_time) {
    normalized.push({ show_id: "SCH001", show_date: event.event_date, show_time: event.event_time, doors_open_time: event.doors_open_time || "", duration_minutes: event.duration_minutes || 0, status: event.status || "ACTIVE" });
  }
  return normalized;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadTicketPdf(ticket) {
  const qrImg = ticket.qr_data_url || "";
  const html = `
    <html>
      <head>
        <title>${escapeHtml(ticket.booking_group_id || "1Booking FaceID Ticket")}</title>
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
              <h1>1Booking FaceID Biometric Event Ticket</h1>
              <h2>${escapeHtml(ticket.event_name)}</h2>
              <div class="grid">
                <span>Venue</span><strong>${escapeHtml(ticket.venue)}${ticket.city ? `, ${escapeHtml(ticket.city)}` : ""}</strong>
                <span>Date</span><strong>${escapeHtml(ticket.event_date)}</strong>
                <span>Time</span><strong>${escapeHtml(ticket.event_time)}</strong>
                <span>Purchaser</span><strong>${escapeHtml(ticket.buyer_name)}</strong>
                <span>Mobile</span><strong>${escapeHtml(ticket.buyer_mobile)}</strong>
                <span>Seats</span><strong>${escapeHtml((ticket.seat_numbers || []).join(", "))}</strong>
                <span>Booking ID</span><strong>${escapeHtml(ticket.booking_group_id)}</strong>
                <span>Biometric ID</span><strong>${escapeHtml(ticket.biometric_id)}</strong>
              </div>
            </div>
            ${qrImg ? `<img class="qr" src="${qrImg}" />` : `<div>No QR image available</div>`}
          </div>
          <p class="note">QR format: ${escapeHtml(ticket.qr_format || "1BOOKING_FACEID_TICKET_QR_V1")}. This QR carries the 1Booking FaceID biometric template/reference, not the raw face photograph.</p>
        </div>
        <button onclick="window.print()">Print / Save as PDF</button>
      </body>
    </html>`;
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
}

function TicketIssuedCard({ ticket }) {
  if (!ticket) return null;

  return (
    <div className="issued-ticket-card">
      <div className="ticket-top-strip">Ticket Issued Successfully</div>
      <div className="ticket-body-grid">
        <div>
          <p className="eyebrow">1Booking FaceID biometric ticket</p>
          <h2>{ticket.event_name}</h2>
          <div className="ticket-detail-grid">
            <span>Date</span><strong>{ticket.event_date}</strong>
            <span>Time</span><strong>{ticket.event_time}</strong>
            <span>Venue</span><strong>{ticket.venue}{ticket.city ? `, ${ticket.city}` : ""}</strong>
            <span>Purchaser</span><strong>{ticket.buyer_name}</strong>
            <span>Seats</span><strong>{ticket.seat_numbers.join(", ")}</strong>
            <span>Tickets</span><strong>{ticket.ticket_count}</strong>
            <span>Booking ID</span><strong>{ticket.booking_group_id}</strong>
            <span>QR Format</span><strong>{ticket.qr_format || "1BOOKING_FACEID_TICKET_QR_V1"}</strong>
          </div>
        </div>
        <div className="ticket-qr-panel">
          {ticket.qr_data_url ? (
            <img className="real-qr-image" src={ticket.qr_data_url} alt="1Booking FaceID biometric ticket QR" />
          ) : (
            <div className="qr-missing">QR image unavailable</div>
          )}
          <small>Real 1Booking FaceID QR: biometric template/reference, not raw photo</small>
          <button className="primary-btn full-width" onClick={() => downloadTicketPdf(ticket)}>
            Print / Save PDF Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SeatBookingPage({ currentUser }) {
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [ticketCount, setTicketCount] = useState(1);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [faceSignature, setFaceSignature] = useState([]);
  const [faceImageData, setFaceImageData] = useState("");
  const [message, setMessage] = useState("");
  const [issuedTicket, setIssuedTicket] = useState(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingCartId, setBookingCartId] = useState("");
  const [wizardStep, setWizardStep] = useState(0);
  const [workflowConfig, setWorkflowConfig] = useState(defaultWorkflowConfig);
  const [buyer, setBuyer] = useState({ buyer_name: currentUser?.full_name || "", buyer_mobile: currentUser?.mobile || "" });

  const selectedEvent = events.find((event) => event.event_id === selectedEventId);
  const selectedEventSchedules = useMemo(() => {
    if (!selectedEvent) return [];
    if (!workflowConfig.multiple_shows_enabled) {
      return [{ show_id: "SCH001", show_date: selectedEvent.event_date || "", show_time: selectedEvent.event_time || "", doors_open_time: selectedEvent.doors_open_time || "", duration_minutes: selectedEvent.duration_minutes || 0, status: selectedEvent.status || "ACTIVE" }].filter((item) => item.show_date && item.show_time);
    }
    return getEventSchedules(selectedEvent);
  }, [selectedEvent, workflowConfig.multiple_shows_enabled]);
  const eventDates = useMemo(() => uniqueValues(selectedEventSchedules.map((item) => item.show_date)), [selectedEventSchedules]);
  const eventTimes = useMemo(() => uniqueValues(selectedEventSchedules.filter((item) => !selectedDate || item.show_date === selectedDate).map((item) => item.show_time)), [selectedEventSchedules, selectedDate]);

  const eventTypeOptions = useMemo(() => uniqueValues(events.map((event) => event.event_type || "Event")), [events]);
  const eventDateOptions = useMemo(() => uniqueValues(events.flatMap((event) => getEventSchedules(event).map((item) => item.show_date))), [events]);
  const locationOptions = useMemo(() => uniqueValues(events.map((event) => eventLocationText(event))), [events]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return events.filter((event) => {
      const searchable = [
        event.event_name,
        event.artist_name,
        event.production_company,
        event.event_type,
        event.venue,
        event.city,
        event.state,
        event.country,
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesQuery = !query || searchable.includes(query);
      const matchesType = eventTypeFilter === "ALL" || (event.event_type || "Event") === eventTypeFilter;
      const availableDates = getEventSchedules(event).map((item) => item.show_date);
      const matchesDate = dateFilter === "ALL" || availableDates.includes(dateFilter);
      const matchesLocation = locationFilter === "ALL" || eventLocationText(event) === locationFilter;

      return matchesQuery && matchesType && matchesDate && matchesLocation;
    });
  }, [events, searchQuery, eventTypeFilter, dateFilter, locationFilter]);

  const currentStepName = () => wizardSteps[wizardStep]?.title || "Discovery";

  const logActivity = async (action, details = {}) => {
    try {
      await fetch(`${API}/analytics/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser?.user_id || "",
          username: currentUser?.username || currentUser?.mobile || "",
          full_name: currentUser?.full_name || "",
          role: currentUser?.role || "",
          action,
          page: "SeatBookingPage",
          event_id: selectedEventId || details.event_id || "",
          event_name: selectedEvent?.event_name || details.event_name || "",
          details,
        }),
      });
    } catch (error) {
      // Logging must never block booking.
    }
  };

  const saveCartSnapshot = async (status = "IN_PROGRESS", reason = "") => {
    if (!bookingCartId || !selectedEventId) return;
    try {
      await fetch(`${API}/analytics/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: bookingCartId,
          user_id: currentUser?.user_id || "",
          username: currentUser?.username || currentUser?.mobile || buyer.buyer_mobile || "",
          full_name: currentUser?.full_name || buyer.buyer_name || "",
          mobile: currentUser?.mobile || buyer.buyer_mobile || "",
          event_id: selectedEventId,
          event_name: selectedEvent?.event_name || "",
          event_date: selectedDate,
          event_time: selectedTime,
          ticket_count: ticketCount,
          selected_seats: selectedSeats.map((seat) => seat.seat_id),
          amount: totalAmount,
          step: currentStepName(),
          status,
          reason,
        }),
      });
    } catch (error) {
      // Cart logging must never block booking.
    }
  };

  const loadEvents = async () => {
    const res = await fetch(`${API}/events`);
    const data = await res.json();
    setEvents(data);
  };

  const loadWorkflowConfig = async () => {
    const res = await fetch(`${API}/config`);
    const data = await res.json();
    setWorkflowConfig({ ...defaultWorkflowConfig, ...data });
  };

  const loadSeats = async (eventId, dateValue = selectedDate, timeValue = selectedTime) => {
    const params = new URLSearchParams();
    if (dateValue) params.set("event_date", dateValue);
    if (timeValue) params.set("event_time", timeValue);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API}/events/${eventId}/seats${query}`);
    const data = await res.json();
    setSeats(data);
  };

  const seedDemo = async () => {
    const res = await fetch(`${API}/seed-demo`, { method: "POST" });
    const data = await res.json();
    setMessage(data.message || "Demo event and seat layout created.");
    await loadEvents();
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Backend not available. Start FastAPI on port 8000."));
    loadWorkflowConfig().catch(() => {});
    logActivity("PAGE_VIEW", { page_title: "Book Tickets" });
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    setBuyer((previous) => ({
      buyer_name: previous.buyer_name || currentUser.full_name || currentUser.name || currentUser.username || "",
      buyer_mobile: previous.buyer_mobile || currentUser.mobile || currentUser.phone || currentUser.phone_number || "",
    }));
  }, [currentUser]);

  useEffect(() => {
    if (!bookingDialogOpen || !bookingCartId || !selectedEventId || issuedTicket) return;
    const timer = setTimeout(() => {
      saveCartSnapshot("IN_PROGRESS", "Booking wizard progress saved");
    }, 500);
    return () => clearTimeout(timer);
  }, [bookingDialogOpen, bookingCartId, selectedEventId, selectedDate, selectedTime, ticketCount, selectedSeats.length, wizardStep, buyer.buyer_name, buyer.buyer_mobile]);

  const groupedSeats = useMemo(() => {
    return seats.reduce((groups, seat) => {
      if (!groups[seat.row]) groups[seat.row] = [];
      groups[seat.row].push(seat);
      return groups;
    }, {});
  }, [seats]);

  const selectedSeatIds = selectedSeats.map((seat) => seat.seat_id);
  const totalAmount = selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const isInventoryLayout = seats.some((seat) => ["NO_SEATING", "FIRST_COME_FIRST_SERVE"].includes(seat.seating_mode));

  const classInventory = useMemo(() => {
    const classes = uniqueValues(seats.map((seat) => seat.section));
    return classes.map((className) => {
      const classSeats = seats.filter((seat) => seat.section === className);
      return {
        className,
        total: classSeats.length,
        available: classSeats.filter((seat) => seat.status === "AVAILABLE"),
        booked: classSeats.filter((seat) => seat.status === "BOOKED").length,
      };
    });
  }, [seats]);

  const onEventChange = async (eventId) => {
    const event = events.find((item) => item.event_id === eventId);
    if (event && !isSaleOpen(event)) {
      setSelectedEventId("");
      setSelectedDate("");
      setSelectedTime("");
      setSelectedSeats([]);
      setIssuedTicket(null);
      setSeats([]);
      setMessage(saleClosedMessage(event));
      return;
    }
    const schedules = getEventSchedules(event);
    const firstSchedule = schedules[0] || {};
    const nextDate = firstSchedule.show_date || "";
    const nextTime = firstSchedule.show_time || "";
    setSelectedEventId(eventId);
    setSelectedDate(nextDate);
    setSelectedTime(nextTime);
    setSelectedSeats([]);
    setIssuedTicket(null);
    if (eventId) await loadSeats(eventId, nextDate, nextTime);
  };

  const openBookingDialog = async (eventId) => {
    const event = events.find((item) => item.event_id === eventId);
    if (event && !isSaleOpen(event)) {
      setMessage(saleClosedMessage(event));
      logActivity("SALE_LOCKED_EVENT_CLICKED", { event_id: eventId, event_name: event?.event_name, sale_start_date: event?.sale_start_date });
      return;
    }
    const nextCartId = `CART${Date.now()}${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    setBookingCartId(nextCartId);
    await onEventChange(eventId);
    setWizardStep(0);
    setIssuedTicket(null);
    setMessage("");
    setBookingDialogOpen(true);
    logActivity("BOOKING_STARTED", { event_id: eventId, event_name: event?.event_name, cart_id: nextCartId });
  };

  const closeBookingDialog = () => {
    if (bookingDialogOpen && bookingCartId && !issuedTicket) {
      saveCartSnapshot("ABANDONED", "User closed the booking dialog before ticket issue");
      logActivity("BOOKING_DIALOG_CLOSED", { cart_id: bookingCartId, step: currentStepName(), status: "ABANDONED" });
    }
    setBookingDialogOpen(false);
    setWizardStep(0);
  };

  const onTicketCountChange = (value) => {
    const requestedCount = Math.max(1, Number(value || 1));
    if (requestedCount > MAX_TICKETS_PER_BOOKING) {
      setTicketCount(MAX_TICKETS_PER_BOOKING);
      setSelectedSeats([]);
      setIssuedTicket(null);
      setMessage(MAX_TICKETS_MESSAGE);
      return;
    }

    setTicketCount(requestedCount);
    setSelectedSeats([]);
    setIssuedTicket(null);
    logActivity("TICKET_COUNT_SELECTED", { ticket_count: requestedCount, cart_id: bookingCartId });
  };

  const onDateChange = async (value) => {
    setSelectedDate(value);
    const availableTimes = uniqueValues(selectedEventSchedules.filter((item) => item.show_date === value).map((item) => item.show_time));
    const nextTime = availableTimes.includes(selectedTime) ? selectedTime : (availableTimes[0] || "");
    setSelectedTime(nextTime);
    setSelectedSeats([]);
    if (selectedEventId) await loadSeats(selectedEventId, value, nextTime);
  };

  const onTimeChange = async (value) => {
    setSelectedTime(value);
    setSelectedSeats([]);
    if (selectedEventId) await loadSeats(selectedEventId, selectedDate, value);
  };

  const seatClass = (seat) => {
    if (seat.status === "BOOKED") return "seat booked";
    if (selectedSeatIds.includes(seat.seat_id)) return "seat selected";
    if (seat.seating_mode === "NO_SEATING") return "seat no-seat";
    if (seat.seating_mode === "FIRST_COME_FIRST_SERVE") return "seat fcfs";
    return `seat ${String(seat.section || "general").toLowerCase()}`;
  };

  const selectAdjacentSeats = (seat) => {
    if (seat.status === "BOOKED") return;

    if (!workflowConfig.require_adjacent_seats) {
      setSelectedSeats((current) => {
        const alreadySelected = current.some((item) => item.seat_id === seat.seat_id);
        if (alreadySelected) return current.filter((item) => item.seat_id !== seat.seat_id);
        if (current.length >= ticketCount) {
          setMessage(`You can select only ${ticketCount} seats.`);
          return current;
        }
        const next = [...current, seat];
        setMessage(`${next.length} of ${ticketCount} seats selected.`);
        return next;
      });
      setIssuedTicket(null);
      return;
    }

    const sameRow = seats
      .filter((item) => item.row === seat.row && item.status === "AVAILABLE")
      .sort((a, b) => Number(a.seat_number) - Number(b.seat_number));

    const startIndex = sameRow.findIndex((item) => item.seat_id === seat.seat_id);
    const picked = sameRow.slice(startIndex, startIndex + ticketCount);

    const isContiguous = picked.length === ticketCount && picked.every((item, index) => Number(item.seat_number) === Number(seat.seat_number) + index);

    if (!isContiguous) {
      setMessage(`Please choose ${ticketCount} adjacent available seats in the same row.`);
      return;
    }

    setSelectedSeats(picked);
    setIssuedTicket(null);
    setMessage(`${picked.length} adjacent seats selected: ${picked.map((item) => item.seat_id).join(", ")}`);
  };

  const selectInventoryUnits = (className) => {
    const available = seats.filter((seat) => seat.section === className && seat.status === "AVAILABLE").slice(0, ticketCount);
    if (available.length < ticketCount) {
      setMessage(`Only ${available.length} ${className} booking units are available.`);
      return;
    }
    setSelectedSeats(available);
    setIssuedTicket(null);
    setMessage(`${ticketCount} ${className} booking units selected.`);
  };

  const bookSeat = async () => {
    if (!selectedEventId) return setMessage("Please choose an event.");
    if (!selectedDate) return setMessage("Please choose an event date.");
    if (!selectedTime) return setMessage("Please choose an event time.");
    if (!ticketCount || ticketCount < 1) return setMessage("Please enter the number of tickets.");
    if (ticketCount > MAX_TICKETS_PER_BOOKING) return setMessage(MAX_TICKETS_MESSAGE);
    if (selectedSeats.length !== ticketCount) return setMessage(`Please select exactly ${ticketCount} seats.`);
    if (!buyer.buyer_name || !buyer.buyer_mobile) return setMessage("Please enter purchaser details.");
    if (workflowConfig.biometric_enabled && !faceSignature.length) return setMessage("Please capture purchaser biometric before booking.");

    const res = await fetch(`${API}/tickets/book-seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: selectedEventId,
        event_date: selectedDate,
        event_time: selectedTime,
        seat_ids: selectedSeats.map((seat) => seat.seat_id),
        buyer_name: buyer.buyer_name,
        buyer_mobile: buyer.buyer_mobile,
        face_signature: workflowConfig.biometric_enabled ? faceSignature : [],
        face_image_data: workflowConfig.biometric_enabled ? faceImageData : "",
      }),
    });
    const data = await res.json();
    setMessage(data.message);
    if (data.status === "SUCCESS") {
      await saveCartSnapshot("COMPLETED", "Ticket issued successfully");
      logActivity("TICKET_ISSUED", { cart_id: bookingCartId, booking_group_id: data.issued_ticket?.booking_group_id, ticket_count: data.issued_ticket?.ticket_count, total_amount: data.issued_ticket?.total_amount });
      setIssuedTicket(data.issued_ticket);
      setWizardStep(4);
      await loadSeats(selectedEventId, selectedDate, selectedTime);
      setSelectedSeats([]);
      setFaceSignature([]);
      setFaceImageData("");
    }
  };

  const bookingFlowContent = (
    <>
      <section className="booking-flow-card booking-flow-anchor">
        <div className="flow-step">
          <label>1. Choose Event</label>
          <select className="input" value={selectedEventId} onChange={(e) => onEventChange(e.target.value)}>
            <option value="">Choose event</option>
            {events.map((event) => (
              <option key={event.event_id} value={event.event_id} disabled={!isSaleOpen(event)}>
                {event.event_name} - {event.venue}{!isSaleOpen(event) ? ` (${saleClosedMessage(event)})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flow-step">
          <label>2. Choose Date {workflowConfig.multiple_shows_enabled ? "" : "(Single show)"}</label>
          <select className="input" value={selectedDate} onChange={(e) => onDateChange(e.target.value)} disabled={!selectedEventId}>
            <option value="">Choose date</option>
            {eventDates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
        </div>

        <div className="flow-step">
          <label>3. Choose Time {workflowConfig.multiple_shows_enabled ? "" : "(Single show)"}</label>
          <select className="input" value={selectedTime} onChange={(e) => onTimeChange(e.target.value)} disabled={!selectedEventId || !selectedDate}>
            <option value="">Choose time</option>
            {eventTimes.map((time) => <option key={time} value={time}>{time}</option>)}
          </select>
        </div>

        <div className="flow-step">
          <label>4. No. of Tickets</label>
          <input className="input" type="number" min="1" max={MAX_TICKETS_PER_BOOKING} value={ticketCount} onChange={(e) => onTicketCountChange(e.target.value)} />
          <small className="field-help">Maximum 6 tickets per booking. For more than 6, please contact the office.</small>
        </div>
      </section>

      <section className="booking-grid">
        <div className="left-panel">
          <div className="card layout-card">
            <div className="card-title-row">
              <div>
                <h2>5. Select Seats</h2>
                <p className="muted-small">{workflowConfig.require_adjacent_seats ? `Click a starting seat to select ${ticketCount} adjacent seats together.` : `Select ${ticketCount} available seats visually.`}</p>
              </div>
              <span className="pill">{seats.filter((seat) => seat.status === "AVAILABLE").length} available</span>
            </div>
            <div className="stage">STAGE</div>
            <div className="legend">
              <span><i className="box vip-box" />VIP</span>
              <span><i className="box premium-box" />Premium</span>
              <span><i className="box general-box" />General</span>
              <span><i className="box selected-box" />Selected</span>
              <span><i className="box booked-box" />Booked</span>
            </div>
            {isInventoryLayout ? (
              <div className="inventory-layout">
                {classInventory.map((item) => (
                  <button key={item.className} className="inventory-card clickable" disabled={item.available.length < ticketCount} onClick={() => selectInventoryUnits(item.className)}>
                    <span>{item.className}</span>
                    <strong>{item.available.length} available</strong>
                    <small>{item.booked} booked / {item.total} total</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="seat-layout">
                {Object.keys(groupedSeats).length === 0 && <p className="empty-text">No seats found. Create demo data or generate a seating layout.</p>}
                {Object.keys(groupedSeats).map((row) => (
                  <div key={row} className="seat-row">
                    <span className="row-label">{row}</span>
                    <div className="seat-row-items">
                      {groupedSeats[row].map((seat) => (
                        <button key={seat.seat_id} className={seatClass(seat)} disabled={seat.status === "BOOKED"} title={`${seat.section} ₹${seat.price}`} onClick={() => selectAdjacentSeats(seat)}>
                          {seat.seat_number}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="right-panel">
          <div className="card summary-card">
            <h2>Booking Summary</h2>
            {selectedSeats.length ? (
              <div className="summary-box">
                <div><span>Event</span><strong>{selectedEvent?.event_name}</strong></div>
                <div><span>Date / Time</span><strong>{selectedDate} {selectedTime}</strong></div>
                <div><span>Seats</span><strong>{selectedSeats.map((seat) => seat.seat_id).join(", ")}</strong></div>
                <div><span>Tickets</span><strong>{selectedSeats.length}</strong></div>
                <div><span>Total</span><strong>₹{totalAmount}</strong></div>
              </div>
            ) : <p className="empty-text">Select seats to continue.</p>}
          </div>

          <div className="card">
            <h2>Purchaser Details</h2>
            <div className="mandatory-field">
              <label>Purchaser Name <span className="required-asterisk">*</span></label>
              <input
                className="input"
                placeholder="Purchaser name"
                value={buyer.buyer_name}
                required
                onChange={(e) => setBuyer({ ...buyer, buyer_name: e.target.value })}
              />
            </div>
            <div className="mandatory-field">
              <label>Mobile Number <span className="required-asterisk">*</span></label>
              <input
                className="input"
                placeholder="Mobile number"
                value={buyer.buyer_mobile}
                required
                onChange={(e) => setBuyer({ ...buyer, buyer_mobile: e.target.value })}
              />
            </div>
          </div>

          {workflowConfig.biometric_enabled ? (
            <div className="card">
              <h2>6. Capture Purchaser Biometric</h2>
              <WebcamCapture onCapture={(capture) => { setFaceSignature(capture.faceSignature); setFaceImageData(capture.imageData); setIssuedTicket(null); setMessage(`Biometric captured successfully using ${capture.signatureEngine || "1Booking FaceID"}.`); }} compact />
              {faceSignature.length > 0 && <div className="success-note">Face biometric captured successfully</div>}
            </div>
          ) : (
            <div className="card">
              <h2>6. Biometric Disabled</h2>
              <p className="empty-text">Admin workflow configuration has disabled biometric capture for this booking flow.</p>
            </div>
          )}

          <button className="book-button" onClick={bookSeat}>7. Save Ticket and Issue</button>
          {message && <div className="message-box">{message}</div>}
        </aside>
      </section>

      <TicketIssuedCard ticket={issuedTicket} />
    </>
  );



  const wizardSteps = [
    { title: "Show", subtitle: "Date & time" },
    { title: "Tickets", subtitle: "Count" },
    { title: "Seats", subtitle: "Visual selection" },
    { title: "FaceID", subtitle: "Purchaser" },
    { title: "Issue", subtitle: "Ticket" },
  ];

  const validateWizardStep = () => {
    if (wizardStep === 0) {
      if (!selectedEventId) return "Please choose an event.";
      if (!selectedDate) return "Please choose a show date.";
      if (!selectedTime) return "Please choose a show time.";
    }
    if (wizardStep === 1) {
      if (!ticketCount || ticketCount < 1) return "Please enter the number of tickets.";
      if (ticketCount > MAX_TICKETS_PER_BOOKING) return MAX_TICKETS_MESSAGE;
    }
    if (wizardStep === 2 && selectedSeats.length !== ticketCount) {
      return `Please select exactly ${ticketCount} seats before continuing.`;
    }
    if (wizardStep === 3) {
      if (!buyer.buyer_name || !buyer.buyer_mobile) return "Please enter purchaser name and mobile number.";
      if (workflowConfig.biometric_enabled && !faceSignature.length) return "Please capture purchaser biometric before issuing the ticket.";
    }
    return "";
  };

  const goToNextWizardStep = () => {
    const validation = validateWizardStep();
    if (validation) {
      setMessage(validation);
      return;
    }
    setMessage("");
    const nextStep = Math.min(wizardStep + 1, wizardSteps.length - 1);
    logActivity("BOOKING_WIZARD_STEP", { cart_id: bookingCartId, from_step: currentStepName(), to_step: wizardSteps[nextStep]?.title });
    saveCartSnapshot("IN_PROGRESS", "User moved to next wizard step");
    setWizardStep(nextStep);
  };

  const goToPreviousWizardStep = () => {
    setMessage("");
    setWizardStep((current) => Math.max(current - 1, 0));
  };

  const wizardContent = (
    <div className="booking-wizard-shell">
      <div className="booking-wizard-steps">
        {wizardSteps.map((step, index) => (
          <button
            key={step.title}
            type="button"
            className={["wizard-step-pill", index === wizardStep ? "active" : "", index < wizardStep ? "done" : ""].filter(Boolean).join(" ")}
            onClick={() => index <= wizardStep && setWizardStep(index)}
            disabled={index > wizardStep}
          >
            <span>{index + 1}</span>
            <strong>{step.title}</strong>
            <small>{step.subtitle}</small>
          </button>
        ))}
      </div>

      <div className="booking-wizard-body">
        {wizardStep === 0 && (
          <section className="wizard-panel two-column-wizard-panel">
            <div className="wizard-event-preview">
              {selectedEvent && <img src={getEventPoster(selectedEvent)} alt={`${selectedEvent.event_name} poster`} />}
              <div>
                <p className="eyebrow">Selected event</p>
                <h2>{selectedEvent?.event_name || "Choose an event"}</h2>
                <p>{selectedEvent ? `${selectedEvent.event_type || "Event"} • ${eventLocationText(selectedEvent)}` : "Pick an event from the poster gallery."}</p>
              </div>
            </div>

            <div className="wizard-form-card">
              <label>Show Date <span className="required-asterisk">*</span></label>
              <select className="input" value={selectedDate} onChange={(e) => onDateChange(e.target.value)} disabled={!selectedEventId}>
                <option value="">Choose date</option>
                {eventDates.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>

              <label>Show Time <span className="required-asterisk">*</span></label>
              <select className="input" value={selectedTime} onChange={(e) => onTimeChange(e.target.value)} disabled={!selectedEventId || !selectedDate}>
                <option value="">Choose time</option>
                {eventTimes.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>

              <div className="wizard-note-card">
                <strong>Booking starts here</strong>
                <span>Date and time decide which seats are available for this show.</span>
              </div>
            </div>
          </section>
        )}

        {wizardStep === 1 && (
          <section className="wizard-panel compact-wizard-panel">
            <p className="eyebrow">Ticket quantity</p>
            <h2>How many tickets do you want?</h2>
            <p className="muted-text">You can book up to 6 tickets in one transaction. For group booking, please contact the office.</p>
            <div className="ticket-count-selector">
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <button key={count} type="button" className={ticketCount === count ? "count-chip active" : "count-chip"} onClick={() => onTicketCountChange(count)}>{count}</button>
              ))}
            </div>
            <input className="input wizard-number-input" type="number" min="1" max={MAX_TICKETS_PER_BOOKING} value={ticketCount} onChange={(e) => onTicketCountChange(e.target.value)} />
            <small className="field-help">Maximum 6 tickets per booking. For more than 6, please contact the office.</small>
          </section>
        )}

        {wizardStep === 2 && (
          <section className="wizard-panel">
            <div className="card-title-row">
              <div>
                <p className="eyebrow">Seat selection</p>
                <h2>Select {ticketCount} {ticketCount === 1 ? "seat" : "seats"}</h2>
                <p className="muted-small">{workflowConfig.require_adjacent_seats ? `Click a starting seat to select ${ticketCount} adjacent seats together.` : `Select ${ticketCount} available seats visually.`}</p>
              </div>
              <span className="pill">{seats.filter((seat) => seat.status === "AVAILABLE").length} available</span>
            </div>
            <div className="stage wizard-stage">STAGE</div>
            {isInventoryLayout ? (
              <div className="inventory-layout">
                {classInventory.map((item) => (
                  <button key={item.className} className="inventory-card clickable" disabled={item.available.length < ticketCount} onClick={() => selectInventoryUnits(item.className)}>
                    <span>{item.className}</span>
                    <strong>{item.available.length} available</strong>
                    <small>{item.booked} booked / {item.total} total</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="seat-layout wizard-seat-layout">
                {Object.keys(groupedSeats).length === 0 && <p className="empty-text">No seats found. Ask admin to generate a seating layout.</p>}
                {Object.keys(groupedSeats).map((row) => (
                  <div key={row} className="seat-row">
                    <span className="row-label">{row}</span>
                    <div className="seat-row-items">
                      {groupedSeats[row].map((seat) => (
                        <button key={seat.seat_id} className={seatClass(seat)} disabled={seat.status === "BOOKED"} title={`${seat.section} ₹${seat.price}`} onClick={() => selectAdjacentSeats(seat)}>
                          {seat.seat_number}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="wizard-summary-strip">
              <span>Selected seats</span>
              <strong>{selectedSeats.length ? selectedSeats.map((seat) => seat.seat_id).join(", ") : "None selected"}</strong>
              <span>Total</span>
              <strong>₹{totalAmount}</strong>
            </div>
          </section>
        )}

        {wizardStep === 3 && (
          <section className="wizard-panel two-column-wizard-panel">
            <div className="wizard-form-card">
              <p className="eyebrow">Purchaser</p>
              <h2>Confirm purchaser details</h2>
              <div className="mandatory-field">
                <label>Purchaser Name <span className="required-asterisk">*</span></label>
                <input className="input" placeholder="Purchaser name" value={buyer.buyer_name} required onChange={(e) => setBuyer({ ...buyer, buyer_name: e.target.value })} />
              </div>
              <div className="mandatory-field">
                <label>Mobile Number <span className="required-asterisk">*</span></label>
                <input className="input" placeholder="Mobile number" value={buyer.buyer_mobile} required onChange={(e) => setBuyer({ ...buyer, buyer_mobile: e.target.value })} />
              </div>
              <div className="summary-box wizard-mini-summary">
                <div><span>Tickets</span><strong>{ticketCount}</strong></div>
                <div><span>Seats</span><strong>{selectedSeats.map((seat) => seat.seat_id).join(", ")}</strong></div>
                <div><span>Total</span><strong>₹{totalAmount}</strong></div>
              </div>
            </div>

            <div className="wizard-form-card">
              {workflowConfig.biometric_enabled ? (
                <>
                  <p className="eyebrow">1Booking FaceID</p>
                  <h2>Capture purchaser FaceID</h2>
                  <WebcamCapture onCapture={(capture) => { setFaceSignature(capture.faceSignature); setFaceImageData(capture.imageData); setIssuedTicket(null); setMessage(`Biometric captured successfully using ${capture.signatureEngine || "1Booking FaceID"}.`); }} compact />
                  {faceSignature.length > 0 && <div className="success-note">Face biometric captured successfully</div>}
                </>
              ) : (
                <>
                  <p className="eyebrow">Workflow setting</p>
                  <h2>Biometric Disabled</h2>
                  <p className="empty-text">Admin workflow configuration has disabled biometric capture for this booking flow.</p>
                </>
              )}
            </div>
          </section>
        )}

        {wizardStep === 4 && (
          <section className="wizard-panel">
            {issuedTicket ? (
              <TicketIssuedCard ticket={issuedTicket} />
            ) : (
              <div className="wizard-issue-card">
                <p className="eyebrow">Final confirmation</p>
                <h2>Ready to issue your ticket?</h2>
                <div className="summary-box wizard-confirm-summary">
                  <div><span>Event</span><strong>{selectedEvent?.event_name}</strong></div>
                  <div><span>Date / Time</span><strong>{selectedDate} {selectedTime}</strong></div>
                  <div><span>Purchaser</span><strong>{buyer.buyer_name}</strong></div>
                  <div><span>Seats</span><strong>{selectedSeats.map((seat) => seat.seat_id).join(", ")}</strong></div>
                  <div><span>Total</span><strong>₹{totalAmount}</strong></div>
                </div>
                <button className="book-button" onClick={bookSeat}>Save Ticket and Issue</button>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="booking-wizard-footer">
        <button className="secondary-btn" onClick={goToPreviousWizardStep} disabled={wizardStep === 0}>Back</button>
        {wizardStep < 3 && <button className="primary-btn" onClick={goToNextWizardStep}>Continue</button>}
        {wizardStep === 3 && <button className="primary-btn" onClick={goToNextWizardStep}>Review & Issue</button>}
        {wizardStep === 4 && !issuedTicket && <button className="primary-btn" onClick={bookSeat}>Save Ticket and Issue</button>}
        {wizardStep === 4 && issuedTicket && <button className="primary-btn" onClick={closeBookingDialog}>Done</button>}
      </div>

      {message && <div className="message-box wizard-message-box">{message}</div>}
    </div>
  );


  return (
    <main className="page booking-page audience-booking-page">
      <section className="audience-hero">
        <div className="audience-hero-copy">
          <span className="audience-pill">Biometric ticketing with 1Booking</span>
          <h1>Find your next event and book seats with your face.</h1>
          <p>Explore concerts, stage shows, festivals and special events. Select seats visually, capture purchaser FaceID once, and get a QR ticket instantly.</p>
        </div>
        <div className="audience-hero-card">
          <strong>{events.length}</strong>
          <span>Events listed</span>
          {workflowConfig.demo_data_enabled && (
            <button className="primary-btn" onClick={seedDemo}>Create Demo Data</button>
          )}
        </div>
      </section>

      <section className="event-discovery-panel">
        <div className="discovery-header">
          <div>
            <p className="eyebrow">Discover events</p>
            <h2>Browse posters</h2>
          </div>
          <span className="pill">{filteredEvents.length} matching</span>
        </div>

        <div className="audience-filter-bar">
          <div className="search-box wide-search">
            <span>⌕</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event, artist, venue, city..."
            />
          </div>
          <select className="input" value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
            <option value="ALL">All event types</option>
            {eventTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select className="input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="ALL">Any date</option>
            {eventDateOptions.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
          <select className="input" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="ALL">All locations</option>
            {locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
        </div>

        <div className="poster-showcase-grid">
          {filteredEvents.length === 0 && (
            <div className="empty-discovery-card">
              <strong>No events found</strong>
              <span>Try changing the search or filters, or create demo data.</span>
            </div>
          )}

          {filteredEvents.map((event) => {
            const active = event.event_id === selectedEventId;
            const tags = getEventTags(event);
            const saleOpen = isSaleOpen(event);
            const cardClassName = ["audience-poster-card", active ? "active" : "", !saleOpen ? "sale-locked" : ""].filter(Boolean).join(" ");
            return (
              <article key={event.event_id} className={cardClassName}>
                <button className="poster-card-image" onClick={() => saleOpen && openBookingDialog(event.event_id)} disabled={!saleOpen}>
                  <img src={getEventPoster(event)} alt={`${event.event_name} poster`} />
                  <div className="poster-gradient"></div>
                  <div className="poster-badges">
                    {tags.length ? tags.map((tag) => <span key={tag}>{tag}</span>) : <span>{event.event_type || "Event"}</span>}
                  </div>
                </button>
                <div className="poster-card-body">
                  <p>{event.event_type || "Event"}</p>
                  <h3>{event.event_name}</h3>
                  <span>{event.artist_name || event.production_company || "Featured event"}</span>
                  <div className="poster-meta-row">
                    <small>{getEventSchedules(event).length ? `${getEventSchedules(event).length} shows from ${getEventSchedules(event)[0].show_date}` : (event.event_date || "Date TBA")}</small>
                    <small>{eventLocationText(event)}</small>
                    {!saleOpen && <small className="sale-locked-text">{saleClosedMessage(event)}</small>}
                  </div>
                  <button className={active ? "primary-btn full-width" : "secondary-btn full-width"} onClick={() => openBookingDialog(event.event_id)} disabled={!saleOpen}>
                    {!saleOpen ? "Sales not open" : active && bookingDialogOpen ? "Booking open" : "Book this event"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {bookingDialogOpen && (
        <div className="booking-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Book selected event">
          <div className="booking-dialog-panel booking-dialog-panel-wizard">
            <div className="booking-dialog-header">
              <div className="booking-dialog-event">
                {selectedEvent && <img src={getEventPoster(selectedEvent)} alt={`${selectedEvent.event_name} poster`} />}
                <div>
                  <p className="eyebrow">Complete booking</p>
                  <h2>{selectedEvent?.event_name || "Book Tickets"}</h2>
                  <span>{selectedEvent ? `${selectedEvent.event_type || "Event"} • ${eventLocationText(selectedEvent)}` : "Select event details"}</span>
                </div>
              </div>
              <button className="dialog-close-btn" onClick={closeBookingDialog} aria-label="Close booking dialog">×</button>
            </div>
            <div className="booking-dialog-content">
              {wizardContent}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

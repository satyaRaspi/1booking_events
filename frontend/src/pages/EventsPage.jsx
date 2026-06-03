import React, { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

const defaultWorkflowConfig = {
  biometric_enabled: true,
  multiple_shows_enabled: true,
  qr_ticket_enabled: true,
  ticket_cancellation_enabled: true,
  require_adjacent_seats: true,
  demo_data_enabled: true,
};

const artworkMap = {
  COMING_SOON: "/artwork/coming-soon.png",
  TRENDING: "/artwork/trending.png",
  RECOMMENDED: "/artwork/recommended.png",
};

const highlightOptions = [
  {
    id: "COMING_SOON",
    title: "Coming Soon",
    icon: "🚀",
    description: "Build anticipation for upcoming events.",
    artwork: artworkMap.COMING_SOON,
  },
  {
    id: "TRENDING",
    title: "Trending",
    icon: "🔥",
    description: "Highlight popular and fast-moving events.",
    artwork: artworkMap.TRENDING,
  },
  {
    id: "RECOMMENDED",
    title: "Recommended",
    icon: "⭐",
    description: "Promote suggested events to the audience.",
    artwork: artworkMap.RECOMMENDED,
  },
];

const emptyForm = {
  event_name: "",
  event_type: "Concert",
  artist_name: "",
  production_company: "",
  organizer_name: "",
  venue: "",
  address_line1: "",
  city: "",
  state: "",
  country: "India",
  pincode: "",
  latitude: "",
  longitude: "",
  event_date: "",
  event_time: "",
  show_schedules: [{ show_date: "", show_time: "", doors_open_time: "", duration_minutes: 0, status: "ACTIVE" }],
  doors_open_time: "",
  duration_minutes: 0,
  total_tickets: 0,
  number_of_classes: 0,
  sponsor_foc_tickets: 0,
  blocked_tickets: 0,
  sale_start_date: "",
  sale_end_date: "",
  age_restriction: "",
  description: "",
  terms: "",
  status: "ACTIVE",
  poster_image: "",
  poster_name: "",
  highlight_tags: [],
};

const eventTypes = ["Concert", "Stage Show", "Movie Premiere", "Sports", "Comedy", "Conference", "Festival", "Workshop", "Exhibition", "College Fest", "Other"];
const eventStatuses = ["ACTIVE", "DRAFT", "PAUSED", "SOLD_OUT", "CANCELLED"];
const defaultClassNames = ["VIP", "Premium", "General", "Class 4", "Class 5", "Class 6"];
const defaultClassPrices = [5000, 2500, 1000, 750, 500, 250];

function makeClassRows(count, sellableTickets, existingRows = []) {
  const classCount = Math.max(Number(count || 0), 0);
  const rows = [];
  let remaining = Number(sellableTickets || 0);

  for (let index = 0; index < classCount; index += 1) {
    const existing = existingRows[index] || {};
    const slotsLeft = classCount - index;
    const defaultQuantity = slotsLeft > 0 ? Math.floor(remaining / slotsLeft) : remaining;
    remaining -= defaultQuantity;

    rows.push({
      class_name: existing.class_name || defaultClassNames[index] || `Class ${index + 1}`,
      price: existing.price ?? defaultClassPrices[index] ?? 500,
      quantity: existing.quantity ?? defaultQuantity,
      benefits: existing.benefits || "",
      seating_mode: existing.seating_mode || "ASSIGNED_SEAT",
    });
  }

  return rows;
}

function formatDateTime(date, time) {
  if (!date && !time) return "Date and time pending";
  return `${date || "Date pending"}${time ? ` • ${time}` : ""}`;
}

function selectedHighlightLabels(tags = []) {
  return highlightOptions.filter((option) => tags.includes(option.id)).map((option) => option.title);
}

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ ...emptyForm });
  const [editingEventId, setEditingEventId] = useState(null);
  const [classRows, setClassRows] = useState([]);
  const [workflowConfig, setWorkflowConfig] = useState(defaultWorkflowConfig);

  const sellableTickets = useMemo(() => Math.max(
    Number(form.total_tickets || 0) - Number(form.sponsor_foc_tickets || 0) - Number(form.blocked_tickets || 0),
    0
  ), [form.total_tickets, form.sponsor_foc_tickets, form.blocked_tickets]);

  const classTotal = useMemo(
    () => classRows.reduce((total, row) => total + Number(row.quantity || 0), 0),
    [classRows]
  );

  const setField = (field, value) => {
    setForm((current) => {
      const nextForm = { ...current, [field]: value };
      if (["total_tickets", "sponsor_foc_tickets", "blocked_tickets", "number_of_classes"].includes(field)) {
        const nextSellable = Math.max(
          Number(nextForm.total_tickets || 0) - Number(nextForm.sponsor_foc_tickets || 0) - Number(nextForm.blocked_tickets || 0),
          0
        );
        setClassRows((currentRows) => makeClassRows(Number(nextForm.number_of_classes || 0), nextSellable, currentRows));
      }
      return nextForm;
    });
  };

  const setClassField = (index, field, value) => {
    setClassRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const updateShowSchedule = (index, field, value) => {
    setForm((current) => {
      const schedules = Array.isArray(current.show_schedules) && current.show_schedules.length
        ? [...current.show_schedules]
        : [{ show_date: "", show_time: "", doors_open_time: "", duration_minutes: 0, status: "ACTIVE" }];
      schedules[index] = { ...schedules[index], [field]: value };
      const firstValid = schedules.find((item) => item.show_date && item.show_time) || schedules[0] || {};
      return {
        ...current,
        show_schedules: schedules,
        event_date: firstValid.show_date || "",
        event_time: firstValid.show_time || "",
        doors_open_time: firstValid.doors_open_time || current.doors_open_time || "",
        duration_minutes: firstValid.duration_minutes ?? current.duration_minutes ?? 0,
      };
    });
  };

  const addShowSchedule = () => {
    setForm((current) => ({
      ...current,
      show_schedules: [
        ...(Array.isArray(current.show_schedules) ? current.show_schedules : []),
        { show_date: "", show_time: "", doors_open_time: "", duration_minutes: current.duration_minutes || 0, status: "ACTIVE" },
      ],
    }));
  };

  const removeShowSchedule = (index) => {
    setForm((current) => {
      const schedules = (Array.isArray(current.show_schedules) ? current.show_schedules : []).filter((_, rowIndex) => rowIndex !== index);
      const nextSchedules = schedules.length ? schedules : [{ show_date: "", show_time: "", doors_open_time: "", duration_minutes: 0, status: "ACTIVE" }];
      const firstValid = nextSchedules.find((item) => item.show_date && item.show_time) || nextSchedules[0] || {};
      return {
        ...current,
        show_schedules: nextSchedules,
        event_date: firstValid.show_date || "",
        event_time: firstValid.show_time || "",
      };
    });
  };

  const toggleHighlight = (tag) => {
    setForm((current) => {
      const currentTags = Array.isArray(current.highlight_tags) ? current.highlight_tags : [];
      const nextTags = currentTags.includes(tag)
        ? currentTags.filter((item) => item !== tag)
        : [...currentTags, tag];
      return { ...current, highlight_tags: nextTags };
    });
  };

  const handlePosterUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Please upload a valid image file for the event poster.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Poster file is too large. Please upload an image below 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        poster_image: reader.result,
        poster_name: file.name,
      }));
      setMessage("Poster uploaded successfully. Preview updated.");
    };
    reader.onerror = () => setMessage("Could not read poster image. Please try again.");
    reader.readAsDataURL(file);
  };

  const removePoster = () => {
    setForm((current) => ({ ...current, poster_image: "", poster_name: "" }));
  };

  const autoDistributeClasses = () => {
    setClassRows(makeClassRows(form.number_of_classes, sellableTickets, classRows.map((row) => ({
      class_name: row.class_name,
      price: row.price,
      benefits: row.benefits,
      seating_mode: row.seating_mode,
    }))));
  };

  const loadEvents = async () => {
    const res = await fetch(`${API}/events`);
    if (!res.ok) throw new Error("Unable to load events");
    const data = await res.json();
    setEvents(data);
  };

  const loadWorkflowConfig = async () => {
    const res = await fetch(`${API}/config`);
    const data = await res.json();
    setWorkflowConfig({ ...defaultWorkflowConfig, ...data });
  };

  const createDemoData = async () => {
    setMessage("Creating demo data...");
    try {
      const res = await fetch(`${API}/create-test-data`, { method: "POST" });
      const data = await res.json();
      setMessage(data.message ? `${data.message}. Total tickets: ${data.total_tickets}, sellable tickets: ${data.sellable_tickets}.` : "Test data created.");
      await loadEvents();
    } catch (error) {
      setMessage("Could not create demo data. Please check that backend is running on port 8000.");
    }
  };

  const validate = () => {
    const validSchedules = workflowConfig.multiple_shows_enabled
      ? (Array.isArray(form.show_schedules) ? form.show_schedules : []).filter((item) => item.show_date && item.show_time)
      : (form.event_date && form.event_time ? [{ show_date: form.event_date, show_time: form.event_time }] : []);
    if (!form.event_name || !form.venue || validSchedules.length === 0) {
      return workflowConfig.multiple_shows_enabled
        ? "Please enter event name, venue and at least one show date/time."
        : "Please enter event name, venue, event date and event time.";
    }
    if (Number(form.total_tickets || 0) <= 0) {
      return "Please enter the total number of tickets.";
    }
    if (Number(form.number_of_classes || 0) <= 0) {
      return "Please enter the number of ticket classes.";
    }
    const classTotalNow = classRows.reduce((total, row) => total + Number(row.quantity || 0), 0);
    if (classRows.length > 0 && classTotalNow !== sellableTickets) {
      return `Ticket class quantities must equal sellable tickets. Current class total is ${classTotalNow}, sellable tickets is ${sellableTickets}.`;
    }
    return "";
  };

  const saveEvent = async () => {
    const validationMessage = validate();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    const currentEditingEventId = editingEventId;
    setMessage(currentEditingEventId ? "Updating event..." : "Creating event...");

    const payload = {
      ...form,
      duration_minutes: Number(form.duration_minutes || 0),
      total_tickets: Number(form.total_tickets || 0),
      number_of_classes: Number(form.number_of_classes || 0),
      sponsor_foc_tickets: Number(form.sponsor_foc_tickets || 0),
      blocked_tickets: Number(form.blocked_tickets || 0),
      highlight_tags: Array.isArray(form.highlight_tags) ? form.highlight_tags : [],
      show_schedules: (workflowConfig.multiple_shows_enabled ? (Array.isArray(form.show_schedules) ? form.show_schedules : []) : [{ show_date: form.event_date, show_time: form.event_time, doors_open_time: form.doors_open_time, duration_minutes: form.duration_minutes, status: form.status || "ACTIVE" }])
        .filter((item) => item.show_date && item.show_time)
        .map((item, index) => ({
          show_id: item.show_id || `SCH${String(index + 1).padStart(3, "0")}`,
          show_date: item.show_date,
          show_time: item.show_time,
          doors_open_time: item.doors_open_time || "",
          duration_minutes: Number(item.duration_minutes || 0),
          status: item.status || "ACTIVE",
        })),
      event_date: workflowConfig.multiple_shows_enabled ? ((Array.isArray(form.show_schedules) ? form.show_schedules : []).find((item) => item.show_date && item.show_time)?.show_date || form.event_date) : form.event_date,
      event_time: workflowConfig.multiple_shows_enabled ? ((Array.isArray(form.show_schedules) ? form.show_schedules : []).find((item) => item.show_date && item.show_time)?.show_time || form.event_time) : form.event_time,
      ticket_classes: classRows.map((row) => ({
        ...row,
        price: Number(row.price || 0),
        quantity: Number(row.quantity || 0),
      })),
    };

    try {
      const url = currentEditingEventId ? `${API}/events/${currentEditingEventId}` : `${API}/events`;
      const method = currentEditingEventId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseError) {
        data = { status: "FAILED", message: rawText || "Backend returned an unreadable response." };
      }

      if (!res.ok || data.status !== "SUCCESS") {
        const detailMessage = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg || JSON.stringify(item)).join("; ")
          : data.detail;
        setMessage(data.message || detailMessage || `Event save failed. HTTP ${res.status}`);
        return;
      }

      const savedEventId = data.event?.event_id || currentEditingEventId;

      if (!currentEditingEventId && savedEventId) {
        await fetch(`${API}/seats/generate-layout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: savedEventId,
            class_capacity: Object.fromEntries(classRows.map((row) => [row.class_name, Number(row.quantity || 0)])),
            class_prices: Object.fromEntries(classRows.map((row) => [row.class_name, Number(row.price || 0)])),
          }),
        });
      }

      await loadEvents();
      setForm({ ...emptyForm });
      setClassRows([]);
      setEditingEventId(null);
      setMessage(currentEditingEventId ? "Event updated successfully." : "Event created with poster, highlights and default seat layout.");
    } catch (error) {
      setMessage(`Could not save event. ${error.message || "Please check backend connection."}`);
    }
  };

  const editEvent = (event) => {
    setEditingEventId(event.event_id);
    setForm({
      ...emptyForm,
      ...event,
      poster_image: event.poster_image || "",
      poster_name: event.poster_name || "",
      highlight_tags: Array.isArray(event.highlight_tags) ? event.highlight_tags : [],
      show_schedules: Array.isArray(event.show_schedules) && event.show_schedules.length
        ? event.show_schedules
        : [{ show_date: event.event_date || "", show_time: event.event_time || "", doors_open_time: event.doors_open_time || "", duration_minutes: event.duration_minutes || 0, status: "ACTIVE" }],
    });
    fetch(`${API}/events/${event.event_id}/ticket-classes`)
      .then((res) => res.json())
      .then((rows) => setClassRows(rows.length ? rows.map((row) => ({
        class_name: row.class_name,
        price: row.price,
        quantity: row.quantity,
        benefits: row.benefits || "",
        seating_mode: row.seating_mode || "ASSIGNED_SEAT",
      })) : makeClassRows(event.number_of_classes, event.sellable_tickets || 0)))
      .catch(() => setClassRows(makeClassRows(event.number_of_classes, event.sellable_tickets || 0)));
    setMessage(`Editing ${event.event_name}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditing = () => {
    setEditingEventId(null);
    setForm({ ...emptyForm });
    setClassRows([]);
    setMessage("");
  };

  const cancelEvent = async (eventId) => {
    try {
      const res = await fetch(`${API}/events/${eventId}`, { method: "DELETE" });
      const data = await res.json();
      setMessage(data.message || "Event cancelled.");
      await loadEvents();
    } catch (error) {
      setMessage("Unable to cancel event.");
    }
  };

  const generateLayout = async (eventId) => {
    try {
      const res = await fetch(`${API}/seats/generate-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      const data = await res.json();
      setMessage(data.message || "Seat layout generated.");
    } catch (error) {
      setMessage("Unable to generate seat layout.");
    }
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Backend not available. Start FastAPI on port 8000."));
    loadWorkflowConfig().catch(() => {});
  }, []);

  const selectedArtwork = highlightOptions.find((option) => form.highlight_tags?.includes(option.id))?.artwork;
  const posterPreview = form.poster_image || selectedArtwork || "/artwork/create-event-ui-reference.png";

  return (
    <main className="page wide-page create-event-page">
      <section className="hero-card event-hero-card">
        <div>
          <p className="eyebrow">Event Management</p>
          <h1>Create, preview and maintain events</h1>
          <p className="hero-sub">Build an event listing with poster artwork, launch tags, capacity, ticket classes, location, artist and production details.</p>
        </div>
        <div className="hero-actions">
          {editingEventId && <button className="secondary-btn light" onClick={cancelEditing}>Cancel Edit</button>}
          {workflowConfig.demo_data_enabled && (
            <button className="primary-btn" onClick={createDemoData}>Create Test Data</button>
          )}
        </div>
      </section>

      <section className="event-builder-grid">
        <div className="event-builder-main">
          <section className="card event-form-card modern-event-card">
            <div className="card-title-row">
              <div>
                <h2>{editingEventId ? "Maintain Event" : "Create Event"}</h2>
                <p className="muted-text">The sellable ticket count is calculated after sponsor/FOC and blocked tickets are deducted.</p>
              </div>
              <button className="book-button inline-save-button" onClick={saveEvent}>{editingEventId ? "Save Changes" : "Save Event"}</button>
            </div>

            <div className="form-section-title">Event Details</div>
            <div className="form-grid two">
              <label className="field-label">Event Title <span className="required-star">*</span><input className="input" placeholder="Midnight Echoes Live" value={form.event_name} onChange={(e) => setField("event_name", e.target.value)} /></label>
              <label className="field-label">Event Category <span className="required-star">*</span><select className="input" value={form.event_type} onChange={(e) => setField("event_type", e.target.value)}>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            </div>

            <div className="form-section-title">Show Days & Timings</div>
            {workflowConfig.multiple_shows_enabled ? (
              <div className="show-schedule-section">
                <div className="show-schedule-header">
                  <span>Show Date</span>
                  <span>Show Time</span>
                  <span>Doors Open</span>
                  <span>Duration</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>
                {(Array.isArray(form.show_schedules) && form.show_schedules.length ? form.show_schedules : [{ show_date: "", show_time: "", doors_open_time: "", duration_minutes: 0, status: "ACTIVE" }]).map((schedule, index) => (
                  <div className="show-schedule-row" key={index}>
                    <label className="responsive-field-label">Show Date <span className="required-star">*</span></label>
                    <input className="input" type="date" value={schedule.show_date || ""} onChange={(e) => updateShowSchedule(index, "show_date", e.target.value)} />
                    <label className="responsive-field-label">Show Time <span className="required-star">*</span></label>
                    <input className="input" type="time" value={schedule.show_time || ""} onChange={(e) => updateShowSchedule(index, "show_time", e.target.value)} />
                    <label className="responsive-field-label">Doors Open</label>
                    <input className="input" type="time" value={schedule.doors_open_time || ""} onChange={(e) => updateShowSchedule(index, "doors_open_time", e.target.value)} />
                    <label className="responsive-field-label">Duration Minutes</label>
                    <input className="input" type="number" min="0" value={schedule.duration_minutes || 0} onChange={(e) => updateShowSchedule(index, "duration_minutes", e.target.value)} />
                    <label className="responsive-field-label">Status</label>
                    <select className="input" value={schedule.status || "ACTIVE"} onChange={(e) => updateShowSchedule(index, "status", e.target.value)}>
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">Paused</option>
                      <option value="SOLD_OUT">Sold Out</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                    <button className="small-btn danger" type="button" onClick={() => removeShowSchedule(index)}>Remove</button>
                  </div>
                ))}
                <button className="small-btn" type="button" onClick={addShowSchedule}>+ Add Show Day / Time</button>
                <p className="muted-small">One event can now have many show dates and timings. Seat availability and booking are calculated separately for each selected show.</p>
              </div>
            ) : (
              <div className="form-grid three">
                <label className="field-label">Event Date <span className="required-star">*</span><input className="input" type="date" value={form.event_date} onChange={(e) => setField("event_date", e.target.value)} /></label>
                <label className="field-label">Event Time <span className="required-star">*</span><input className="input" type="time" value={form.event_time} onChange={(e) => setField("event_time", e.target.value)} /></label>
                <label className="field-label">Doors Open<input className="input" type="time" value={form.doors_open_time} onChange={(e) => setField("doors_open_time", e.target.value)} /></label>
              </div>
            )}

            <div className="form-grid three">
              <label className="field-label">Sale Start<input className="input" type="date" value={form.sale_start_date} onChange={(e) => setField("sale_start_date", e.target.value)} /></label>
              <label className="field-label">Sale End<input className="input" type="date" value={form.sale_end_date} onChange={(e) => setField("sale_end_date", e.target.value)} /></label>
            </div>

            <div className="form-grid three">
              <label className="field-label">Artist Name<input className="input" placeholder="Artist / Performer" value={form.artist_name} onChange={(e) => setField("artist_name", e.target.value)} /></label>
              <label className="field-label">Production Company<input className="input" placeholder="Production company" value={form.production_company} onChange={(e) => setField("production_company", e.target.value)} /></label>
              <label className="field-label">Organizer / Promoter<input className="input" placeholder="Organizer / Promoter" value={form.organizer_name} onChange={(e) => setField("organizer_name", e.target.value)} /></label>
            </div>

            <label className="field-label">Description<textarea className="input textarea rich-description" placeholder="Describe the event experience, lineup, entry rules and key attractions." value={form.description} onChange={(e) => setField("description", e.target.value)} /></label>

            <div className="form-section-title">Event Highlights</div>
            <div className="highlight-card-grid">
              {highlightOptions.map((option) => {
                const selected = form.highlight_tags?.includes(option.id);
                return (
                  <button key={option.id} type="button" className={selected ? "highlight-card selected" : "highlight-card"} onClick={() => toggleHighlight(option.id)}>
                    <span className="highlight-icon">{option.icon}</span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                    <span className="highlight-check">{selected ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>

            <div className="form-section-title">Ticket Inventory</div>
            <div className="capacity-grid">
              <label className="field-label">No. of Tickets<input className="input" type="number" min="0" value={form.total_tickets} onChange={(e) => setField("total_tickets", e.target.value)} /></label>
              <label className="field-label">No. of Classes<input className="input" type="number" min="0" value={form.number_of_classes} onChange={(e) => setField("number_of_classes", e.target.value)} /></label>
              <label className="field-label">Sponsor / FOC Tickets<input className="input" type="number" min="0" value={form.sponsor_foc_tickets} onChange={(e) => setField("sponsor_foc_tickets", e.target.value)} /></label>
              <label className="field-label">Blocked Tickets<input className="input" type="number" min="0" value={form.blocked_tickets} onChange={(e) => setField("blocked_tickets", e.target.value)} /></label>
              <div className="sellable-box"><span>Sellable Tickets</span><strong>{sellableTickets}</strong></div>
            </div>

            <div className="card-title-row mini-title-row">
              <div>
                <h3>Ticket Classes Loaded Into This Event</h3>
                <p className="muted-text">These quantities are the source of truth for seating layout and booking.</p>
              </div>
              <button className="small-btn" onClick={autoDistributeClasses}>Auto Distribute</button>
            </div>

            <div className="ticket-class-editor">
              {classRows.length === 0 ? (
                <p className="empty-text">Enter number of classes and ticket count to create class rows.</p>
              ) : (
                <>
                  <div className="ticket-class-header"><span>Class Name</span><span>Price</span><span>Quantity</span><span>Seating Type</span><span>Benefits / Access</span></div>
                  {classRows.map((row, index) => (
                    <div className="ticket-class-row" key={index}>
                      <label className="responsive-field-label">Class Name</label><input className="input" placeholder="VIP / Gold / General" value={row.class_name} onChange={(e) => setClassField(index, "class_name", e.target.value)} />
                      <label className="responsive-field-label">Price</label><input className="input" type="number" min="0" placeholder="₹ Price" value={row.price} onChange={(e) => setClassField(index, "price", e.target.value)} />
                      <label className="responsive-field-label">Quantity</label><input className="input" type="number" min="0" placeholder="No. of tickets" value={row.quantity} onChange={(e) => setClassField(index, "quantity", e.target.value)} />
                      <label className="responsive-field-label">Seating Type</label><select className="input" value={row.seating_mode} onChange={(e) => setClassField(index, "seating_mode", e.target.value)}><option value="ASSIGNED_SEAT">Assigned Seats</option><option value="FIRST_COME_FIRST_SERVE">First Come First Serve</option><option value="NO_SEATING">No Seating</option></select>
                      <label className="responsive-field-label">Benefits / Access</label><input className="input" placeholder="Benefits / Access details" value={row.benefits} onChange={(e) => setClassField(index, "benefits", e.target.value)} />
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className={classTotal === sellableTickets ? "class-total-note good" : "class-total-note"}>Class Total: <strong>{classTotal}</strong> / Sellable Tickets: <strong>{sellableTickets}</strong></div>

            <div className="form-section-title">Location Details</div>
            <div className="form-grid three">
              <label className="field-label">Venue <span className="required-star">*</span><input className="input" placeholder="Venue" value={form.venue} onChange={(e) => setField("venue", e.target.value)} /></label>
              <label className="field-label">Address / Landmark<input className="input" placeholder="Address / Landmark" value={form.address_line1} onChange={(e) => setField("address_line1", e.target.value)} /></label>
              <label className="field-label">City<input className="input" placeholder="City" value={form.city} onChange={(e) => setField("city", e.target.value)} /></label>
              <label className="field-label">State<input className="input" placeholder="State" value={form.state} onChange={(e) => setField("state", e.target.value)} /></label>
              <label className="field-label">Country<input className="input" placeholder="Country" value={form.country} onChange={(e) => setField("country", e.target.value)} /></label>
              <label className="field-label">PIN / ZIP<input className="input" placeholder="PIN / ZIP" value={form.pincode} onChange={(e) => setField("pincode", e.target.value)} /></label>
              <label className="field-label">Latitude<input className="input" placeholder="Latitude" value={form.latitude} onChange={(e) => setField("latitude", e.target.value)} /></label>
              <label className="field-label">Longitude<input className="input" placeholder="Longitude" value={form.longitude} onChange={(e) => setField("longitude", e.target.value)} /></label>
              <label className="field-label">Event Status<select className="input" value={form.status} onChange={(e) => setField("status", e.target.value)}>{eventStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select></label>
            </div>

            <div className="form-grid two">
              <label className="field-label">Age Restriction<input className="input" placeholder="All ages / 18+ / Family" value={form.age_restriction} onChange={(e) => setField("age_restriction", e.target.value)} /></label>
              <label className="field-label">Terms & Conditions<textarea className="input textarea" placeholder="Terms, conditions, entry rules" value={form.terms} onChange={(e) => setField("terms", e.target.value)} /></label>
            </div>

            <button className="book-button mobile-save-button" onClick={saveEvent}>{editingEventId ? "Update Event" : "Create Event + Seat Layout"}</button>
            {message && <div className="message-box">{message}</div>}
          </section>
        </div>

        <aside className="event-builder-side">
          <section className="card poster-card">
            <div className="card-title-row">
              <div>
                <h2>Event Poster</h2>
                <p className="muted-text">Upload a poster and preview how it appears to the audience.</p>
              </div>
            </div>

            <label className="poster-upload-box">
              <input type="file" accept="image/*" onChange={(e) => handlePosterUpload(e.target.files?.[0])} />
              <span className="upload-icon">⇧</span>
              <strong>Upload Poster</strong>
              <small>JPG, PNG, WEBP • Max 5 MB</small>
            </label>

            {form.poster_image && (
              <div className="poster-upload-success">
                <span>✓ Poster uploaded: {form.poster_name}</span>
                <button className="small-btn danger" onClick={removePoster}>Remove</button>
              </div>
            )}
          </section>

          <section className="card poster-preview-card">
            <div>
              <p className="eyebrow dark">Poster Preview</p>
              <h2>{form.event_name || "Your Event Title"}</h2>
              <p className="muted-text">{formatDateTime(form.event_date, form.event_time)} • {form.venue || "Venue"}</p>
            </div>

            <div className="poster-preview-frame">
              <img src={posterPreview} alt="Event poster preview" />
              <div className="poster-preview-overlay">
                <span>{form.event_type}</span>
                <strong>{form.event_name || "Create Event"}</strong>
              </div>
            </div>

            <div className="selected-badges-row">
              {selectedHighlightLabels(form.highlight_tags).length === 0 ? (
                <span className="pill">No highlight selected</span>
              ) : selectedHighlightLabels(form.highlight_tags).map((label) => <span className="pill purple" key={label}>{label}</span>)}
            </div>
          </section>

          <section className="card artwork-library-card">
            <h2>Artwork Library</h2>
            <p className="muted-text">Built-in campaign artwork for event discovery badges.</p>
            <div className="artwork-grid">
              {highlightOptions.map((option) => (
                <button key={option.id} className={form.highlight_tags?.includes(option.id) ? "artwork-tile active" : "artwork-tile"} onClick={() => toggleHighlight(option.id)}>
                  <img src={option.artwork} alt={`${option.title} artwork`} />
                  <span>{option.title}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="card events-maintain-card">
        <div className="card-title-row">
          <div>
            <h2>View Events</h2>
            <p className="muted-text">Maintain events, preview poster artwork, regenerate seat layout or copy event IDs for booking and gate entry.</p>
          </div>
          <button className="small-btn" onClick={() => loadEvents().catch(() => setMessage("Unable to refresh events."))}>Refresh</button>
        </div>

        {events.length === 0 ? (
          <p className="empty-text">No events listed yet. Create an event to get started.</p>
        ) : (
          <div className="event-card-grid enhanced-event-grid">
            {events.map((event) => {
              const tags = Array.isArray(event.highlight_tags) ? event.highlight_tags : [];
              const fallbackArtwork = highlightOptions.find((option) => tags.includes(option.id))?.artwork || "/artwork/create-event-ui-reference.png";
              return (
                <article className="event-manage-card enhanced-event-card" key={event.event_id}>
                  <div className="event-thumb-wrap">
                    <img src={event.poster_image || fallbackArtwork} alt={`${event.event_name} poster`} />
                    <div className="event-thumb-tags">
                      {tags.length ? tags.map((tag) => <span key={tag}>{highlightOptions.find((option) => option.id === tag)?.title || tag}</span>) : <span>No Highlight</span>}
                    </div>
                  </div>

                  <div className="event-card-top">
                    <div>
                      <p className="eyebrow dark">{event.event_type || "Event"}</p>
                      <h3>{event.event_name}</h3>
                      <span>{Array.isArray(event.show_schedules) && event.show_schedules.length ? `${event.show_schedules.length} shows • ${event.event_date} onwards` : `${event.event_date} at ${event.event_time}`}</span>
                    </div>
                    <span className={`status-pill ${String(event.status || "ACTIVE").toLowerCase()}`}>{event.status || "ACTIVE"}</span>
                  </div>

                  <div className="event-detail-grid">
                    <div><span>Venue</span><strong>{event.venue || "-"}</strong></div>
                    <div><span>City</span><strong>{event.city || "-"}</strong></div>
                    <div><span>Artist</span><strong>{event.artist_name || "-"}</strong></div>
                    <div><span>Production</span><strong>{event.production_company || "-"}</strong></div>
                    <div><span>Total</span><strong>{event.total_tickets || 0}</strong></div>
                    <div><span>Sellable</span><strong>{event.sellable_tickets ?? Math.max((event.total_tickets || 0) - (event.sponsor_foc_tickets || 0) - (event.blocked_tickets || 0), 0)}</strong></div>
                  </div>

                  <div className="event-id-row"><span>Event ID</span><code>{event.event_id}</code></div>

                  <div className="event-actions">
                    <button className="small-btn" onClick={() => editEvent(event)}>Maintain</button>
                    <button className="small-btn" onClick={() => generateLayout(event.event_id)}>Generate Layout</button>
                    <button className="small-btn danger" onClick={() => cancelEvent(event.event_id)}>Cancel Event</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

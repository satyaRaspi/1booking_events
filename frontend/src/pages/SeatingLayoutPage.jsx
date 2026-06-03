import React, { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

const defaultConfig = {
  layout_type: "gallery",
  default_seats_per_row: 12,
  vip_seats_per_row: 10,
  premium_seats_per_row: 12,
  general_seats_per_row: 14,
  no_seating_classes: [],
  first_come_classes: [],
};

const layoutOptions = [
  {
    id: "circular",
    title: "Semi-Circular Seating",
    description: "Curved rows facing the stage for concerts, stage shows and live performances.",
    benchmarkSqft: 9,
  },
  {
    id: "gallery",
    title: "Gallery Style Seating",
    description: "Straight rows one behind the other for auditoriums, halls and theatres.",
    benchmarkSqft: 8,
  },
  {
    id: "cluster",
    title: "Cluster Seating",
    description: "Small grouped pods or table-like clusters for premium lounges and sponsor sections.",
    benchmarkSqft: 14,
  },
  {
    id: "no_seating",
    title: "No Seating",
    description: "Class inventory only. Useful for standing zones, open ground and dance floor sections.",
    benchmarkSqft: 5,
  },
  {
    id: "first_come",
    title: "First Come First Serve",
    description: "Ticket class is booked now; attendees take seats at the venue on arrival.",
    benchmarkSqft: 7,
  },
];

function getSeatColorClass(section, mode, status) {
  if (status === "BOOKED") return "seat booked";
  if (mode === "NO_SEATING") return "seat no-seat";
  if (mode === "FIRST_COME_FIRST_SERVE") return "seat fcfs";

  const normalized = String(section || "").toLowerCase();
  if (normalized.includes("vip")) return "seat vip";
  if (normalized.includes("premium")) return "seat premium";
  if (normalized.includes("general")) return "seat general";
  return "seat custom-seat";
}

function classNameForSeatRow(row, index, layoutType) {
  if (layoutType === "circular") {
    const curveClass = index < 3 ? `curve-${index + 1}` : "curve-wide";
    return `seat-row circular-row ${curveClass}`;
  }
  if (layoutType === "cluster") return "seat-row cluster-row";
  return "seat-row";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function SeatingLayoutPage() {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [ticketClasses, setTicketClasses] = useState([]);
  const [seats, setSeats] = useState([]);
  const [config, setConfig] = useState(defaultConfig);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLayoutDialog, setShowLayoutDialog] = useState(false);

  const selectedEvent = events.find((event) => event.event_id === selectedEventId);

  const loadTicketClasses = async (eventId) => {
    if (!eventId) {
      setTicketClasses([]);
      return [];
    }

    const res = await fetch(`${API}/events/${eventId}/ticket-classes`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    setTicketClasses(rows);
    return rows;
  };

  const loadSeats = async (eventId) => {
    if (!eventId) {
      setSeats([]);
      return [];
    }

    const res = await fetch(`${API}/events/${eventId}/seats`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    setSeats(rows);
    return rows;
  };

  const loadEventBundle = async (eventId) => {
    await loadTicketClasses(eventId);
    await loadSeats(eventId);
  };

  const loadEvents = async () => {
    const res = await fetch(`${API}/events`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    setEvents(rows);

    if (selectedEventId && rows.some((event) => event.event_id === selectedEventId)) {
      await loadEventBundle(selectedEventId);
    } else {
      setSelectedEventId("");
      setTicketClasses([]);
      setSeats([]);
    }
  };

  useEffect(() => {
    loadEvents().catch(() => setMessage("Backend not available. Start FastAPI on port 8000, then refresh this page."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (field, value) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const toggleClass = (field, className) => {
    setConfig((current) => {
      const currentList = current[field] || [];
      const nextList = currentList.includes(className)
        ? currentList.filter((item) => item !== className)
        : [...currentList, className];
      return { ...current, [field]: nextList };
    });
  };

  const createPayload = () => {
    const classCapacity = {};
    const classPrices = {};

    ticketClasses.forEach((row) => {
      classCapacity[row.class_name] = Number(row.quantity || 0);
      classPrices[row.class_name] = Number(row.price || 0);
    });

    return {
      event_id: selectedEventId,
      layout_type: config.layout_type,
      vip_seats_per_row: Number(config.vip_seats_per_row || config.default_seats_per_row || 12),
      premium_seats_per_row: Number(config.premium_seats_per_row || config.default_seats_per_row || 12),
      general_seats_per_row: Number(config.general_seats_per_row || config.default_seats_per_row || 12),
      no_seating_classes: config.no_seating_classes || [],
      first_come_classes: config.first_come_classes || [],
      class_capacity: classCapacity,
      class_prices: classPrices,
    };
  };

  const generateLayout = async () => {
    if (!selectedEventId) {
      setMessage("Please select an event first.");
      return;
    }

    if (!ticketClasses.length) {
      setMessage("No ticket classes are available for this event. Go to Events and add ticket classes first.");
      return;
    }

    setBusy(true);
    setMessage("Generating seating layout from the event ticket classes...");

    try {
      const res = await fetch(`${API}/seats/generate-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload()),
      });

      const data = await res.json();

      if (!res.ok || data.status !== "SUCCESS") {
        setMessage(data.message || "Unable to generate layout.");
        setBusy(false);
        return;
      }

      const generatedSeats = Array.isArray(data.seats) ? data.seats : [];
      setSeats(generatedSeats);
      await loadTicketClasses(selectedEventId);
      setMessage(`${data.message}. ${data.total_units} booking units created. Event sellable tickets: ${data.sellable_tickets}.`);
    } catch (error) {
      setMessage("Unable to generate layout. Please check that the backend is running at http://127.0.0.1:8000.");
    } finally {
      setBusy(false);
    }
  };

  const openLayoutDialog = () => {
    if (!selectedEventId) {
      setMessage("Please select an event first, then open the seating layout dialog.");
      return;
    }
    setShowLayoutDialog(true);
  };

  const classSummary = useMemo(() => {
    const source = ticketClasses.length ? ticketClasses : [];
    return source.map((row) => {
      const classSeats = seats.filter((seat) => seat.section === row.class_name);
      return {
        className: row.class_name,
        configured: Number(row.quantity || 0),
        price: Number(row.price || 0),
        seatingMode: row.seating_mode || "ASSIGNED_SEAT",
        total: classSeats.length,
        available: classSeats.filter((seat) => seat.status === "AVAILABLE").length,
        booked: classSeats.filter((seat) => seat.status === "BOOKED").length,
      };
    });
  }, [ticketClasses, seats]);

  const groupedSeats = useMemo(() => {
    const assigned = seats.filter((seat) => seat.seating_mode === "ASSIGNED_SEAT");
    return assigned.reduce((groups, seat) => {
      const key = seat.row || seat.section || "Row";
      if (!groups[key]) groups[key] = [];
      groups[key].push(seat);
      return groups;
    }, {});
  }, [seats]);

  const inventoryRows = useMemo(() => {
    return classSummary.filter((item) => {
      const classSeats = seats.filter((seat) => seat.section === item.className);
      return classSeats.some((seat) => ["NO_SEATING", "FIRST_COME_FIRST_SERVE"].includes(seat.seating_mode));
    });
  }, [classSummary, seats]);

  const assignedSeatRows = Object.keys(groupedSeats);
  const activeLayoutType = seats[0]?.layout_type || config.layout_type;
  const configuredTotal = classSummary.reduce((sum, item) => sum + item.configured, 0);
  const sellableTickets = Number(selectedEvent?.sellable_tickets ?? 0);
  const selectedLayoutOption = layoutOptions.find((x) => x.id === config.layout_type) || layoutOptions[1];

  const assignedCount = seats.filter((seat) => seat.seating_mode === "ASSIGNED_SEAT").length || configuredTotal;
  const noSeatCount = seats.filter((seat) => seat.seating_mode === "NO_SEATING").length;
  const fcfsCount = seats.filter((seat) => seat.seating_mode === "FIRST_COME_FIRST_SERVE").length;

  const spacePlan = useMemo(() => {
    const people = configuredTotal || sellableTickets || seats.length || 0;
    const baseSqft = people * selectedLayoutOption.benchmarkSqft;
    const stageSqft = Math.max(300, Math.round(baseSqft * 0.18));
    const aisleSqft = Math.round(baseSqft * 0.18);
    const entrySqft = Math.round(people * 1.5);
    const totalSqft = Math.round(baseSqft + stageSqft + aisleSqft + entrySqft);
    const totalSqm = Math.round(totalSqft * 0.092903);

    return {
      people,
      baseSqft: Math.round(baseSqft),
      stageSqft,
      aisleSqft,
      entrySqft,
      totalSqft,
      totalSqm,
      perPerson: selectedLayoutOption.benchmarkSqft,
    };
  }, [configuredTotal, sellableTickets, seats.length, selectedLayoutOption]);

  const renderVisualLayout = () => {
    if (!seats.length) {
      return <p className="empty-text">No layout has been generated yet. Choose an event, open Layout Setup, then click Generate / Replace Layout.</p>;
    }

    return (
      <div className="visual-layout-wrap">
        {assignedSeatRows.length > 0 && (
          <div className={`seat-layout visual-${activeLayoutType}`}>
            {activeLayoutType === "cluster" ? (
              <div className="cluster-layout">
                {assignedSeatRows.map((row, index) => (
                  <div key={row} className="cluster-pod">
                    <span className="row-label">Cluster {index + 1}</span>
                    <div className="cluster-seat-wrap">
                      {groupedSeats[row].map((seat) => (
                        <button
                          key={seat.seat_id}
                          type="button"
                          className={getSeatColorClass(seat.section, seat.seating_mode, seat.status)}
                          title={`${seat.section} • ${seat.seat_id} • ₹${seat.price}`}
                          disabled
                        >
                          {seat.seat_number}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              assignedSeatRows.map((row, index) => (
                <div key={row} className={classNameForSeatRow(row, index, activeLayoutType)}>
                  <span className="row-label">{row}</span>
                  <div className="seat-row-items">
                    {groupedSeats[row].map((seat) => (
                      <button
                        key={seat.seat_id}
                        type="button"
                        className={getSeatColorClass(seat.section, seat.seating_mode, seat.status)}
                        title={`${seat.section} • ${seat.seat_id} • ₹${seat.price}`}
                        disabled
                      >
                        {seat.seat_number}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {inventoryRows.length > 0 && (
          <div className="inventory-layout visual-inventory">
            {inventoryRows.map((item) => (
              <div className="inventory-card" key={item.className}>
                <span>{item.className}</span>
                <strong>{item.available} available</strong>
                <small>{item.seatingMode} • {item.booked} booked / {item.total} total</small>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="page seating-page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Seating layout management</p>
          <h1>Create and maintain event layouts.</h1>
          <p className="hero-sub">Select an event, then open the layout dialog to choose seating style and calculate venue space.</p>
        </div>
        <button className="primary-btn" onClick={openLayoutDialog} disabled={!selectedEventId}>
          Open Seating Layout Dialog
        </button>
      </section>

      <section className="booking-grid">
        <div className="left-panel">
          <div className="card">
            <div className="card-title-row">
              <h2>Select Event</h2>
              <button className="small-btn" onClick={() => loadEvents().catch(() => setMessage("Unable to refresh events."))}>Refresh</button>
            </div>
            <select
              className="input"
              value={selectedEventId}
              onChange={async (e) => {
                const eventId = e.target.value;
                setSelectedEventId(eventId);
                setMessage("");
                await loadEventBundle(eventId);
              }}
            >
              <option value="">Choose event</option>
              {events.map((event) => (
                <option key={event.event_id} value={event.event_id}>{event.event_name} - {event.event_date}</option>
              ))}
            </select>
            {selectedEvent && (
              <p className="muted-text">
                {selectedEvent.venue}, {selectedEvent.city} • {selectedEvent.event_type} • Total: {selectedEvent.total_tickets} • Sellable: {selectedEvent.sellable_tickets}
              </p>
            )}
          </div>

          <div className="card">
            <h2>Event Ticket Classes</h2>
            <p className="muted-text">These are loaded from the event. Layout generation will create exactly these quantities.</p>
            <div className="inventory-layout">
              {classSummary.length === 0 && <p className="empty-text">No ticket classes found. Please add ticket classes in the Events page.</p>}
              {classSummary.map((item) => (
                <div className="inventory-card" key={item.className}>
                  <span>{item.className}</span>
                  <strong>{item.configured} configured</strong>
                  <small>₹{item.price} • Generated: {item.total}</small>
                </div>
              ))}
            </div>
            {selectedEvent && configuredTotal !== sellableTickets && (
              <div className="warning-box">
                Ticket class total is {configuredTotal}, but event sellable tickets is {sellableTickets}. Please fix this in Events before generating layout.
              </div>
            )}
          </div>
        </div>

        <aside className="right-panel">
          <div className="card summary-card">
            <h2>Layout Summary</h2>
            <div className="summary-box">
              <div><span>Selected Style</span><strong>{selectedLayoutOption.title}</strong></div>
              <div><span>Configured Units</span><strong>{configuredTotal}</strong></div>
              <div><span>Generated Units</span><strong>{seats.length}</strong></div>
              <div><span>Estimated Venue Area</span><strong>{formatNumber(spacePlan.totalSqft)} sq ft</strong></div>
            </div>
          </div>

          <div className="card layout-card">
            <div className="card-title-row">
              <h2>Visual Layout Preview</h2>
              <span className="pill">{seats.length} units</span>
            </div>
            <div className="stage">STAGE / PERFORMANCE AREA</div>
            <div className="legend">
              <span><i className="box vip-box" />VIP</span>
              <span><i className="box premium-box" />Premium</span>
              <span><i className="box general-box" />General</span>
              <span><i className="box custom-box" />Other class</span>
              <span><i className="box fcfs-box" />FCFS</span>
              <span><i className="box no-seat-box" />No Seating</span>
            </div>
            {renderVisualLayout()}
          </div>

          {message && <div className="message-box">{message}</div>}
        </aside>
      </section>

      {showLayoutDialog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="layout-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Layout setup dialog</p>
                <h2>{selectedEvent?.event_name || "Selected Event"}</h2>
                <p className="muted-text">Choose the seating style, class rules and row widths before generating the layout.</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setShowLayoutDialog(false)}>×</button>
            </div>

            <div className="modal-body-grid">
              <div className="modal-left">
                <div className="card inner-card">
                  <h3>Seating Type</h3>
                  <div className="layout-option-grid modal-layout-grid">
                    {layoutOptions.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        className={config.layout_type === option.id ? "layout-option active" : "layout-option"}
                        onClick={() => setField("layout_type", option.id)}
                      >
                        <strong>{option.title}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card inner-card">
                  <h3>Assigned Seat Row Width</h3>
                  <p className="muted-text">Ticket class quantities come from Event Management. These fields decide how assigned seats wrap visually into rows or clusters.</p>
                  <div className="class-config-grid">
                    <div className="class-config-card vip-border">
                      <h3>VIP row width</h3>
                      <input className="input" type="number" value={config.vip_seats_per_row} onChange={(e) => setField("vip_seats_per_row", e.target.value)} />
                    </div>
                    <div className="class-config-card premium-border">
                      <h3>Premium row width</h3>
                      <input className="input" type="number" value={config.premium_seats_per_row} onChange={(e) => setField("premium_seats_per_row", e.target.value)} />
                    </div>
                    <div className="class-config-card general-border">
                      <h3>General row width</h3>
                      <input className="input" type="number" value={config.general_seats_per_row} onChange={(e) => setField("general_seats_per_row", e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="card inner-card">
                  <h3>Class Seating Rules</h3>
                  <p className="muted-text">Override specific classes when they should not have reserved seat numbers.</p>
                  <div className="rule-grid">
                    {classSummary.map((item) => (
                      <div className="rule-card" key={item.className}>
                        <strong>{item.className}</strong>
                        <label><input type="checkbox" checked={(config.no_seating_classes || []).includes(item.className)} onChange={() => toggleClass("no_seating_classes", item.className)} /> No seating</label>
                        <label><input type="checkbox" checked={(config.first_come_classes || []).includes(item.className)} onChange={() => toggleClass("first_come_classes", item.className)} /> First come first serve</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-right">
                <div className="card inner-card calculator-card">
                  <h3>Venue Space Calculator</h3>
                  <p className="muted-text">Planning estimate using common event-space benchmarks. Confirm final capacity with the venue, fire officer and local building code.</p>
                  <div className="space-grid">
                    <div><span>Capacity Used</span><strong>{formatNumber(spacePlan.people)}</strong></div>
                    <div><span>Benchmark</span><strong>{spacePlan.perPerson} sq ft/person</strong></div>
                    <div><span>Seating / Standing Area</span><strong>{formatNumber(spacePlan.baseSqft)} sq ft</strong></div>
                    <div><span>Stage / Performance Area</span><strong>{formatNumber(spacePlan.stageSqft)} sq ft</strong></div>
                    <div><span>Aisles & Circulation</span><strong>{formatNumber(spacePlan.aisleSqft)} sq ft</strong></div>
                    <div><span>Entry / Holding Buffer</span><strong>{formatNumber(spacePlan.entrySqft)} sq ft</strong></div>
                    <div className="space-total"><span>Total Estimated Venue Area</span><strong>{formatNumber(spacePlan.totalSqft)} sq ft / {formatNumber(spacePlan.totalSqm)} sq m</strong></div>
                  </div>
                </div>

                <div className="card inner-card">
                  <h3>Generated Layout Mix</h3>
                  <div className="summary-box">
                    <div><span>Assigned Seats</span><strong>{assignedCount}</strong></div>
                    <div><span>No Seating Units</span><strong>{noSeatCount}</strong></div>
                    <div><span>FCFS Units</span><strong>{fcfsCount}</strong></div>
                    <div><span>Sellable Tickets</span><strong>{sellableTickets}</strong></div>
                  </div>
                </div>

                <div className="card inner-card modal-preview-card">
                  <div className="card-title-row">
                    <h3>Layout Visual Preview</h3>
                    <span className="pill">{seats.length} units</span>
                  </div>
                  <div className="stage modal-stage">STAGE / PERFORMANCE AREA</div>
                  <div className="legend compact-legend">
                    <span><i className="box vip-box" />VIP</span>
                    <span><i className="box premium-box" />Premium</span>
                    <span><i className="box general-box" />General</span>
                    <span><i className="box custom-box" />Other</span>
                    <span><i className="box fcfs-box" />FCFS</span>
                    <span><i className="box no-seat-box" />No Seating</span>
                  </div>
                  <div className="modal-visual-scroll">
                    {renderVisualLayout()}
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="secondary-btn" type="button" onClick={() => setShowLayoutDialog(false)}>Close</button>
                  <button className="primary-btn" type="button" onClick={generateLayout} disabled={busy || configuredTotal !== sellableTickets}>
                    {busy ? "Generating..." : "Generate / Replace Layout"}
                  </button>
                </div>
                {configuredTotal !== sellableTickets && (
                  <div className="warning-box">Class total must match sellable tickets before layout generation.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

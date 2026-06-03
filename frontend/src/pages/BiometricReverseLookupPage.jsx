import React, { useState } from "react";
import WebcamCapture from "../components/WebcamCapture.jsx";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

export default function BiometricReverseLookupPage() {
  const [eventId, setEventId] = useState("");
  const [capture, setCapture] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  const reverseLookup = async () => {
    if (!capture?.faceSignature?.length && !capture?.imageData) {
      setMessage("Capture a face first.");
      return;
    }

    const response = await fetch(`${API}/biometric/reverse-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId || null,
        face_signature: capture.faceSignature,
        face_image_data: capture.imageData,
      }),
    });
    const data = await response.json();
    setResult(data);
    setMessage(data.message || "Reverse lookup complete.");
  };

  return (
    <main className="page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">1Booking FaceID reverse lookup</p>
          <h1>Find the linked ticket QR from a face.</h1>
          <p className="hero-sub">Capture a live face, match it against enrolled purchaser biometrics, and recover the original 1Booking FaceID QR reference.</p>
        </div>
      </section>

      <section className="booking-grid">
        <div className="card">
          <h2>Capture Face</h2>
          <input className="input" placeholder="Optional Event ID filter" value={eventId} onChange={(e) => setEventId(e.target.value)} />
          <WebcamCapture onCapture={(data) => { setCapture(data); setResult(null); setMessage(`Captured using ${data.signatureEngine || "1Booking FaceID"}.`); }} />
          <button className="primary-btn" onClick={reverseLookup}>Reverse Lookup QR</button>
          {message && <div className="message-box">{message}</div>}
        </div>

        <div className="card">
          <h2>Matched QR / Ticket</h2>
          {!result && <p className="empty-text">No lookup run yet.</p>}
          {result?.status === "FAILED" && <p className="error-text">{result.message}</p>}
          {result?.status === "SUCCESS" && (
            <div className="summary-box">
              <div><span>Biometric ID</span><strong>{result.biometric_id}</strong></div>
              <div><span>Booking ID</span><strong>{result.booking_group_id}</strong></div>
              <div><span>Match Score</span><strong>{Number(result.match_score).toFixed(4)}</strong></div>
              <div><span>Engine</span><strong>{result.signature_engine}</strong></div>
              {result.qr_data_url && <img className="real-qr-image large" src={result.qr_data_url} alt="Recovered 1Booking FaceID QR" />}
              <h3>Tickets</h3>
              {(result.tickets || []).map((ticket) => (
                <div key={ticket.ticket_id} className="mini-ticket-row">
                  <strong>{ticket.ticket_id}</strong>
                  <span>{ticket.event_name}</span>
                  <span>{ticket.event_date} {ticket.event_time}</span>
                  <span>Seat {ticket.seat_id}</span>
                  <span>{ticket.entry_status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

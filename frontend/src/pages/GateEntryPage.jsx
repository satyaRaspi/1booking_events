import React, { useEffect, useState } from "react";
import WebcamCapture from "../components/WebcamCapture.jsx";
const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

export default function GateEntryPage() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState("");
  const [signature, setSignature] = useState([]);
  const [imageData, setImageData] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch(`${API}/events`).then((res) => res.json()).then((data) => {
      setEvents(data);
      if (data[0]) setEventId(data[0].event_id);
    }).catch(() => {});
  }, []);

  const verify = async () => {
    const res = await fetch(`${API}/gate/verify-entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, live_face_signature: signature, live_face_image_data: imageData }),
    });
    setResult(await res.json());
  };

  return (
    <main className="page narrow-page">
      <div className="card">
        <p className="eyebrow">Gate Entry</p>
        <h1>Biometric Gate Verification</h1>
        <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {events.map((event) => <option key={event.event_id} value={event.event_id}>{event.event_name}</option>)}
        </select>
        <WebcamCapture onCapture={(capture) => { setSignature(capture.faceSignature); setImageData(capture.imageData); }} />
        <button className="book-button" onClick={verify}>Verify Entry</button>
        {result && <div className={result.status === "ALLOWED" ? "result allowed" : "result denied"}>
          <h2>{result.status}</h2>
          <p>{result.message || result.reason}</p>
          {result.ticket && <p>{result.ticket.buyer_name} · Seat {result.ticket.seat_id}</p>}
        </div>}
      </div>
    </main>
  );
}

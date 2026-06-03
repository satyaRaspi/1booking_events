import React, { useEffect, useState } from "react";
import WebcamCapture from "../components/WebcamCapture.jsx";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

export default function WorkflowFaceIDPage() {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [enrollCapture, setEnrollCapture] = useState(null);
  const [lookupCapture, setLookupCapture] = useState(null);
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState("");
  const [lookupResult, setLookupResult] = useState(null);

  const loadRecords = async () => {
    try {
      const response = await fetch(`${API}/workflow-faceid/records`);
      const data = await response.json();
      setRecords(data.records || []);
    } catch (error) {
      setMessage("Unable to load saved workflow FaceID records.");
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const saveRecord = async () => {
    if (!name.trim()) {
      setMessage("Name is mandatory.");
      return;
    }
    if (!age || Number(age) <= 0) {
      setMessage("Age is mandatory.");
      return;
    }
    if (!enrollCapture?.faceSignature?.length && !enrollCapture?.imageData) {
      setMessage("Capture the biometric FaceID before saving.");
      return;
    }

    const response = await fetch(`${API}/workflow-faceid/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        age: Number(age),
        face_signature: enrollCapture.faceSignature,
        face_image_data: enrollCapture.imageData,
      }),
    });
    const data = await response.json();
    setMessage(data.message || "Save completed.");
    if (data.status === "SUCCESS") {
      setName("");
      setAge("");
      setEnrollCapture(null);
      loadRecords();
    }
  };

  const lookupFace = async () => {
    if (!lookupCapture?.faceSignature?.length && !lookupCapture?.imageData) {
      setMessage("Capture a face first for lookup.");
      return;
    }

    const response = await fetch(`${API}/workflow-faceid/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        face_signature: lookupCapture.faceSignature,
        face_image_data: lookupCapture.imageData,
      }),
    });
    const data = await response.json();
    setLookupResult(data);
    setMessage(data.message || "Lookup completed.");
  };

  return (
    <main className="page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">1Booking FaceID workflow</p>
          <h1>Enroll a face, store details, and look up the person later.</h1>
          <p className="hero-sub">
            This page uses the same backend FaceID capture approach: single-face validation, 128D biometric template generation, template storage, and distance-based matching.
          </p>
        </div>
      </section>

      <section className="booking-grid">
        <div className="card">
          <h2>1. Capture and Save Biometric FaceID</h2>

          <label className="field-label">Name <span className="required-star">*</span></label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter person name" />

          <label className="field-label">Age <span className="required-star">*</span></label>
          <input className="input" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Enter age" />

          <WebcamCapture
            onCapture={(capture) => {
              setEnrollCapture(capture);
              setMessage(`Enrollment FaceID captured using ${capture.signatureEngine || "1Booking FaceID"}.`);
            }}
          />

          {enrollCapture && (
            <div className="success-note">
              FaceID ready to save. Signature hash: {enrollCapture.signatureHash?.slice(0, 16)}...
            </div>
          )}

          <button className="primary-btn" onClick={saveRecord}>Save Biometric FaceID Record</button>
        </div>

        <div className="card">
          <h2>2. Open Camera and Look Up FaceID</h2>

          <WebcamCapture
            onCapture={(capture) => {
              setLookupCapture(capture);
              setLookupResult(null);
              setMessage(`Lookup FaceID captured using ${capture.signatureEngine || "1Booking FaceID"}.`);
            }}
          />

          <button className="primary-btn" onClick={lookupFace}>Look Up Match</button>

          {lookupResult?.status === "SUCCESS" && (
            <div className="match-card success-match">
              <p className="eyebrow">Matched person</p>
              <h2>{lookupResult.record.name}</h2>
              <div className="summary-box">
                <div><span>Age</span><strong>{lookupResult.record.age}</strong></div>
                <div><span>Workflow FaceID</span><strong>{lookupResult.record.workflow_faceid}</strong></div>
                <div><span>Match Score</span><strong>{Number(lookupResult.match_score).toFixed(4)}</strong></div>
                <div><span>Threshold</span><strong>{Number(lookupResult.threshold).toFixed(4)}</strong></div>
                <div><span>Engine</span><strong>{lookupResult.record.signature_engine}</strong></div>
                <div><span>Saved At</span><strong>{new Date(lookupResult.record.created_at).toLocaleString()}</strong></div>
              </div>
            </div>
          )}

          {lookupResult?.status === "FAILED" && (
            <div className="message-box error-box">{lookupResult.message}</div>
          )}
        </div>
      </section>

      {message && <div className="message-box wide-message">{message}</div>}

      <section className="card">
        <h2>Saved FaceID Workflow Records</h2>
        {records.length === 0 ? (
          <p className="empty-text">No workflow FaceID records saved yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>FaceID</th>
                  <th>Name</th>
                  <th>Age</th>
                  <th>Engine</th>
                  <th>Signature Hash</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.workflow_faceid}>
                    <td>{record.workflow_faceid}</td>
                    <td>{record.name}</td>
                    <td>{record.age}</td>
                    <td>{record.signature_engine}</td>
                    <td>{record.face_signature_hash?.slice(0, 18)}...</td>
                    <td>{new Date(record.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

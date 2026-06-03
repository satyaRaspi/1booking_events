import React, { useState } from "react";
import WebcamCapture from "../components/WebcamCapture.jsx";
const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

export default function FacePurchasePage() {
  const [signature, setSignature] = useState([]);
  const [imageData, setImageData] = useState("");
  const [amount, setAmount] = useState("250");
  const [description, setDescription] = useState("Merchandise purchase");
  const [result, setResult] = useState(null);

  const pay = async () => {
    const res = await fetch(`${API}/wallet/face-pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ live_face_signature: signature, amount: Number(amount), description }),
    });
    setResult(await res.json());
  };

  return (
    <main className="page narrow-page">
      <div className="card">
        <p className="eyebrow">Wallet</p>
        <h1>Face Pay Purchase</h1>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <WebcamCapture onCapture={(capture) => { setSignature(capture.faceSignature); setImageData(capture.imageData); }} />
        <button className="book-button" onClick={pay}>Pay Using Face</button>
        {result && <div className="message-box">{result.message}{result.remaining_balance !== undefined ? ` · Balance ₹${result.remaining_balance}` : ""}</div>}
      </div>
    </main>
  );
}

import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

const defaultConfig = {
  biometric_enabled: true,
  multiple_shows_enabled: true,
  qr_ticket_enabled: true,
  ticket_cancellation_enabled: true,
  require_adjacent_seats: true,
  demo_data_enabled: true,
};

function ToggleCard({ title, description, checked, onChange, icon }) {
  return (
    <button type="button" className={checked ? "workflow-toggle-card enabled" : "workflow-toggle-card"} onClick={() => onChange(!checked)}>
      <div className="workflow-toggle-icon">{icon}</div>
      <div className="workflow-toggle-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <span className={checked ? "toggle-switch on" : "toggle-switch"}>
        <span></span>
      </span>
    </button>
  );
}

export default function WorkflowConfigurationPage() {
  const [config, setConfig] = useState(defaultConfig);
  const [message, setMessage] = useState("");

  const loadConfig = async () => {
    const res = await fetch(`${API}/config`);
    const data = await res.json();
    setConfig({ ...defaultConfig, ...data });
  };

  useEffect(() => {
    loadConfig().catch(() => setMessage("Backend not available. Start FastAPI on port 8000."));
  }, []);

  const setOption = (field, value) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  const saveConfig = async () => {
    setMessage("Saving workflow configuration...");
    try {
      const res = await fetch(`${API}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.status !== "SUCCESS") {
        setMessage(data.message || "Could not save workflow configuration.");
        return;
      }
      setConfig({ ...defaultConfig, ...data.config });
      setMessage("Workflow configuration saved successfully.");
    } catch (error) {
      setMessage("Could not save workflow configuration. Please check the backend.");
    }
  };

  return (
    <main className="page workflow-config-page">
      <section className="hero-card workflow-hero-card">
        <div>
          <p className="eyebrow">Admin only</p>
          <h1>Workflow Configuration</h1>
          <p className="hero-sub">Control how booking, biometric capture, show scheduling and ticket rules behave across the platform.</p>
        </div>
        <button className="primary-btn" onClick={saveConfig}>Save Workflow</button>
      </section>

      <section className="workflow-config-grid">
        <div className="card workflow-config-main-card">
          <div className="card-title-row">
            <div>
              <h2>Booking Workflow Setup</h2>
              <p className="muted-text">Turn features on or off depending on the event operating model.</p>
            </div>
          </div>

          <div className="workflow-toggle-grid">
            <ToggleCard
              icon="◎"
              title="Biometric FaceID"
              description="Require 1Booking FaceID capture during booking and gate verification. Disable this for non-biometric ticketing demos."
              checked={config.biometric_enabled}
              onChange={(value) => setOption("biometric_enabled", value)}
            />
            <ToggleCard
              icon="▦"
              title="Multiple Shows"
              description="Allow one event to have many show dates and timings. Disable this for single-show events."
              checked={config.multiple_shows_enabled}
              onChange={(value) => setOption("multiple_shows_enabled", value)}
            />
            <ToggleCard
              icon="▣"
              title="QR Ticket Issue"
              description="Generate a 1Booking FaceID-style QR reference on issued and reissued tickets."
              checked={config.qr_ticket_enabled}
              onChange={(value) => setOption("qr_ticket_enabled", value)}
            />
            <ToggleCard
              icon="↺"
              title="Audience Cancellation"
              description="Allow audience users to cancel unused active tickets from My Bookings."
              checked={config.ticket_cancellation_enabled}
              onChange={(value) => setOption("ticket_cancellation_enabled", value)}
            />
            <ToggleCard
              icon="▥"
              title="Adjacent Seat Selection"
              description="Require selected seats to be together in the same row when booking multiple tickets."
              checked={config.require_adjacent_seats}
              onChange={(value) => setOption("require_adjacent_seats", value)}
            />
            <ToggleCard
              icon="🧪"
              title="Create Demo Data"
              description="Show or hide demo/test data creation in the app. Turn this off for production deployments."
              checked={config.demo_data_enabled}
              onChange={(value) => setOption("demo_data_enabled", value)}
            />
          </div>

          {message && <div className="message-box">{message}</div>}
        </div>

        <aside className="card workflow-summary-card">
          <p className="eyebrow dark">Current setup</p>
          <h2>Active Rules</h2>
          <div className="workflow-summary-list">
            <div><span>Biometric</span><strong>{config.biometric_enabled ? "Enabled" : "Disabled"}</strong></div>
            <div><span>Show scheduling</span><strong>{config.multiple_shows_enabled ? "Multiple shows" : "Single show"}</strong></div>
            <div><span>Ticket QR</span><strong>{config.qr_ticket_enabled ? "Generated" : "Hidden"}</strong></div>
            <div><span>Cancellation</span><strong>{config.ticket_cancellation_enabled ? "Allowed" : "Blocked"}</strong></div>
            <div><span>Multi-seat rule</span><strong>{config.require_adjacent_seats ? "Adjacent" : "Flexible"}</strong></div>
          </div>
          <p className="tiny-note">These settings are saved in backend/data/workflow_config.json and are available to the booking and event workflow.</p>
        </aside>
      </section>
    </main>
  );
}

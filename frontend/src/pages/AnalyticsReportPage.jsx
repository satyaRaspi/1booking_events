import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

export default function AnalyticsReportPage() {
  const [activeView, setActiveView] = useState("abandoned");
  const [logs, setLogs] = useState([]);
  const [carts, setCarts] = useState([]);
  const [cartStatus, setCartStatus] = useState("ABANDONED");
  const [message, setMessage] = useState("");

  const loadReports = async () => {
    setMessage("");
    try {
      const [logRes, cartRes] = await Promise.all([
        fetch(`${API}/admin/user-activity?limit=300`),
        fetch(`${API}/admin/abandoned-carts?status=${cartStatus}&limit=300`),
      ]);
      const logData = await logRes.json();
      const cartData = await cartRes.json();
      setLogs(logData.logs || []);
      setCarts(cartData.carts || []);
    } catch (error) {
      setMessage("Unable to load reports. Please check that the backend is running.");
    }
  };

  useEffect(() => {
    loadReports();
  }, [cartStatus]);

  const abandonedValue = carts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const uniqueUsers = new Set(logs.map((item) => item.username || item.user_id).filter(Boolean)).size;

  return (
    <main className="page analytics-page">
      <section className="page-hero compact-hero">
        <div>
          <p className="eyebrow">Admin analytics</p>
          <h1>User Activity & Abandoned Carts</h1>
          <p>Track what users do on the website and identify booking flows that were started but not completed.</p>
        </div>
        <button className="primary-btn" onClick={loadReports}>Refresh Report</button>
      </section>

      <section className="analytics-summary-grid">
        <div className="metric-card"><span>Activity Logs</span><strong>{logs.length}</strong></div>
        <div className="metric-card"><span>Tracked Users</span><strong>{uniqueUsers}</strong></div>
        <div className="metric-card"><span>{cartStatus === "ALL" ? "Cart Records" : "Abandoned Carts"}</span><strong>{carts.length}</strong></div>
        <div className="metric-card"><span>Potential Cart Value</span><strong>₹{abandonedValue.toLocaleString("en-IN")}</strong></div>
      </section>

      <div className="report-tabs">
        <button className={activeView === "abandoned" ? "active" : ""} onClick={() => setActiveView("abandoned")}>Abandoned Carts</button>
        <button className={activeView === "activity" ? "active" : ""} onClick={() => setActiveView("activity")}>User Activity Log</button>
      </div>

      {message && <div className="message-box error">{message}</div>}

      {activeView === "abandoned" && (
        <section className="card report-card">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">Booking recovery</p>
              <h2>Abandoned Cart Report</h2>
              <p className="muted-text">Shows booking dialogs that were started but closed before ticket issue.</p>
            </div>
            <select className="input compact-select" value={cartStatus} onChange={(e) => setCartStatus(e.target.value)}>
              <option value="ABANDONED">Abandoned only</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="ALL">All cart states</option>
            </select>
          </div>

          <div className="table-scroll">
            <table className="data-table contrast-table">
              <thead>
                <tr>
                  <th>Updated</th>
                  <th>User</th>
                  <th>Mobile</th>
                  <th>Event</th>
                  <th>Date / Time</th>
                  <th>Tickets</th>
                  <th>Seats</th>
                  <th>Amount</th>
                  <th>Step</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {carts.length === 0 && <tr><td colSpan="10" className="empty-cell">No cart records found for this filter.</td></tr>}
                {carts.map((cart) => (
                  <tr key={cart.cart_id}>
                    <td>{cart.updated_at}</td>
                    <td>{cart.full_name || cart.username}</td>
                    <td>{cart.mobile}</td>
                    <td>{cart.event_name || cart.event_id}</td>
                    <td>{cart.event_date} {cart.event_time}</td>
                    <td>{cart.ticket_count}</td>
                    <td>{(cart.selected_seats || []).join(", ") || "-"}</td>
                    <td>₹{Number(cart.amount || 0).toLocaleString("en-IN")}</td>
                    <td>{cart.step}</td>
                    <td><span className={`status-badge status-${String(cart.status || "").toLowerCase()}`}>{cart.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeView === "activity" && (
        <section className="card report-card">
          <div className="card-title-row">
            <div>
              <p className="eyebrow">Audit trail</p>
              <h2>User Activity Log</h2>
              <p className="muted-text">Every key action is logged with user, page, event and activity details.</p>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table contrast-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Page</th>
                  <th>Event</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && <tr><td colSpan="7" className="empty-cell">No user activity has been logged yet.</td></tr>}
                {logs.map((log) => (
                  <tr key={log.log_id}>
                    <td>{log.timestamp}</td>
                    <td>{log.full_name || log.username || log.user_id}</td>
                    <td>{log.role}</td>
                    <td><strong>{log.action}</strong></td>
                    <td>{log.page}</td>
                    <td>{log.event_name || log.event_id}</td>
                    <td><code>{JSON.stringify(log.details || {})}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

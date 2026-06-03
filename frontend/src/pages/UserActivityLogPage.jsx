import React, { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function formatDetails(details) {
  if (!details || Object.keys(details).length === 0) return "-";
  try {
    return JSON.stringify(details, null, 0);
  } catch (error) {
    return String(details);
  }
}

export default function UserActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [limit, setLimit] = useState(500);

  const loadLogs = async () => {
    setMessage("");
    try {
      const response = await fetch(`${API}/admin/user-activity?limit=${limit}`);
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      setMessage("Unable to load user activity logs. Please check that the backend is running.");
    }
  };

  useEffect(() => {
    loadLogs();
  }, [limit]);

  const actions = useMemo(() => {
    const unique = new Set(logs.map((log) => log.action).filter(Boolean));
    return ["ALL", ...Array.from(unique).sort()];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesAction = actionFilter === "ALL" || log.action === actionFilter;
      const matchesRole = roleFilter === "ALL" || log.role === roleFilter;
      const haystack = [
        log.timestamp,
        log.full_name,
        log.username,
        log.mobile,
        log.role,
        log.action,
        log.page,
        log.event_name,
        log.event_id,
        formatDetails(log.details),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesAction && matchesRole && (!q || haystack.includes(q));
    });
  }, [logs, search, actionFilter, roleFilter]);

  return (
    <main className="page activity-log-page">
      <section className="page-hero compact-hero">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h1>User Activity Log Report</h1>
          <p>View every tracked user action as a searchable list report for audit, support and operations.</p>
        </div>
        <button className="primary-btn" onClick={loadLogs}>Refresh Logs</button>
      </section>

      <section className="analytics-summary-grid">
        <div className="metric-card"><span>Total Log Entries</span><strong>{logs.length}</strong></div>
        <div className="metric-card"><span>Filtered Entries</span><strong>{filteredLogs.length}</strong></div>
        <div className="metric-card"><span>Unique Users</span><strong>{new Set(logs.map((item) => item.username || item.user_id).filter(Boolean)).size}</strong></div>
        <div className="metric-card"><span>Action Types</span><strong>{Math.max(actions.length - 1, 0)}</strong></div>
      </section>

      {message && <div className="message-box error">{message}</div>}

      <section className="card report-card">
        <div className="card-title-row stacked-mobile">
          <div>
            <p className="eyebrow">List report</p>
            <h2>Website User Actions</h2>
            <p className="muted-text">Search by user, mobile, action, page, event or log details.</p>
          </div>
          <div className="filter-toolbar">
            <input
              className="input search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
            />
            <select className="input compact-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              {actions.map((action) => (
                <option key={action} value={action}>{action === "ALL" ? "All actions" : action}</option>
              ))}
            </select>
            <select className="input compact-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="ALL">All roles</option>
              <option value="ADMIN">Admin</option>
              <option value="AUDIENCE">Audience</option>
            </select>
            <select className="input compact-select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={100}>Last 100</option>
              <option value={500}>Last 500</option>
              <option value={1000}>Last 1000</option>
            </select>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table contrast-table activity-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Mobile</th>
                <th>Role</th>
                <th>Action</th>
                <th>Page</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 && (
                <tr><td colSpan="8" className="empty-cell">No logs found for the selected filters.</td></tr>
              )}
              {filteredLogs.map((log) => (
                <tr key={log.log_id}>
                  <td>{log.timestamp || "-"}</td>
                  <td>
                    <strong>{log.full_name || log.username || log.user_id || "Unknown"}</strong>
                    {log.username && <small className="table-subtext">{log.username}</small>}
                  </td>
                  <td>{log.mobile || "-"}</td>
                  <td><span className="status-badge">{log.role || "-"}</span></td>
                  <td><strong>{log.action || "-"}</strong></td>
                  <td>{log.page || "-"}</td>
                  <td>{log.event_name || log.event_id || "-"}</td>
                  <td><code className="details-code">{formatDetails(log.details)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

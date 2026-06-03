import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrator" },
  { value: "SUPER_USER", label: "Super User" },
  { value: "SALES", label: "Sales" },
  { value: "AUDIENCE", label: "Audience" },
];

const PAGE_OPTIONS = [
  { id: "events", label: "Events" },
  { id: "layout", label: "Seating Layout" },
  { id: "booking", label: "Seat Booking / Book Tickets" },
  { id: "ticketsSold", label: "Tickets Sold" },
  { id: "gate", label: "Gate Entry" },
  { id: "reverse", label: "Face to QR" },
  { id: "workflowFaceID", label: "FaceID Workflow" },
  { id: "pay", label: "Face Pay" },
  { id: "users", label: "Users" },
  { id: "config", label: "Configuration" },
  { id: "analytics", label: "Reports" },
  { id: "activityLogs", label: "Activity Logs" },
  { id: "admin", label: "Admin Dashboard" },
  { id: "myBookings", label: "My Bookings" },
];

const ROLE_DEFAULT_ACCESS = {
  ADMIN: PAGE_OPTIONS.map((page) => page.id),
  SUPER_USER: ["events", "layout", "booking", "ticketsSold", "gate", "reverse", "workflowFaceID", "pay", "analytics", "activityLogs", "admin"],
  SALES: ["booking", "ticketsSold", "events", "analytics"],
  AUDIENCE: ["booking", "myBookings"],
};

function normalizeRole(role) {
  return String(role || "AUDIENCE").toUpperCase();
}

function defaultPagesForRole(role) {
  return [...(ROLE_DEFAULT_ACCESS[normalizeRole(role)] || ROLE_DEFAULT_ACCESS.AUDIENCE)];
}

function togglePage(list, pageId) {
  return list.includes(pageId) ? list.filter((id) => id !== pageId) : [...list, pageId];
}

function formatRole(role) {
  return ROLE_OPTIONS.find((option) => option.value === normalizeRole(role))?.label || role;
}

const emptyUser = {
  full_name: "",
  mobile: "",
  email: "",
  username: "",
  password: "",
  role: "AUDIENCE",
  status: "ACTIVE",
  city: "",
  state: "",
  country: "India",
  instagram: "",
  facebook: "",
  interests: [],
  consent_social_linking: false,
  consent_biometric_ticketing: true,
  access_pages: ROLE_DEFAULT_ACCESS.AUDIENCE,
};

function userToForm(user) {
  return {
    full_name: user.full_name || "",
    mobile: user.mobile || "",
    email: user.email || "",
    username: user.username || "",
    password: "",
    role: user.role || "AUDIENCE",
    status: user.status || "ACTIVE",
    city: user.city || "",
    state: user.state || "",
    country: user.country || "India",
    instagram: user.instagram || "",
    facebook: user.facebook || "",
    interests: Array.isArray(user.interests) ? user.interests : [],
    consent_social_linking: Boolean(user.consent_social_linking),
    consent_biometric_ticketing: Boolean(user.consent_biometric_ticketing),
    access_pages: Array.isArray(user.access_pages) && user.access_pages.length ? user.access_pages : defaultPagesForRole(user.role),
  };
}

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyUser);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(emptyUser);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const loadUsers = async () => {
    const response = await fetch(`${API_BASE}/users`);
    const data = await response.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const update = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "mobile") {
        const oldMobile = prev.mobile || "";
        const currentUsername = prev.username || "";
        if (!currentUsername || currentUsername === oldMobile) {
          next.username = value;
        }
      }
      if (field === "role") {
        next.access_pages = defaultPagesForRole(value);
      }
      return next;
    });
  };

  const updateEdit = (field, value) => {
    setEditForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "mobile") {
        const oldMobile = prev.mobile || "";
        const currentUsername = prev.username || "";
        if (!currentUsername || currentUsername === oldMobile) {
          next.username = value;
        }
      }
      if (field === "role") {
        next.access_pages = defaultPagesForRole(value);
      }
      return next;
    });
  };

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const statusOk = filter === "ALL" || user.status === filter;
      const text = `${user.full_name || ""} ${user.username || ""} ${user.mobile || ""} ${user.email || ""}`.toLowerCase();
      return statusOk && (!term || text.includes(term));
    });
  }, [users, filter, search]);

  const updateAccessPage = (pageId) => {
    setForm((prev) => ({ ...prev, access_pages: togglePage(prev.access_pages || [], pageId) }));
  };

  const updateEditAccessPage = (pageId) => {
    setEditForm((prev) => ({ ...prev, access_pages: togglePage(prev.access_pages || [], pageId) }));
  };

  const createUser = async () => {
    setMessage("");
    const payload = {
      ...form,
      username: form.username || form.mobile,
    };

    if (!payload.full_name || !payload.mobile || !payload.password) {
      setMessage("Name, mobile and password are required. Username will default to mobile number.");
      return;
    }
    const response = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setMessage(data.message || "User save completed");
    if (data.status === "SUCCESS") {
      setForm(emptyUser);
      loadUsers();
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setEditForm(userToForm(user));
    setMessage("");
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    if (!editForm.full_name || !editForm.mobile) {
      setMessage("Name and mobile are required. Username will default to mobile number.");
      return;
    }

    const payload = { ...editForm, username: editForm.username || editForm.mobile };
    if (!payload.password) delete payload.password;

    const response = await fetch(`${API_BASE}/users/${editingUser.user_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setMessage(data.message || "User updated");
    if (data.status === "SUCCESS") {
      setEditingUser(null);
      loadUsers();
    }
  };

  const setUserStatus = async (user, status) => {
    const action = status === "ACTIVE" ? "activate" : "deactivate";
    const response = await fetch(`${API_BASE}/users/${user.user_id}/${action}`, { method: "POST" });
    const data = await response.json();
    setMessage(data.message || "User status updated");
    loadUsers();
  };

  const deleteUser = async (user) => {
    const ok = window.confirm(`Delete user ${user.full_name}? This removes the user record from the local JSON file.`);
    if (!ok) return;
    const response = await fetch(`${API_BASE}/users/${user.user_id}`, { method: "DELETE" });
    const data = await response.json();
    setMessage(data.message || "User deleted");
    loadUsers();
  };

  return (
    <main className="page-wrap">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Create users, edit details, delete users, and switch users active or inactive.</p>
        </div>
      </div>

      <div className="content-grid two-col">
        <section className="card">
          <h2>Create New User</h2>
          <div className="form-grid two">
            <div><label>Full Name <span className="required-star">*</span></label><input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} /></div>
            <div><label>Role</label><select value={form.role} onChange={(e) => update("role", e.target.value)}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
            <div><label>Mobile <span className="required-star">*</span></label><input value={form.mobile} onChange={(e) => update("mobile", e.target.value)} /></div>
            <div><label>Email</label><input value={form.email} onChange={(e) => update("email", e.target.value)} /></div>
            <div><label>Username</label><input value={form.username || form.mobile} readOnly title="Username defaults to mobile number" /></div>
            <div><label>Password <span className="required-star">*</span></label><input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} /></div>
            <div><label>Status</label><select value={form.status} onChange={(e) => update("status", e.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
            <div><label>City</label><input value={form.city} onChange={(e) => update("city", e.target.value)} /></div>
            <div><label>State</label><input value={form.state} onChange={(e) => update("state", e.target.value)} /></div>
            <div><label>Country</label><input value={form.country} onChange={(e) => update("country", e.target.value)} /></div>
            <div><label>Instagram</label><input value={form.instagram} onChange={(e) => update("instagram", e.target.value)} /></div>
            <div><label>Facebook</label><input value={form.facebook} onChange={(e) => update("facebook", e.target.value)} /></div>
          </div>
          <section className="access-page-panel">
            <div className="section-header-row compact">
              <div>
                <h3>Page Access</h3>
                <p>Select the pages this user can open after login.</p>
              </div>
              <button type="button" className="secondary-button small" onClick={() => update("access_pages", defaultPagesForRole(form.role))}>Use role default</button>
            </div>
            <div className="access-page-grid">
              {PAGE_OPTIONS.map((page) => (
                <label key={page.id} className="access-page-check">
                  <input
                    type="checkbox"
                    checked={(form.access_pages || []).includes(page.id)}
                    onChange={() => updateAccessPage(page.id)}
                  />
                  <span>{page.label}</span>
                </label>
              ))}
            </div>
          </section>
          <label>Interests</label>
          <input placeholder="Music, theatre, comedy" onChange={(e) => update("interests", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
          <label className="check-row"><input type="checkbox" checked={form.consent_social_linking} onChange={(e) => update("consent_social_linking", e.target.checked)} /> Social linking consent captured</label>
          <label className="check-row"><input type="checkbox" checked={form.consent_biometric_ticketing} onChange={(e) => update("consent_biometric_ticketing", e.target.checked)} /> Biometric ticketing consent captured</label>
          <button className="primary-button" onClick={createUser}>Create User</button>
          {message && <div className="message-box">{message}</div>}
        </section>

        <section className="card">
          <div className="section-header-row">
            <div>
              <h2>Users</h2>
              <p>{filteredUsers.length} of {users.length} users shown</p>
            </div>
          </div>

          <div className="user-toolbar">
            <input placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All users</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>
          </div>

          <div className="responsive-table-wrap">
            <table className="data-table user-management-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Pages</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th>Social</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.user_id}>
                    <td><strong>{user.full_name}</strong><br /><small>{user.username}</small></td>
                    <td>{formatRole(user.role)}</td>
                    <td><small>{(user.access_pages || defaultPagesForRole(user.role)).length} pages</small></td>
                    <td><span className={user.status === "ACTIVE" ? "status-pill active" : "status-pill inactive"}>{user.status}</span></td>
                    <td><small>{user.mobile || "-"}<br />{user.email || ""}</small></td>
                    <td><small>{user.instagram || "-"}<br />{user.facebook || ""}</small></td>
                    <td>
                      <div className="row-actions">
                        <button className="secondary-button small" onClick={() => openEdit(user)}>Edit</button>
                        {user.status === "ACTIVE" ? (
                          <button className="warning-button small" disabled={user.user_id === "USRADMIN"} onClick={() => setUserStatus(user, "INACTIVE")}>Inactive</button>
                        ) : (
                          <button className="success-button small" onClick={() => setUserStatus(user, "ACTIVE")}>Active</button>
                        )}
                        <button className="danger-button small" disabled={user.user_id === "USRADMIN"} onClick={() => deleteUser(user)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan="7" className="empty-cell">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editingUser && (
        <div className="modal-backdrop">
          <div className="modal-card wide-modal">
            <div className="modal-header">
              <div>
                <h2>Edit User</h2>
                <p>Update profile, access role, status, and login details.</p>
              </div>
              <button className="icon-button" onClick={() => setEditingUser(null)}>×</button>
            </div>

            <div className="form-grid two">
              <div><label>Full Name <span className="required-star">*</span></label><input value={editForm.full_name} onChange={(e) => updateEdit("full_name", e.target.value)} /></div>
              <div><label>Role</label><select value={editForm.role} onChange={(e) => updateEdit("role", e.target.value)}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
              <div><label>Status</label><select value={editForm.status} onChange={(e) => updateEdit("status", e.target.value)} disabled={editingUser.user_id === "USRADMIN"}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
              <div><label>Username</label><input value={editForm.username || editForm.mobile} readOnly title="Username defaults to mobile number" /></div>
              <div><label>New Password</label><input type="password" placeholder="Leave blank to keep current password" value={editForm.password} onChange={(e) => updateEdit("password", e.target.value)} /></div>
              <div><label>Mobile <span className="required-star">*</span></label><input value={editForm.mobile} onChange={(e) => updateEdit("mobile", e.target.value)} /></div>
              <div><label>Email</label><input value={editForm.email} onChange={(e) => updateEdit("email", e.target.value)} /></div>
              <div><label>City</label><input value={editForm.city} onChange={(e) => updateEdit("city", e.target.value)} /></div>
              <div><label>State</label><input value={editForm.state} onChange={(e) => updateEdit("state", e.target.value)} /></div>
              <div><label>Country</label><input value={editForm.country} onChange={(e) => updateEdit("country", e.target.value)} /></div>
              <div><label>Instagram</label><input value={editForm.instagram} onChange={(e) => updateEdit("instagram", e.target.value)} /></div>
              <div><label>Facebook</label><input value={editForm.facebook} onChange={(e) => updateEdit("facebook", e.target.value)} /></div>
            </div>
            <section className="access-page-panel">
              <div className="section-header-row compact">
                <div>
                  <h3>Page Access</h3>
                  <p>Choose the exact pages this user can access.</p>
                </div>
                <button type="button" className="secondary-button small" onClick={() => updateEdit("access_pages", defaultPagesForRole(editForm.role))}>Use role default</button>
              </div>
              <div className="access-page-grid">
                {PAGE_OPTIONS.map((page) => (
                  <label key={page.id} className="access-page-check">
                    <input
                      type="checkbox"
                      checked={(editForm.access_pages || []).includes(page.id)}
                      onChange={() => updateEditAccessPage(page.id)}
                    />
                    <span>{page.label}</span>
                  </label>
                ))}
              </div>
            </section>
            <label>Interests</label>
            <input value={(editForm.interests || []).join(", ")} onChange={(e) => updateEdit("interests", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
            <label className="check-row"><input type="checkbox" checked={editForm.consent_social_linking} onChange={(e) => updateEdit("consent_social_linking", e.target.checked)} /> Social linking consent captured</label>
            <label className="check-row"><input type="checkbox" checked={editForm.consent_biometric_ticketing} onChange={(e) => updateEdit("consent_biometric_ticketing", e.target.checked)} /> Biometric ticketing consent captured</label>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setEditingUser(null)}>Cancel</button>
              <button className="primary-button" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

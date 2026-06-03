import React, { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (window.location.port === "5173" ? "http://127.0.0.1:8000" : "");

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "admin123" });
  const [registerForm, setRegisterForm] = useState({
    full_name: "",
    mobile: "",
    email: "",
    username: "",
    password: "",
    city: "",
    state: "",
    country: "India",
    date_of_birth: "",
    gender: "",
    instagram: "",
    facebook: "",
    interests: [],
    consent_social_linking: false,
    consent_biometric_ticketing: true,
  });

  const updateRegister = (field, value) => {
    setRegisterForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "mobile") {
        const oldMobile = prev.mobile || "";
        const currentUsername = prev.username || "";
        if (!currentUsername || currentUsername === oldMobile) {
          next.username = value;
        }
      }
      return next;
    });
  };

  const logActivity = async (user, action, details = {}) => {
    try {
      await fetch(`${API_BASE}/analytics/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.user_id || "",
          username: user?.username || "",
          full_name: user?.full_name || "",
          mobile: user?.mobile || "",
          role: user?.role || "",
          action,
          page: "LoginPage",
          details,
        }),
      });
    } catch (error) {
      // Login should not fail if audit logging is unavailable.
    }
  };

  const login = async () => {
    setMessage("");
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginForm),
    });
    const data = await response.json();
    if (data.status === "SUCCESS") {
      await logActivity(data.user, "LOGIN_SUCCESS", { mode: "login" });
      localStorage.setItem("bt_user", JSON.stringify(data.user));
      onLogin(data.user);
      return;
    }
    setMessage(data.message || "Login failed");
  };

  const registerAudience = async () => {
    setMessage("");
    const payload = {
      ...registerForm,
      username: registerForm.username || registerForm.mobile,
    };

    if (!payload.full_name || !payload.mobile || !payload.password) {
      setMessage("Name, mobile and password are required. Username will default to mobile number.");
      return;
    }
    const response = await fetch(`${API_BASE}/auth/register-audience`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (data.status === "SUCCESS") {
      await logActivity(data.user, "AUDIENCE_REGISTERED", { mode: "register" });
      localStorage.setItem("bt_user", JSON.stringify(data.user));
      onLogin(data.user);
      return;
    }
    setMessage(data.message || "Registration failed");
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">1F</span>
          <div>
            <h1>1Booking</h1>
            <p>Login as Admin or create an Audience account for biometric booking.</p>
          </div>
        </div>

        <div className="auth-toggle">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Audience Sign Up</button>
        </div>

        {mode === "login" ? (
          <div className="auth-form">
            <label>Username</label>
            <input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} />
            <label>Password</label>
            <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
            <button className="primary-button full" onClick={login}>Login</button>
            <p className="hint">Default admin for local demo: <strong>admin</strong> / <strong>admin123</strong></p>
          </div>
        ) : (
          <div className="auth-form">
            <div className="form-grid two">
              <div><label>Full Name</label><input value={registerForm.full_name} onChange={(e) => updateRegister("full_name", e.target.value)} /></div>
              <div><label>Mobile <span className="required-star">*</span></label><input value={registerForm.mobile} onChange={(e) => updateRegister("mobile", e.target.value)} /></div>
              <div><label>Email</label><input value={registerForm.email} onChange={(e) => updateRegister("email", e.target.value)} /></div>
              <div><label>Username</label><input value={registerForm.username || registerForm.mobile} readOnly title="Username defaults to mobile number" /></div>
              <div><label>Password</label><input type="password" value={registerForm.password} onChange={(e) => updateRegister("password", e.target.value)} /></div>
              <div><label>Date of Birth</label><input type="date" value={registerForm.date_of_birth} onChange={(e) => updateRegister("date_of_birth", e.target.value)} /></div>
              <div><label>City</label><input value={registerForm.city} onChange={(e) => updateRegister("city", e.target.value)} /></div>
              <div><label>State</label><input value={registerForm.state} onChange={(e) => updateRegister("state", e.target.value)} /></div>
              <div><label>Country</label><input value={registerForm.country} onChange={(e) => updateRegister("country", e.target.value)} /></div>
              <div><label>Gender</label><select value={registerForm.gender} onChange={(e) => updateRegister("gender", e.target.value)}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select></div>
              <div><label>Instagram Handle</label><input placeholder="@username" value={registerForm.instagram} onChange={(e) => updateRegister("instagram", e.target.value)} /></div>
              <div><label>Facebook Profile</label><input placeholder="Profile URL or name" value={registerForm.facebook} onChange={(e) => updateRegister("facebook", e.target.value)} /></div>
            </div>
            <label>Interests</label>
            <input placeholder="Music, comedy, theatre" onChange={(e) => updateRegister("interests", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
            <label className="check-row"><input type="checkbox" checked={registerForm.consent_social_linking} onChange={(e) => updateRegister("consent_social_linking", e.target.checked)} /> I consent to link social handles for profile enrichment.</label>
            <label className="check-row"><input type="checkbox" checked={registerForm.consent_biometric_ticketing} onChange={(e) => updateRegister("consent_biometric_ticketing", e.target.checked)} /> I consent to biometric ticket booking and gate verification.</label>
            <button className="primary-button full" onClick={registerAudience}>Create Audience Account</button>
            <p className="hint">Social media linking is captured as handles/URLs in this local demo. Production integrations should use official OAuth consent flows.</p>
          </div>
        )}

        {message && <div className="message-box error">{message}</div>}
      </div>
    </div>
  );
}

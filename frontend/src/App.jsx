import React, { useEffect, useMemo, useState } from "react";
import SeatBookingPage from "./pages/SeatBookingPage.jsx";
import GateEntryPage from "./pages/GateEntryPage.jsx";
import FacePurchasePage from "./pages/FacePurchasePage.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import EventsPage from "./pages/EventsPage.jsx";
import SeatingLayoutPage from "./pages/SeatingLayoutPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import UserManagementPage from "./pages/UserManagementPage.jsx";
import TicketsSoldPage from "./pages/TicketsSoldPage.jsx";
import BiometricReverseLookupPage from "./pages/BiometricReverseLookupPage.jsx";
import WorkflowFaceIDPage from "./pages/WorkflowFaceIDPage.jsx";
import AudienceBookingsPage from "./pages/AudienceBookingsPage.jsx";
import WorkflowConfigurationPage from "./pages/WorkflowConfigurationPage.jsx";
import AnalyticsReportPage from "./pages/AnalyticsReportPage.jsx";
import UserActivityLogPage from "./pages/UserActivityLogPage.jsx";

const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const primaryTabs = [
  { id: "events", label: "Events", icon: "▦" },
  { id: "layout", label: "Seating Layout", icon: "◌" },
  { id: "booking", label: "Seat Booking", icon: "▣" },
  { id: "ticketsSold", label: "Tickets Sold", icon: "₹" },
  { id: "gate", label: "Gate Entry", icon: "⇥" },
];

const settingsTabs = [
  { id: "reverse", label: "Face to QR", icon: "⌖" },
  { id: "workflowFaceID", label: "FaceID Workflow", icon: "◎" },
  { id: "pay", label: "Face Pay", icon: "◆" },
  { id: "users", label: "Users", icon: "◉" },
  { id: "config", label: "Configuration", icon: "☑" },
  { id: "analytics", label: "Reports", icon: "▥" },
  { id: "activityLogs", label: "Activity Logs", icon: "☷" },
  { id: "admin", label: "Admin", icon: "⚙" },
];

const audienceTabs = [
  { id: "booking", label: "Book Tickets", icon: "▣" },
  { id: "myBookings", label: "My Bookings", icon: "▤" },
];

const allTabs = [...primaryTabs, ...settingsTabs, ...audienceTabs];

const defaultAccessByRole = {
  ADMIN: allTabs.map((tab) => tab.id),
  SUPER_USER: ["events", "layout", "booking", "ticketsSold", "gate", "reverse", "workflowFaceID", "pay", "analytics", "activityLogs", "admin"],
  SALES: ["booking", "ticketsSold", "events", "analytics"],
  AUDIENCE: ["booking", "myBookings"],
};

function normalizeRole(role) {
  return String(role || "AUDIENCE").toUpperCase();
}

function getAccessPages(user) {
  const role = normalizeRole(user?.role);
  const saved = Array.isArray(user?.access_pages) ? user.access_pages : [];
  return saved.length ? saved : defaultAccessByRole[role] || defaultAccessByRole.AUDIENCE;
}

function roleLabel(role) {
  const map = {
    ADMIN: "Administrator",
    SUPER_USER: "Super User",
    SALES: "Sales",
    AUDIENCE: "Audience",
  };
  return map[normalizeRole(role)] || "User";
}

function firstAllowedTab(user) {
  const access = getAccessPages(user);
  const role = normalizeRole(user?.role);
  const preferred = role === "AUDIENCE" ? ["booking", "myBookings"] : ["events", "booking", "ticketsSold", "admin"];
  return preferred.find((id) => access.includes(id)) || access[0] || "booking";
}

export default function App() {
  const [activeTab, setActiveTab] = useState("events");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("bt_user");
    if (stored) {
      const user = JSON.parse(stored);
      setCurrentUser(user);
      setActiveTab(firstAllowedTab(user));
    }
  }, []);

  const onLogin = (user) => {
    setCurrentUser(user);
    setActiveTab(firstAllowedTab(user));
  };

  const logout = async () => {
    const user = currentUser;
    try {
      await fetch(`${API}/analytics/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.user_id || "",
          username: user?.username || "",
          full_name: user?.full_name || "",
          mobile: user?.mobile || "",
          role: user?.role || "",
          action: "LOGOUT",
          page: "App",
          details: { reason: "User clicked logout" },
        }),
      });
    } catch (error) {
      // Logout should still work even if the audit API is unavailable.
    }
    localStorage.removeItem("bt_user");
    setCurrentUser(null);
    setActiveTab("events");
  };

  const accessPages = useMemo(() => getAccessPages(currentUser), [currentUser]);
  const canAccess = (pageId) => accessPages.includes(pageId);
  const visiblePrimaryTabs = primaryTabs.filter((tab) => canAccess(tab.id));
  const visibleSettingsTabs = settingsTabs.filter((tab) => canAccess(tab.id));
  const visibleAudienceTabs = audienceTabs.filter((tab) => canAccess(tab.id));

  useEffect(() => {
    if (currentUser && !canAccess(activeTab)) {
      setActiveTab(firstAllowedTab(currentUser));
    }
  }, [currentUser, activeTab]);

  if (!currentUser) {
    return <LoginPage onLogin={onLogin} />;
  }

  const role = normalizeRole(currentUser.role);
  const settingsIsActive = visibleSettingsTabs.some((tab) => tab.id === activeTab);
  const currentTabLabel = allTabs.find((tab) => tab.id === activeTab)?.label || "Dashboard";

  if (role === "AUDIENCE") {
    return (
      <div className="audience-app-shell">
        <header className="audience-topbar">
          <div className="brand audience-brand">
            <span className="brand-mark">1B</span>
            <div>
              <strong>1Booking Events</strong>
              <small>Discover. Book. Enter securely.</small>
            </div>
          </div>
          <div className="audience-user-actions">
            <span>Hi, {currentUser.full_name}</span>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </header>
        <nav className="audience-top-tabs">
          {visibleAudienceTabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "audience-tab active" : "audience-tab"}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        {activeTab === "booking" && canAccess("booking") && <SeatBookingPage currentUser={currentUser} />}
        {activeTab === "myBookings" && canAccess("myBookings") && <AudienceBookingsPage currentUser={currentUser} />}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar-nav">
        <div className="brand side-brand">
          <span className="brand-mark">1B</span>
          <div>
            <strong>1Booking</strong>
            <small>Biometric Ticketing</small>
          </div>
        </div>

        <div className="sidebar-section-label">Navigation</div>

        <div className="sidebar-menu">
          {visiblePrimaryTabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "side-nav-btn active" : "side-nav-btn"}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="side-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}

          {visibleSettingsTabs.length > 0 && (
            <div className={settingsIsActive ? "settings-nav-group active" : "settings-nav-group"}>
              <button
                className={settingsIsActive ? "side-nav-btn settings-toggle active" : "side-nav-btn settings-toggle"}
                onClick={() => setActiveTab(visibleSettingsTabs[0].id)}
              >
                <span className="side-icon">⚙</span>
                <span>Settings</span>
                <span className="settings-chevron">▾</span>
              </button>

              <div className="settings-submenu">
                {visibleSettingsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={activeTab === tab.id ? "settings-subnav-btn active" : "settings-subnav-btn"}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="side-icon">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-chip side-user-chip">
            <span>{currentUser.full_name}</span>
            <small>{roleLabel(currentUser.role)}</small>
          </div>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </aside>

      <main className="main-workspace">
        <header className="workspace-topbar">
          <div>
            <p className="eyebrow">Secure ticketing console</p>
            <h1>{currentTabLabel}</h1>
          </div>
          <div className="workspace-status">
            <span className="status-dot"></span>
            {roleLabel(currentUser.role)} access
          </div>
        </header>

        <section className="workspace-content">
          {activeTab === "events" && canAccess("events") && <EventsPage />}
          {activeTab === "layout" && canAccess("layout") && <SeatingLayoutPage />}
          {activeTab === "booking" && canAccess("booking") && <SeatBookingPage currentUser={currentUser} />}
          {activeTab === "ticketsSold" && canAccess("ticketsSold") && <TicketsSoldPage />}
          {activeTab === "gate" && canAccess("gate") && <GateEntryPage />}
          {activeTab === "reverse" && canAccess("reverse") && <BiometricReverseLookupPage />}
          {activeTab === "workflowFaceID" && canAccess("workflowFaceID") && <WorkflowFaceIDPage />}
          {activeTab === "pay" && canAccess("pay") && <FacePurchasePage />}
          {activeTab === "users" && canAccess("users") && <UserManagementPage />}
          {activeTab === "config" && canAccess("config") && <WorkflowConfigurationPage />}
          {activeTab === "analytics" && canAccess("analytics") && <AnalyticsReportPage />}
          {activeTab === "activityLogs" && canAccess("activityLogs") && <UserActivityLogPage />}
          {activeTab === "admin" && canAccess("admin") && <AdminDashboard />}
        </section>
      </main>
    </div>
  );
}

/* ================================================================
   DispatcherOne – Driver PWA  ·  Application logic
   ================================================================ */

(function () {
  "use strict";

  // ---- Configuration -------------------------------------------------
  // API base URL – default to same origin; override via localStorage
  const API = localStorage.getItem("api_url") || window.location.origin;

  // Canonical statuses in progression order
  const STATUS_ORDER = [
    "PENDING",
    "ASSIGNED",
    "ACTIVE",
    "EN_ROUTE",
    "94",
    "95",
    "97",
    "IN_TOW",
    "98",
  ];

  const STATUS_LABELS = {
    PENDING: "Pending",
    ASSIGNED: "Assigned",
    ACTIVE: "Active",
    EN_ROUTE: "En Route",
    "94": "94 – On Scene",
    "95": "95 – Loaded",
    "97": "97 – Dropping",
    IN_TOW: "In Tow",
    "98": "98 – Done",
  };

  // ---- State ---------------------------------------------------------
  let token = localStorage.getItem("driver_token") || null;
  let driverId = localStorage.getItem("driver_id") || null;
  let driverName = localStorage.getItem("driver_name") || "";
  let ws = null;

  // ---- DOM refs ------------------------------------------------------
  const loginScreen = document.getElementById("login-screen");
  const dashScreen = document.getElementById("dashboard-screen");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const driverNameEl = document.getElementById("driver-name");
  const jobsList = document.getElementById("jobs-list");
  const refreshBtn = document.getElementById("refresh-btn");
  const logoutBtn = document.getElementById("logout-btn");

  // ---- Helpers -------------------------------------------------------
  async function api(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Auth-Token"] = token;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Request failed");
    }
    return res.json();
  }

  function show(el) {
    el.hidden = false;
  }
  function hide(el) {
    el.hidden = true;
  }

  // ---- Auth ----------------------------------------------------------
  function showLogin() {
    show(loginScreen);
    hide(dashScreen);
  }

  function showDashboard() {
    hide(loginScreen);
    show(dashScreen);
    driverNameEl.textContent = driverName;
    loadJobs();
    connectWS();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(loginError);
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    try {
      const data = await api("POST", "/driver/login", { email, password });
      token = data.token;
      driverId = data.driver_id;
      driverName = data.display_name;
      localStorage.setItem("driver_token", token);
      localStorage.setItem("driver_id", driverId);
      localStorage.setItem("driver_name", driverName);
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      show(loginError);
    }
  });

  logoutBtn.addEventListener("click", () => {
    token = null;
    driverId = null;
    driverName = "";
    localStorage.removeItem("driver_token");
    localStorage.removeItem("driver_id");
    localStorage.removeItem("driver_name");
    if (ws) {
      ws.close();
      ws = null;
    }
    showLogin();
  });

  // ---- Jobs ----------------------------------------------------------
  async function loadJobs() {
    try {
      const jobs = await api("GET", "/driver/jobs");
      renderJobs(jobs);
    } catch (err) {
      if (err.message === "Unauthorized") {
        logoutBtn.click();
        return;
      }
      jobsList.innerHTML = `<p class="empty-state">Error loading jobs: ${escapeHtml(err.message)}</p>`;
    }
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function renderJobs(jobs) {
    if (!jobs.length) {
      jobsList.innerHTML = '<p class="empty-state">No assigned jobs right now.</p>';
      return;
    }

    jobsList.innerHTML = jobs
      .map((job) => {
        const callNum = job.external_call_number || job.id.slice(0, 8);
        const statusLabel = STATUS_LABELS[job.status] || job.status;

        const buttons = STATUS_ORDER.filter((s) => s !== "PENDING") // drivers don't set PENDING
          .map((s) => {
            const isCurrent = s === job.status;
            return `<button
              class="status-btn${isCurrent ? " current" : ""}"
              data-job-id="${job.id}"
              data-status="${s}"
              ${isCurrent ? "disabled" : ""}
            >${STATUS_LABELS[s] || s}</button>`;
          })
          .join("");

        return `
        <div class="job-card" data-job-id="${job.id}">
          <div class="job-header">
            <span class="job-call-number">${escapeHtml(callNum)}</span>
            <span class="job-status-badge status-${job.status}">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="job-detail"><strong>Pickup:</strong> ${escapeHtml(job.pickup_address)}</div>
          ${job.dropoff_address ? `<div class="job-detail"><strong>Dropoff:</strong> ${escapeHtml(job.dropoff_address)}</div>` : ""}
          ${job.vehicle_description ? `<div class="job-detail"><strong>Vehicle:</strong> ${escapeHtml(job.vehicle_description)}</div>` : ""}
          ${job.notes ? `<div class="job-detail"><strong>Notes:</strong> ${escapeHtml(job.notes)}</div>` : ""}
          <div class="status-actions">${buttons}</div>
        </div>`;
      })
      .join("");
  }

  // Delegate click on status buttons
  jobsList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".status-btn");
    if (!btn || btn.disabled) return;

    const jobId = btn.dataset.jobId;
    const newStatus = btn.dataset.status;

    // Disable all buttons in this card while updating
    const card = btn.closest(".job-card");
    const buttons = card.querySelectorAll(".status-btn");
    buttons.forEach((b) => (b.disabled = true));

    try {
      await api("PATCH", `/driver/jobs/${jobId}/status`, { status: newStatus });
      await loadJobs(); // Refresh full list
    } catch (err) {
      alert("Status update failed: " + err.message);
      buttons.forEach((b) => (b.disabled = false));
    }
  });

  refreshBtn.addEventListener("click", loadJobs);

  // ---- WebSocket -----------------------------------------------------
  function connectWS() {
    if (ws) ws.close();
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${new URL(API).host}/driver/ws?token=${encodeURIComponent(token)}`;

    ws = new WebSocket(wsUrl);

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "STATUS_UPDATED") {
          loadJobs(); // Refresh jobs on any status change
        }
      } catch {
        // ignore non-JSON messages
      }
    });

    ws.addEventListener("close", () => {
      // Reconnect after a delay if still authenticated
      if (token) {
        setTimeout(connectWS, 3000);
      }
    });
  }

  // ---- Init ----------------------------------------------------------
  if (token) {
    // Validate existing token
    api("GET", "/driver/me")
      .then(() => showDashboard())
      .catch(() => {
        logoutBtn.click();
      });
  } else {
    showLogin();
  }

  // Register service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // SW registration failed – app still works without it
    });
  }
})();

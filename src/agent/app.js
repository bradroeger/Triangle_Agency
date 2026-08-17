const employeeId = decodeURIComponent(location.pathname.split("/").pop());
const socket = io();
const locked = document.querySelector("#locked");
const portal = document.querySelector("#portal");
const groups = document.querySelector("#file-groups");
const viewer = document.querySelector("#viewer");
const viewerBody = document.querySelector("#viewer-body");
const probationWarning = document.querySelector("#probation-warning");
const recordFields = document.querySelector("#employee-record-fields");
const missionMvpBanner = document.querySelector("#mission-mvp-banner");
let viewerObjectUrl;
let reportedLogin;
let refreshInProgress = false;
const deviceId = getDeviceId();

socket.on("connect", () => {
  socket.emit("agent-subscribe", employeeId);
  void refresh();
});
socket.on("agent-portal-state", render);
document.querySelector("#viewer-close").addEventListener("click", closeViewer);
for (const button of document.querySelectorAll(".portal-tabs button")) {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
}
void refresh();
void reportDevice();
setInterval(() => void refresh(), 2000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
window.addEventListener("focus", () => void refresh());

async function refresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const response = await fetch(
      `/api/agent/${encodeURIComponent(employeeId)}`,
      { cache: "no-store" },
    );
    const state = await response.json();
    if (!response.ok) throw new Error(state.error);
    render(state);
  } catch (error) {
    locked.querySelector("h1").textContent = error.message;
  } finally {
    refreshInProgress = false;
  }
}

function render(state) {
  locked.hidden = state.unlocked;
  portal.hidden = !state.unlocked;
  if (!state.unlocked) {
    reportedLogin = undefined;
    closeViewer();
    groups.replaceChildren();
    return;
  }
  if (reportedLogin !== state.loggedInAt) {
    reportedLogin = state.loggedInAt;
    void reportDevice();
  }
  document.querySelector("#employee-name").textContent = state.employee.name;
  document.querySelector("#employee-number").textContent =
    state.employee.employeeNumber ?? state.employee.employeeId;
  document.querySelector("#employee-department").textContent =
    state.employee.department;
  document.querySelector("#employee-demerits").textContent =
    state.employee.demerits;
  document.querySelector("#employee-commendations").textContent =
    state.employee.commendations;
  document.querySelector("#employee-status").textContent =
    state.employee.status;
  probationWarning.hidden = state.employee.status.toUpperCase() !== "PROBATION";
  missionMvpBanner.hidden = !state.employee.missionMvp;
  renderEmployeeRecord(state.employee);
  const definitions = [
    ["red", "PERSONNEL RECORDS", "AGENCY RED"],
    ["yellow", "BREAK ROOM MESSAGES", "REALITY YELLOW"],
    ["blue", "CONTAINMENT VAULT", "ANOMALY BLUE"],
  ];
  groups.replaceChildren(
    ...definitions.map(([category, title, classification]) =>
      createGroup(category, title, classification, state.files),
    ),
  );
}

async function reportDevice() {
  const label = [
    navigator.platform,
    navigator.userAgentData?.mobile ? "Mobile" : "Browser",
  ]
    .filter(Boolean)
    .join(" // ");
  try {
    await fetch(`/api/agent/${encodeURIComponent(employeeId)}/device`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId, label }),
    });
  } catch {
    // Live portal access still works if optional device reporting is unavailable.
  }
}

function getDeviceId() {
  const key = "triangle-agent-device-id";
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = generateDeviceId();
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return generateDeviceId();
  }
}

function generateDeviceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  return `lan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function selectTab(tab) {
  document.querySelector("#files-panel").hidden = tab !== "files";
  document.querySelector("#record-panel").hidden = tab !== "record";
  for (const button of document.querySelectorAll(".portal-tabs button")) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
}

function renderEmployeeRecord(employee) {
  const fields = [
    ["Employee Name", employee.name],
    ["Employee Number", employee.employeeNumber ?? employee.employeeId],
    ["Status", employee.status],
    ["Department", employee.department],
    ["Role", employee.role],
    ["Manager", employee.manager],
    ["Clearance", `LEVEL ${employee.clearance}`],
    ["Hire Date", employee.hireDate],
    ["Employment Type", employee.employmentType],
    ["Work Location", employee.workLocation],
    ["Phone Extension", employee.phoneExtension],
    ["Payroll Number", employee.payrollNumber],
    ["Birthday", employee.birthday],
    ["Next of Kin", employee.nextOfKin],
    ["Anomaly Designation", employee.anomalyDesignation],
    ["Anomaly Type", employee.anomalyType],
    ["Competency Type", employee.competencyType],
    ["Reality Type", employee.realityType],
    ["Anomaly Danger", employee.anomalyDanger],
    ["Company Loyalty", employee.loyalty],
    ["Demerits", employee.demerits],
    ["Commendations", employee.commendations],
    ["Mission MVP", employee.missionMvp ? "CURRENTLY DESIGNATED" : "NO"],
  ];
  recordFields.replaceChildren(
    ...fields
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([label, value]) => {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const detail = document.createElement("dd");
        term.textContent = label;
        detail.textContent = value;
        row.append(term, detail);
        return row;
      }),
  );
}

function createGroup(category, title, classification, files) {
  const section = document.createElement("section");
  section.className = `file-group ${category}`;
  const heading = document.createElement("div");
  heading.className = "group-heading";
  heading.innerHTML = `<span>${classification}</span><h2>${title}</h2>`;
  const list = document.createElement("div");
  list.className = "file-list";
  const matching = files.filter((file) => file.category === category);
  if (!matching.length && category !== "red") section.hidden = true;
  if (!matching.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "NO MATERIAL CURRENTLY ASSIGNED";
    list.append(empty);
  } else {
    for (const file of matching) {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<small>${designation(file.id)}${file.seen ? " // REVIEWED" : " // NEW"}</small><strong>${escapeHtml(file.title)}</strong>`;
      button.addEventListener("click", () => void openFile(file));
      list.append(button);
    }
  }
  section.append(heading, list);
  return section;
}

async function openFile(file) {
  document.querySelector("#viewer-classification").textContent =
    file.classification ?? file.category.toUpperCase();
  document.querySelector("#viewer-title").textContent = file.title;
  viewerBody.replaceChildren();
  if (file.type === "image") {
    const image = document.createElement("img");
    image.alt = file.alt ?? file.title;
    viewerBody.append(image);
    const assetResponse = await fetch(file.assetUrl);
    if (!assetResponse.ok) return closeViewer();
    viewerObjectUrl = URL.createObjectURL(await assetResponse.blob());
    image.src = viewerObjectUrl;
  } else if (file.body) {
    for (const line of file.body) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      viewerBody.append(paragraph);
    }
  }
  viewer.hidden = false;
  document.body.classList.add("viewing");
  const response = await fetch(
    `/api/agent/${encodeURIComponent(employeeId)}/viewed`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentId: file.id }),
    },
  );
  if (!response.ok) closeViewer();
}

function closeViewer() {
  viewer.hidden = true;
  viewerBody.replaceChildren();
  document.body.classList.remove("viewing");
  if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
  viewerObjectUrl = undefined;
}

function designation(id) {
  return id.replace(/^playwall-(agency|anomaly|reality)-/, "").toUpperCase();
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

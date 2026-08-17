const socket = io("/supervisor");
const fields = Object.fromEntries(
  [
    "action",
    "employee-id",
    "resource-id",
    "content-id",
    "flag",
    "value",
    "permission",
    "confirmation",
  ].map((id) => [id, document.querySelector(`#${id}`)]),
);
const result = document.querySelector("#result");
const playwallEmployee = document.querySelector("#playwall-employee");
const playwallDocument = document.querySelector("#playwall-document");
const playwallAssigned = document.querySelector("#playwall-assigned");
const playwallCount = document.querySelector("#playwall-count");
const playwallResult = document.querySelector("#playwall-result");
const reminderEmployee = document.querySelector("#reminder-employee");
const reminderText = document.querySelector("#reminder-text");
const reminderList = document.querySelector("#reminder-list");
const reminderCount = document.querySelector("#reminder-count");
const reminderResult = document.querySelector("#reminder-result");
const newEmployeeDialog = document.querySelector("#new-employee-dialog");
const newEmployeeForm = document.querySelector("#new-employee-form");
const employeeNumberPreview = document.querySelector(
  "#employee-number-preview",
);
const newEmployeeResult = document.querySelector("#new-employee-result");
const agentAccessEmployee = document.querySelector("#agent-access-employee");
const agentAccessStatus = document.querySelector("#agent-access-status");
const agentAccessUrl = document.querySelector("#agent-access-url");
const agentAccessOrigin = document.querySelector("#agent-access-origin");
const agentAccessResult = document.querySelector("#agent-access-result");
const employmentEmployee = document.querySelector("#employment-employee");
const employmentResult = document.querySelector("#employment-result");
let latestState;
installRedThreeTreatment();
socket.on("supervisor-state", renderState);
socket.on("supervisor-effects", renderEffects);
document.querySelector("#apply").addEventListener("click", applyMutation);
document.querySelector("#new-employee-open").addEventListener("click", () => {
  newEmployeeResult.textContent = "";
  newEmployeeDialog.showModal();
});
document
  .querySelector("#new-employee-close")
  .addEventListener("click", () => newEmployeeDialog.close());
document
  .querySelector("#new-employee-cancel")
  .addEventListener("click", () => newEmployeeDialog.close());
newEmployeeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void createEmployee();
});
newEmployeeForm.addEventListener("input", updateEmployeeNumberPreview);
newEmployeeForm.addEventListener("change", updateEmployeeNumberPreview);
document
  .querySelector("#playwall-grant")
  .addEventListener(
    "click",
    () => void changePlaywallAccess("GRANT_PLAYWALL_DOCUMENT"),
  );
playwallEmployee.addEventListener("change", renderAssignedPlaywall);
reminderEmployee.addEventListener("change", renderReminders);
agentAccessEmployee.addEventListener("change", renderAgentAccess);
agentAccessOrigin.addEventListener("change", renderAgentAccess);
employmentEmployee.addEventListener("change", renderEmploymentStatus);
document
  .querySelector("#employment-probation")
  .addEventListener("click", () => void setEmploymentStatus("PROBATION"));
document
  .querySelector("#employment-active")
  .addEventListener("click", () => void setEmploymentStatus("ACTIVE"));
document
  .querySelector("#employment-mvp")
  .addEventListener("click", () => void setMissionMvp(true));
document
  .querySelector("#employment-mvp-clear")
  .addEventListener("click", () => void setMissionMvp(false));
document
  .querySelector("#agent-access-copy")
  .addEventListener("click", async () => {
    if (!agentAccessUrl.value) return;
    await navigator.clipboard.writeText(agentAccessUrl.value);
    agentAccessResult.textContent = "PRIVATE URL COPIED.";
  });
document
  .querySelector("#agent-force-logout")
  .addEventListener("click", async () => {
    if (!agentAccessEmployee.value) return;
    try {
      await request("/api/supervisor/agent-logout", {
        employeeId: agentAccessEmployee.value,
        confirmation: "CONFIRM",
      });
      agentAccessResult.textContent = "AGENT PORTAL LOCKED.";
    } catch (error) {
      agentAccessResult.textContent = `ERROR: ${error.message}`;
    }
  });
document
  .querySelector("#approve-agent-device")
  .addEventListener("click", async () => {
    if (!agentAccessEmployee.value) return;
    try {
      await request("/api/supervisor/approve-agent-device", {
        employeeId: agentAccessEmployee.value,
        confirmation: "CONFIRM",
      });
      agentAccessResult.textContent = "RECENT DEVICE APPROVED.";
    } catch (error) {
      agentAccessResult.textContent = `ERROR: ${error.message}`;
    }
  });
document
  .querySelector("#reminder-add")
  .addEventListener(
    "click",
    () => void changeReminder("ADD_EMPLOYEE_REMINDER"),
  );
reminderText.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void changeReminder("ADD_EMPLOYEE_REMINDER");
});
document.querySelector("#select-resource").addEventListener("click", () =>
  request("/__resource-selection", {
    resourceId: fields["resource-id"].value || null,
  }),
);
document
  .querySelector("#trigger")
  .addEventListener("click", () =>
    operation("/api/supervisor/event", "CONFIRM"),
  );
document
  .querySelector("#export")
  .addEventListener("click", () =>
    operation("/api/supervisor/export", "CONFIRM"),
  );
document
  .querySelector("#reset")
  .addEventListener("click", () =>
    operation(
      "/api/supervisor/reset",
      document.querySelector("#reset-confirmation").value,
    ),
  );

function renderState(state) {
  latestState = state;
  document.querySelector("#current-records").textContent = JSON.stringify(
    { employee: state.employee, resource: state.resource },
    null,
    2,
  );
  document.querySelector("#flags").textContent = JSON.stringify(
    state.flags,
    null,
    2,
  );
  document.querySelector("#history").textContent = JSON.stringify(
    state.triggerHistory,
    null,
    2,
  );
  document
    .querySelector("#content")
    .replaceChildren(
      ...state.unlockedContent.map((id) =>
        Object.assign(document.createElement("li"), { textContent: id }),
      ),
    );
  replaceOptions(
    fields["resource-id"],
    state.resources.map((item) => [item.id, item.name]),
  );
  replaceOptions(
    fields["content-id"],
    state.content.map((item) => [item.id, item.title]),
  );
  replaceOptions(
    playwallEmployee,
    state.employees.map((employee) => [
      employee.employeeId,
      `${employee.name} — ${employee.employeeNumber ?? employee.employeeId}`,
    ]),
    "— SELECT EMPLOYEE —",
  );
  replaceOptions(
    reminderEmployee,
    state.employees.map((employee) => [
      employee.employeeId,
      `${employee.name} — ${employee.employeeNumber ?? employee.employeeId}`,
    ]),
    "— SELECT EMPLOYEE —",
  );
  replaceOptions(
    agentAccessEmployee,
    state.employees.map((employee) => [
      employee.employeeId,
      `${employee.name} â€” ${employee.employeeNumber ?? employee.employeeId}`,
    ]),
    "â€” SELECT EMPLOYEE â€”",
  );
  replaceOptions(
    employmentEmployee,
    state.employees.map((employee) => [
      employee.employeeId,
      `${employee.name} â€” ${employee.employeeNumber ?? employee.employeeId}`,
    ]),
    "â€” SELECT EMPLOYEE â€”",
  );
  const selectedOrigin = agentAccessOrigin.value;
  agentAccessOrigin.replaceChildren(
    ...(state.agentPortalOrigins?.length
      ? state.agentPortalOrigins.map((origin) => new Option(origin, origin))
      : [new Option(location.origin, location.origin)]),
  );
  if (
    [...agentAccessOrigin.options].some(
      (option) => option.value === selectedOrigin,
    )
  )
    agentAccessOrigin.value = selectedOrigin;
  replaceOptions(
    playwallDocument,
    state.content
      .filter((item) => /^playwall-(agency|anomaly|reality)-/.test(item.id))
      .map((item) => [
        item.id,
        `[${playwallColour(item.id)}] ${playwallDesignation(item.id)} — ${item.title}`,
      ]),
    "— SELECT DOCUMENT —",
  );
  renderAssignedPlaywall();
  renderReminders();
  renderAgentAccess();
  renderEmploymentStatus();
}

function renderEmploymentStatus() {
  const employee = latestState?.employees.find(
    (item) => item.employeeId === employmentEmployee.value,
  );
  const current = document.querySelector("#employment-current-status");
  current.textContent = employee
    ? `${employee.status}${employee.missionMvp ? " // MISSION MVP" : ""}`
    : "SELECT EMPLOYEE";
  current.classList.toggle("mvp", Boolean(employee?.missionMvp));
  for (const id of [
    "employment-probation",
    "employment-active",
    "employment-mvp",
    "employment-mvp-clear",
  ]) {
    document.querySelector(`#${id}`).disabled = !employee;
  }
}

async function setEmploymentStatus(status) {
  if (!employmentEmployee.value) return;
  try {
    await request("/api/supervisor/mutate", {
      confirmation: "CONFIRM",
      command: {
        type: "SET_EMPLOYEE_STATUS",
        employeeId: employmentEmployee.value,
        status,
      },
    });
    employmentResult.textContent = `EMPLOYEE STATUS CHANGED TO ${status}.`;
  } catch (error) {
    employmentResult.textContent = `ERROR: ${error.message}`;
  }
}

async function setMissionMvp(enabled) {
  if (!employmentEmployee.value) return;
  try {
    await request("/api/supervisor/mutate", {
      confirmation: "CONFIRM",
      command: {
        type: "SET_EMPLOYEE_MISSION_MVP",
        employeeId: employmentEmployee.value,
        enabled,
      },
    });
    employmentResult.textContent = enabled
      ? "MISSION MVP DESIGNATION RECORDED. PREVIOUS DESIGNATION CLEARED."
      : "MISSION MVP DESIGNATION CLEARED.";
  } catch (error) {
    employmentResult.textContent = `ERROR: ${error.message}`;
  }
}

function renderAgentAccess() {
  const access = latestState?.agentAccess?.find(
    (item) => item.employeeId === agentAccessEmployee.value,
  );
  agentAccessStatus.textContent = access?.unlocked
    ? "UNLOCKED // IN BUILDING"
    : "LOCKED";
  agentAccessStatus.classList.toggle("unlocked", Boolean(access?.unlocked));
  const origin = agentAccessOrigin.value || location.origin;
  agentAccessUrl.value = access ? `${origin}${access.path}` : "";
  document.querySelector("#agent-force-logout").disabled = !access?.unlocked;
  const device = latestState?.deviceAccess?.find(
    (item) => item.employeeId === agentAccessEmployee.value,
  );
  document.querySelector("#approved-device").textContent =
    device?.approvedDeviceLabel ?? "NONE APPROVED";
  document.querySelector("#observed-device").textContent = device?.observed
    ? `${device.observed.label} // ${new Date(device.observed.observedAt).toLocaleString()}`
    : "NONE OBSERVED";
  document.querySelector("#observed-device-ip").textContent =
    device?.observed?.ip ?? "â€”";
  document.querySelector("#approve-agent-device").disabled = !device?.observed;
}

function renderReminders() {
  const employee = latestState?.employees.find(
    (item) => item.employeeId === reminderEmployee.value,
  );
  const reminders = employee?.reminders ?? [];
  reminderCount.textContent = employee
    ? `${reminders.length} ACTIVE`
    : "SELECT AN EMPLOYEE";
  reminderList.replaceChildren(
    ...reminders.map((reminder) => {
      const card = document.createElement("article");
      const text = document.createElement("span");
      text.textContent = reminder;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "REMOVE";
      remove.addEventListener(
        "click",
        () => void changeReminder("REMOVE_EMPLOYEE_REMINDER", reminder),
      );
      card.append(text, remove);
      return card;
    }),
  );
}

async function changeReminder(type, selectedReminder = reminderText.value) {
  if (!reminderEmployee.value || !selectedReminder.trim()) {
    reminderResult.textContent = "SELECT AN EMPLOYEE AND ENTER A REMINDER.";
    return;
  }
  try {
    const response = await fetch("/api/supervisor/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirmation: "CONFIRM",
        command: {
          type,
          employeeId: reminderEmployee.value,
          reminder: selectedReminder,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    reminderResult.textContent =
      type === "ADD_EMPLOYEE_REMINDER"
        ? "REMINDER ADDED."
        : "REMINDER REMOVED.";
    if (type === "ADD_EMPLOYEE_REMINDER") reminderText.value = "";
  } catch (error) {
    reminderResult.textContent = `ERROR: ${error.message}`;
  }
}

async function createEmployee() {
  const data = new FormData(newEmployeeForm);
  const employee = {
    name: requiredFormValue(data, "name"),
    department: requiredFormValue(data, "department"),
    role:
      optionalFormValue(data, "role") ??
      requiredFormValue(data, "competencyType"),
    status: requiredFormValue(data, "status"),
    clearance: Number(data.get("clearance")),
    demerits: Number(data.get("demerits")),
    commendations: Number(data.get("commendations")),
    anomalyDesignation:
      optionalFormValue(data, "anomalyDesignation") ?? "NONE ASSIGNED",
    nonHuman: data.has("nonHuman"),
    anomalousEmployee: data.has("anomalousEmployee"),
    realityCompromised: data.has("realityCompromised"),
    containmentRequired: data.has("containmentRequired"),
    anomalyDanger: Number(data.get("anomalyDanger")),
    loyalty: Number(data.get("loyalty")),
  };
  for (const field of [
    "pronouns",
    "birthday",
    "nextOfKin",
    "manager",
    "hireDate",
    "employmentType",
    "workLocation",
    "phoneExtension",
    "anomalyType",
    "competencyType",
    "realityType",
    "entityType",
    "dependant",
    "personnelNotes",
  ]) {
    const value = optionalFormValue(data, field);
    if (value !== undefined) employee[field] = value;
  }

  newEmployeeResult.textContent = "CREATING LOCAL EMPLOYEE RECORD...";
  try {
    const response = await fetch("/api/supervisor/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employee }),
    });
    const created = await response.json();
    if (!response.ok) throw new Error(created.error);
    result.textContent = `EMPLOYEE CREATED: ${created.employee.name} // ${created.employee.employeeId} // PAYROLL ${created.employee.payrollNumber} // BADGE ${created.uid}`;
    newEmployeeForm.reset();
    updateEmployeeNumberPreview();
    newEmployeeDialog.close();
  } catch (error) {
    newEmployeeResult.textContent = `ERROR: ${error.message}`;
  }
}

function updateEmployeeNumberPreview() {
  const codes = {
    PR: 1,
    "R&D": 2,
    Barista: 3,
    CEO: 4,
    Intern: 5,
    Gravedigger: 6,
    Reception: 7,
    Hotline: 8,
    Clown: 9,
  };
  const data = new FormData(newEmployeeForm);
  employeeNumberPreview.textContent = `TA${codes[data.get("competencyType")] ?? "?"}${data.get("anomalyDanger") || "?"}${data.has("nonHuman") ? 0 : 1}${data.get("loyalty") || "?"}`;
}

function requiredFormValue(data, field) {
  return String(data.get(field) ?? "").trim();
}

function optionalFormValue(data, field) {
  const value = requiredFormValue(data, field);
  return value || undefined;
}

function renderAssignedPlaywall() {
  const employee = latestState?.employees.find(
    (item) => item.employeeId === playwallEmployee.value,
  );
  const contentById = new Map(
    (latestState?.content ?? []).map((item) => [item.id, item]),
  );
  const assigned = employee?.playwallDocuments ?? [];
  const seen = new Set(employee?.seenPlaywallDocuments ?? []);
  playwallCount.textContent = employee
    ? `${assigned.length} ASSIGNED`
    : "SELECT AN EMPLOYEE";
  playwallAssigned.replaceChildren(
    ...assigned.map((contentId) => {
      const content = contentById.get(contentId);
      const card = document.createElement("article");
      const code = document.createElement("strong");
      code.textContent = playwallDesignation(contentId);
      const title = document.createElement("span");
      title.textContent = `${content?.title ?? contentId} — ${seen.has(contentId) ? "VIEWED" : "NEW"}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "REMOVE";
      remove.addEventListener(
        "click",
        () => void changePlaywallAccess("REVOKE_PLAYWALL_DOCUMENT", contentId),
      );
      card.append(code, title, remove);
      return card;
    }),
  );
}

async function changePlaywallAccess(
  type,
  selectedContentId = playwallDocument.value,
) {
  if (!playwallEmployee.value || !selectedContentId) {
    playwallResult.textContent = "SELECT AN EMPLOYEE AND DOCUMENT.";
    return;
  }
  try {
    const response = await fetch("/api/supervisor/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirmation: "CONFIRM",
        command: {
          type,
          employeeId: playwallEmployee.value,
          contentId: selectedContentId,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    playwallResult.textContent =
      type === "GRANT_PLAYWALL_DOCUMENT"
        ? "DOCUMENT ADDED."
        : "DOCUMENT REMOVED.";
  } catch (error) {
    playwallResult.textContent = `ERROR: ${error.message}`;
  }
}

function playwallDesignation(contentId) {
  return contentId
    .replace(/^playwall-(agency|anomaly|reality)-/, "")
    .toUpperCase();
}

function playwallColour(contentId) {
  if (contentId.includes("-anomaly-")) return "BLUE";
  if (contentId.includes("-reality-")) return "YELLOW";
  return "RED";
}

async function applyMutation() {
  const command = { type: fields.action.value };
  if (fields["employee-id"].value)
    command.employeeId = fields["employee-id"].value;
  if (fields["resource-id"].value)
    command.resourceId = fields["resource-id"].value;
  if (fields["content-id"].value)
    command.contentId = fields["content-id"].value;
  if (fields.flag.value) command.flag = fields.flag.value;
  command.permission = fields.permission.value;
  const value = parseValue(fields.value.value);
  if (command.type === "SET_FLAG") command.value = value;
  if (command.type.includes("CLEARANCE")) command.clearance = Number(value);
  if (command.type === "SET_EMPLOYEE_STATUS") command.status = String(value);
  if (command.type === "SET_EMPLOYEE_LOYALTY") command.loyalty = Number(value);
  if (command.type === "SET_RESOURCE_ENABLED") command.enabled = value;
  await request("/api/supervisor/mutate", {
    command,
    confirmation: fields.confirmation.value,
  });
}

async function operation(url, confirmation) {
  await request(url, { confirmation });
}

async function request(url, body) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    result.textContent = data.filename
      ? `EXPORTED: ${data.filename}`
      : data.backup
        ? `RESET COMPLETE — BACKUP: ${data.backup}`
        : "OPERATION COMPLETE";
  } catch (error) {
    result.textContent = `ERROR: ${error.message}`;
  }
}

function renderEffects(effects) {
  const panel = document.querySelector("#effects");
  const body = document.querySelector("#effect-body");
  body.replaceChildren();
  for (const effect of effects) {
    const heading = document.createElement("h3");
    heading.textContent = effect.content.title;
    body.append(heading);
    for (const line of effect.content.body ?? []) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      body.append(paragraph);
    }
  }
  panel.hidden = effects.length === 0;
}

function replaceOptions(select, entries, emptyLabel = "—") {
  const selected = select.value;
  select.replaceChildren(
    new Option(emptyLabel, ""),
    ...entries.map(([value, label]) => new Option(label, value)),
  );
  select.value = entries.some(([value]) => value === selected) ? selected : "";
}

function parseValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function installRedThreeTreatment() {
  const ignored = "script, style, textarea, input, option, .digit-three";
  const processText = (node) => {
    if (!node.data.includes("3") || node.parentElement?.closest(ignored))
      return;
    const fragment = document.createDocumentFragment();
    for (const part of node.data.split(/(3)/)) {
      if (!part) continue;
      if (part === "3") {
        const digit = document.createElement("span");
        digit.className = "digit-three";
        digit.textContent = part;
        fragment.append(digit);
      } else fragment.append(document.createTextNode(part));
    }
    node.replaceWith(fragment);
  };
  const process = (root) => {
    if (root.nodeType === Node.TEXT_NODE) return processText(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processText);
  };
  process(document.body);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") process(mutation.target);
      else mutation.addedNodes.forEach(process);
    }
  }).observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

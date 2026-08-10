import { InteractionEffectQueue } from "./InteractionEffectQueue.js";

const socket = io();
const statusElement = document.querySelector("#status");
const instructionElement = document.querySelector("#instruction");
const badgeElement = document.querySelector("#badge");
const uidElement = document.querySelector("#uid");
const employeeElement = document.querySelector("#employee");
const employeeNameElement = document.querySelector("#employee-name");
const employeeIdElement = document.querySelector("#employee-id");
const employeeDepartmentElement = document.querySelector(
  "#employee-department",
);
const employeeClearanceElement = document.querySelector("#employee-clearance");
const employeeStatusElement = document.querySelector("#employee-status");
const unknownElement = document.querySelector("#unknown");
const noResourceElement = document.querySelector("#no-resource");
const accessResultElement = document.querySelector("#access-result");
const accessResourceElement = document.querySelector("#access-resource");
const accessReasonLabelElement = document.querySelector("#access-reason-label");
const accessReasonElement = document.querySelector("#access-reason");
const accessLevelsElement = document.querySelector("#access-levels");
const accessClearanceElement = document.querySelector("#access-clearance");
const accessMessageElement = document.querySelector("#access-message");
const personnelRecords = document.querySelector("#personnel-records");
const personnelRecordsStatus = document.querySelector(
  "#personnel-records-status",
);
const personnelRecordsList = document.querySelector("#personnel-records-list");
const personnelNotification = document.querySelector("#personnel-notification");
const personnelNotificationDetail = document.querySelector(
  "#personnel-notification-detail",
);
const containmentVault = document.querySelector("#containment-vault");
const containmentVaultStatus = document.querySelector(
  "#containment-vault-status",
);
const containmentVaultOpen = document.querySelector("#containment-vault-open");
const containmentNotification = document.querySelector(
  "#containment-notification",
);
const containmentNotificationDetail = document.querySelector(
  "#containment-notification-detail",
);
const breakRoomNotification = document.querySelector(
  "#break-room-notification",
);
const breakRoom = document.querySelector("#break-room");
const breakRoomStatus = document.querySelector("#break-room-status");
const whileYouWereOut = document.querySelector("#while-you-were-out");
const breakRoomTo = document.querySelector("#break-room-to");
const breakRoomFrom = document.querySelector("#break-room-from");
const breakRoomDate = document.querySelector("#break-room-date");
const breakRoomTime = document.querySelector("#break-room-time");
const breakRoomPhone = document.querySelector("#break-room-phone");
const breakRoomUrgent = document.querySelector("#break-room-urgent");
const breakRoomContactChecks = document.querySelectorAll("[data-contact]");
const breakRoomMessageImage = document.querySelector(
  "#break-room-message-image",
);
const breakRoomCounter = document.querySelector("#break-room-counter");
const breakRoomPrevious = document.querySelector("#break-room-previous");
const breakRoomNext = document.querySelector("#break-room-next");
const blueConfirmBlackout = document.querySelector("#blue-confirm-blackout");
const resourceSelect = document.querySelector("#resource-select");
const clearResourceButton = document.querySelector("#clear-resource");
const resourceDetails = document.querySelector("#resource-details");
const resourceName = document.querySelector("#resource-name");
const resourceDescription = document.querySelector("#resource-description");
const resourceClearance = document.querySelector("#resource-clearance");
const resourceDepartments = document.querySelector("#resource-departments");
const resourceStatuses = document.querySelector("#resource-statuses");
const resourceEnabled = document.querySelector("#resource-enabled");
const contentViewer = document.querySelector("#content-viewer");
const contentClassification = document.querySelector("#content-classification");
const contentCounter = document.querySelector("#content-counter");
const contentTitle = document.querySelector("#content-title");
const contentBody = document.querySelector("#content-body");
const contentImage = document.querySelector("#content-image");
const contentMediaError = document.querySelector("#content-media-error");
const contentAcknowledge = document.querySelector("#content-acknowledge");
const contentReturn = document.querySelector("#content-return");
const connectionElement = document.querySelector("#connection");
const eventsElement = document.querySelector("#events");
const audioButton = document.querySelector("#enable-audio");
const testModeButton = document.querySelector("#test-mode-toggle");
const testModeReveal = document.querySelector("#test-mode-reveal");
const testPanel = document.querySelector("#test-panel");
const testUidInput = document.querySelector("#test-uid");
const presentTestBadgeButton = document.querySelector("#present-test-badge");
const removeTestBadgeButton = document.querySelector("#remove-test-badge");

let audioContext;
let availableResources = [];
let selectedResource = null;
let activeInteractionId = null;
let interactionEffects = [];
let currentEffectIndex = -1;
let currentPersonnelRecords = [];
let currentContainmentRecords = [];
let activeContainmentRecord = null;
let currentBreakRoomMessages = [];
let currentBreakRoomIndex = 0;
const notifiedContent = new Set();
const effectQueue = new InteractionEffectQueue();

installRedThreeTreatment();

for (const eventName of ["pointerdown", "keydown"]) {
  window.addEventListener(eventName, activateDefaultAudio, { once: true });
}

testModeReveal.addEventListener("click", () => {
  testModeButton.hidden = false;
  testModeButton.focus();
});

async function activateDefaultAudio() {
  if (audioButton.getAttribute("aria-pressed") !== "true") return;
  try {
    audioContext ||= new AudioContext();
    await audioContext.resume();
  } catch {
    setAudioButton(false);
    addEvent("Browser audio requires manual enabling");
  }
}

resourceSelect.addEventListener(
  "change",
  () => void requestResource(resourceSelect.value),
);
clearResourceButton.addEventListener("click", () => void requestResource(null));
contentAcknowledge.addEventListener("click", handleContentAcknowledge);
contentReturn.addEventListener("click", hideContentViewer);
containmentVaultOpen.addEventListener("click", openAvailableContainmentRecord);
breakRoomPrevious.addEventListener("click", () => showBreakRoomMessage(-1));
breakRoomNext.addEventListener("click", () => showBreakRoomMessage(1));

testModeButton.addEventListener("click", async () => {
  const enabled = testModeButton.getAttribute("aria-pressed") !== "true";
  try {
    await postJson("/__test-mode", { enabled });
    setTestMode(enabled);
    addEvent(`Test mode ${enabled ? "enabled" : "disabled"}`);
  } catch (error) {
    addEvent(`ERROR: ${error.message}`);
  }
});

presentTestBadgeButton.addEventListener("click", async () => {
  try {
    await postJson("/__simulate", { uid: testUidInput.value });
  } catch (error) {
    addEvent(`ERROR: ${error.message}`);
  }
});

testUidInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") presentTestBadgeButton.click();
});

removeTestBadgeButton.addEventListener("click", async () => {
  try {
    await postJson("/__simulate/remove", {});
  } catch (error) {
    addEvent(`ERROR: ${error.message}`);
  }
});

audioButton.addEventListener("click", async () => {
  const audioEnabled = audioButton.getAttribute("aria-pressed") === "true";
  try {
    if (audioEnabled) {
      await audioContext?.suspend();
      setAudioButton(false);
      addEvent("Browser audio disabled");
      return;
    }

    audioContext ||= new AudioContext();
    await audioContext.resume();
    setAudioButton(true);
    addEvent("Browser audio enabled");
  } catch {
    setAudioButton(false);
    addEvent("ERROR: Browser audio setting could not be changed");
  }
});

socket.on(
  "terminal-state",
  ({
    connected,
    readers,
    badge,
    testMode,
    resources,
    selectedResource: selected,
  }) => {
    setResources(resources, selected);
    updateReader(connected, readers);
    setTestMode(testMode);
    if (badge?.access) showAccessResult(badge.access);
    else if (badge?.employee) {
      showKnownEmployee(badge);
      void loadContainmentVault();
    } else if (badge) showUnknownBadge(badge);
  },
);

socket.on("test-mode-status", ({ enabled }) => setTestMode(enabled));
socket.on("resource-selected", ({ resource }) => setSelectedResource(resource));

socket.on("reader-status", ({ connected, readers }) => {
  updateReader(connected, readers);
  addEvent(
    connected ? `Reader connected: ${readers.at(-1)}` : "Reader disconnected",
  );
  if (!connected && !uidElement.textContent) showWaitingState();
});

socket.on("badge-scanned", () => {
  // Preserved as the low-level scan event; identification events drive the UI.
  cancelInteractionEffects();
  hidePersonnelNotification();
  hideContainmentVault();
  hideContainmentNotification();
  hideBreakRoom();
  hideBreakRoomNotification();
});
socket.on("personnel-records-notification", ({ count, designations }) => {
  showPersonnelNotification(count, designations);
});
socket.on("containment-vault-available", ({ count }) => {
  if (count > 0) void loadContainmentVault();
  else hideContainmentVault();
});
socket.on("containment-vault-notification", ({ count, designations }) => {
  showContainmentNotification(count, designations);
});
socket.on("break-room-notification", ({ count }) => {
  if (count > 0) showBreakRoomNotification();
  else hideBreakRoomNotification();
});

socket.on("employee-identified", (result) => {
  if (selectedResource) return;
  showKnownEmployee(result);
  playKnownTone();
  addEvent(
    `${result.simulated ? "SIMULATED: " : ""}${result.employee.name} identified`,
  );
});

socket.on("employee-unknown", (result) => {
  if (selectedResource) return;
  showUnknownBadge(result);
  playUnknownTone();
  addEvent(
    `${result.simulated ? "SIMULATED: " : ""}Unregistered credential ${result.uid}`,
  );
});

socket.on("access-evaluated", (result) => {
  showAccessResult(result);
  if (!result.employee) playUnknownTone();
  else if (result.decision.granted) playGrantedTone();
  else playDeniedTone();
  const subject = result.employee?.name ?? "Unknown credential";
  addEvent(
    `${result.simulated ? "SIMULATED: " : ""}${subject} requested ${result.resource.name}: ${result.decision.granted ? "GRANTED" : "DENIED"}`,
  );
});

socket.on("interaction-result", (result) => scheduleInteractionEffects(result));
socket.on("additional-effects", ({ interactionId, effects }) => {
  if (interactionId !== activeInteractionId) return;
  appendInteractionEffects(effects);
});
socket.on("playwall-access-updated", () => {
  if (!personnelRecords.hidden) void loadPersonnelRecords();
  if (!containmentVault.hidden) void loadContainmentVault();
  if (!breakRoom.hidden) void loadBreakRoomMessages();
});

socket.on("badge-removed", () => {
  cancelInteractionEffects();
  addEvent("Badge removed");
});
socket.on("display-reset", showWaitingState);
socket.on("terminal-error", ({ message }) => {
  addEvent(`ERROR: ${message}`);
  playErrorTone();
});
socket.on("disconnect", () => addEvent("Connection to local terminal lost"));

function updateReader(connected, readers = []) {
  connectionElement.textContent = connected
    ? `● READER ONLINE — ${readers.join(", ")}`
    : "● READER OFFLINE";
  connectionElement.classList.toggle("offline", !connected);
  if (!uidElement.textContent) showWaitingState();
}

function showWaitingState() {
  hideContentViewer();
  hidePersonnelRecords();
  hidePersonnelNotification();
  hideContainmentVault();
  hideContainmentNotification();
  hideBreakRoom();
  hideBreakRoomNotification();
  statusElement.textContent = selectedResource
    ? "PRESENT IDENTIFICATION"
    : "SELECT AUTHORISED DESTINATION";
  instructionElement.textContent = selectedResource
    ? `Requested resource: ${selectedResource.name}. Place badge against the reader.`
    : "No resource selected.";
  instructionElement.hidden = false;
  badgeElement.hidden = true;
  employeeElement.hidden = true;
  unknownElement.hidden = true;
  noResourceElement.hidden = true;
  accessResultElement.hidden = true;
  uidElement.textContent = "";
}

function showKnownEmployee({
  employee,
  unresolvedFiles = [],
  realityMessageCount = 0,
}) {
  hidePersonnelRecords();
  statusElement.textContent = "IDENTIFICATION ACCEPTED";
  instructionElement.hidden = true;
  badgeElement.hidden = true;
  unknownElement.hidden = true;
  accessResultElement.hidden = true;
  employeeNameElement.textContent = employee.name.toUpperCase();
  employeeIdElement.textContent =
    employee.employeeNumber ?? employee.employeeId;
  employeeDepartmentElement.textContent = employee.department.toUpperCase();
  employeeClearanceElement.textContent = `LEVEL ${employee.clearance}`;
  employeeStatusElement.textContent = employee.status.toUpperCase();
  employeeElement.hidden = false;
  noResourceElement.hidden = Boolean(selectedResource);
  if (
    realityMessageCount > 0 ||
    unresolvedFiles.some((file) => file.category === "reality")
  ) {
    showBreakRoomNotification();
  }
}

function showUnknownBadge({ uid }) {
  hidePersonnelRecords();
  statusElement.textContent = "IDENTIFICATION NOT RECOGNISED";
  instructionElement.hidden = true;
  employeeElement.hidden = true;
  uidElement.textContent = uid;
  badgeElement.hidden = false;
  unknownElement.hidden = false;
  accessResultElement.hidden = true;
  noResourceElement.hidden = Boolean(selectedResource);
}

function showAccessResult(result) {
  if (result.employee) showKnownEmployee(result);
  else showUnknownBadge(result);
  statusElement.textContent = result.decision.granted
    ? "ACCESS GRANTED"
    : "ACCESS DENIED";
  noResourceElement.hidden = true;
  accessResourceElement.textContent = result.resource.name.toUpperCase();
  accessReasonLabelElement.textContent = result.decision.granted
    ? "CLEARANCE VERIFIED"
    : "REASON";
  accessReasonElement.textContent = result.decision.reasonCode.replaceAll(
    "_",
    " ",
  );
  accessLevelsElement.hidden = !result.employee;
  accessClearanceElement.textContent = result.employee
    ? `LEVEL ${result.resource.minimumClearance} / LEVEL ${result.employee.clearance}`
    : "";
  accessMessageElement.textContent = result.decision.granted
    ? "Proceed promptly. Loitering is considered voluntary overtime."
    : `${result.decision.message} This decision has already been reviewed.`;
  accessResultElement.hidden = false;
  if (result.decision.granted && result.resource.id === "personnel-records") {
    void loadPersonnelRecords();
  }
  if (result.decision.granted && result.resource.id === "break-room") {
    void loadBreakRoomMessages();
  }
}

async function loadPersonnelRecords() {
  personnelRecords.hidden = false;
  personnelRecordsStatus.textContent = "RETRIEVING UNLOCKED RECORDS...";
  personnelRecordsList.replaceChildren();
  try {
    const response = await fetch("/api/personnel-records");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    currentPersonnelRecords = result.records;
    if (result.records.length === 0) {
      personnelRecordsStatus.textContent =
        "NO PLAYWALL RECORDS HAVE BEEN RELEASED.";
      return;
    }
    personnelRecordsStatus.textContent = `${result.records.length} RELEASED RECORD${result.records.length === 1 ? "" : "S"}`;
    for (const record of result.records) {
      const designation = record.id
        .replace("playwall-agency-", "")
        .toUpperCase();
      const button = document.createElement("button");
      const code = document.createElement("strong");
      code.textContent = designation;
      const title = document.createElement("span");
      title.textContent = `${record.seen ? "" : "NEW — "}${record.title}`;
      button.append(code, title);
      button.addEventListener("click", () =>
        openPersonnelRecord(record, designation),
      );
      personnelRecordsList.append(button);
    }
  } catch (error) {
    personnelRecordsStatus.textContent = `RECORD INDEX UNAVAILABLE: ${error.message}`;
  }
}

function hidePersonnelRecords() {
  personnelRecords.hidden = true;
  personnelRecordsList.replaceChildren();
  currentPersonnelRecords = [];
}

function openPersonnelRecord(record, designation) {
  interactionEffects = [];
  currentEffectIndex = -1;
  renderContentEffect(record, {
    notify: false,
    counter: `PERSONNEL RECORD ${designation}`,
  });
  if (!record.seen) void markPersonnelRecordSeen(record);
}

async function markPersonnelRecordSeen(record) {
  try {
    await postJson("/api/personnel-records/viewed", { contentId: record.id });
    record.seen = true;
    const unseen = currentPersonnelRecords.filter((item) => !item.seen);
    if (unseen.length === 0) hidePersonnelNotification();
    else {
      showPersonnelNotification(
        unseen.length,
        unseen.map((item) =>
          item.id.replace("playwall-agency-", "").toUpperCase(),
        ),
      );
    }
    void loadPersonnelRecords();
  } catch (error) {
    addEvent(
      `ERROR: Could not mark Personnel Record as viewed: ${error.message}`,
    );
  }
}

function showPersonnelNotification(count, designations) {
  personnelNotificationDetail.textContent = `${count} UNREAD FILE${count === 1 ? "" : "S"}: ${designations.join(", ")}`;
  personnelNotification.hidden = false;
}

function hidePersonnelNotification() {
  personnelNotification.hidden = true;
  personnelNotificationDetail.textContent = "";
}

async function loadContainmentVault() {
  try {
    const response = await fetch("/api/containment-vault");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    currentContainmentRecords = result.records;
    if (result.records.length === 0) {
      hideContainmentVault();
      return;
    }
    containmentVaultStatus.textContent = `${result.records.length} SIGNAL${result.records.length === 1 ? "" : "S"}`;
    containmentVault.hidden = false;
    document.body.classList.add("blue-file-present");
  } catch (error) {
    containmentVaultStatus.textContent = `VAULT INDEX CORRUPTED: ${error.message}`;
    containmentVault.hidden = false;
  }
}

function hideContainmentVault() {
  containmentVault.hidden = true;
  currentContainmentRecords = [];
  activeContainmentRecord = null;
  document.body.classList.remove("blue-file-present");
}

function openAvailableContainmentRecord() {
  const record = currentContainmentRecords[0];
  if (!record) return;
  const designation = record.id.replace("playwall-anomaly-", "").toUpperCase();
  playStaticBurst(0.8);
  interactionEffects = [];
  currentEffectIndex = -1;
  activeContainmentRecord = record;
  renderContentEffect(record, {
    notify: false,
    counter: `CONTAINMENT FILE ${designation}`,
  });
}

async function confirmContainmentRecord() {
  const record = activeContainmentRecord;
  if (!record) return;
  try {
    await postJson("/api/containment-vault/viewed", { contentId: record.id });
    record.seen = true;
    activeContainmentRecord = null;
    hideContentViewer();
    hideContainmentNotification();
    hideContainmentVault();
    playBlueConfirmationFailure();
    blueConfirmBlackout.hidden = false;
    setTimeout(() => {
      blueConfirmBlackout.hidden = true;
      void loadContainmentVault();
    }, 1000);
  } catch (error) {
    addEvent(
      `ERROR: Could not mark Containment file as viewed: ${error.message}`,
    );
  }
}

function handleContentAcknowledge() {
  if (activeContainmentRecord) {
    void confirmContainmentRecord();
    return;
  }
  showNextEffect();
}

function showContainmentNotification(count, designations) {
  containmentNotificationDetail.textContent = `${count} UNREAD FILE${count === 1 ? "" : "S"}: ${designations.join(", ")}`;
  containmentNotification.hidden = false;
  containmentNotification.classList.remove("is-glitching");
  requestAnimationFrame(() =>
    containmentNotification.classList.add("is-glitching"),
  );
  playStaticBurst(0.55);
}

function hideContainmentNotification() {
  containmentNotification.hidden = true;
  containmentNotification.classList.remove("is-glitching");
  containmentNotificationDetail.textContent = "";
}

function showBreakRoomNotification() {
  breakRoomNotification.hidden = false;
}

function hideBreakRoomNotification() {
  breakRoomNotification.hidden = true;
}

async function loadBreakRoomMessages() {
  breakRoom.hidden = false;
  whileYouWereOut.hidden = true;
  breakRoomStatus.textContent = "CHECKING THE COMPANY MESSAGE HOOK...";
  try {
    const response = await fetch("/api/break-room-messages");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    currentBreakRoomMessages = result.messages;
    if (result.messages.length === 0) {
      breakRoomStatus.textContent = "NO PERSONAL MESSAGES ARE WAITING.";
      return;
    }
    currentBreakRoomIndex = Math.max(
      0,
      result.messages.findIndex((message) => !message.seen),
    );
    breakRoomTo.textContent = employeeNameElement.textContent;
    breakRoomFrom.textContent = result.dependant;
    const now = new Date();
    breakRoomDate.textContent = now.toLocaleDateString();
    breakRoomTime.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    breakRoomPhone.textContent = result.dependantContact.phone ?? "NOT GIVEN";
    breakRoomUrgent.checked = result.dependantContact.urgent;
    const selectedMethods = new Set(result.dependantContact.methods);
    for (const checkbox of breakRoomContactChecks) {
      checkbox.checked = selectedMethods.has(checkbox.dataset.contact);
    }
    breakRoomStatus.textContent = `${result.messages.length} PERSONAL MESSAGE${result.messages.length === 1 ? "" : "S"} ON THE HOOK.`;
    whileYouWereOut.hidden = false;
    renderBreakRoomMessage();
  } catch (error) {
    breakRoomStatus.textContent = `MESSAGE HOOK UNAVAILABLE: ${error.message}`;
  }
}

function hideBreakRoom() {
  breakRoom.hidden = true;
  whileYouWereOut.hidden = true;
  breakRoomMessageImage.removeAttribute("src");
  currentBreakRoomMessages = [];
  currentBreakRoomIndex = 0;
}

function showBreakRoomMessage(direction) {
  if (currentBreakRoomMessages.length < 2) return;
  currentBreakRoomIndex =
    (currentBreakRoomIndex + direction + currentBreakRoomMessages.length) %
    currentBreakRoomMessages.length;
  renderBreakRoomMessage();
}

function renderBreakRoomMessage() {
  const message = currentBreakRoomMessages[currentBreakRoomIndex];
  if (!message) return;
  const designation = message.id.replace("playwall-reality-", "").toUpperCase();
  breakRoomCounter.textContent = `${designation} // ${currentBreakRoomIndex + 1} OF ${currentBreakRoomMessages.length}`;
  breakRoomPrevious.disabled = currentBreakRoomMessages.length < 2;
  breakRoomNext.disabled = currentBreakRoomMessages.length < 2;
  breakRoomMessageImage.alt = message.alt;
  breakRoomMessageImage.onload = () => {
    if (!message.seen) void markBreakRoomMessageSeen(message);
  };
  breakRoomMessageImage.src = `/content-assets/${encodeURIComponent(message.id)}`;
}

async function markBreakRoomMessageSeen(message) {
  try {
    await postJson("/api/break-room-messages/viewed", {
      contentId: message.id,
    });
    message.seen = true;
    if (currentBreakRoomMessages.every((item) => item.seen)) {
      hideBreakRoomNotification();
    }
  } catch (error) {
    addEvent(
      `ERROR: Could not mark personal message as viewed: ${error.message}`,
    );
  }
}

function canPlayAudio() {
  return (
    audioButton.getAttribute("aria-pressed") === "true" &&
    audioContext &&
    audioContext.state === "running"
  );
}

function playStaticBurst(duration) {
  if (!canPlayAudio()) return;
  const start = audioContext.currentTime;
  const frames = Math.ceil(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    const crackle = Math.random() > 0.985 ? 1.7 : 0.55;
    channel[index] = (Math.random() * 2 - 1) * crackle;
  }
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 1850;
  filter.Q.value = 0.65;
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(0.075, start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(gain).connect(audioContext.destination);
  source.start(start);
}

function playKnownTone() {
  if (!canPlayAudio()) return;
  const start = audioContext.currentTime;

  // A deliberately over-produced corporate success ident: major arpeggio,
  // resolving chord, and an optimistic synthetic sparkle.
  playTone(523.25, start, 0.16, 0.055, "triangle");
  playTone(659.25, start + 0.1, 0.18, 0.05, "triangle");
  playTone(783.99, start + 0.2, 0.3, 0.048, "triangle");
  playTone(1046.5, start + 0.31, 0.28, 0.028, "sine");

  playTone(523.25, start + 0.29, 0.34, 0.018, "sine");
  playTone(659.25, start + 0.29, 0.34, 0.016, "sine");
  playTone(783.99, start + 0.29, 0.34, 0.014, "sine");
}

function playUnknownTone() {
  if (!canPlayAudio()) return;
  const start = audioContext.currentTime;
  playTone(220, start, 0.2, 0.045, "square");
  playTone(174.61, start + 0.24, 0.32, 0.04, "square");
}

function playGrantedTone() {
  if (!canPlayAudio()) return;
  const start = audioContext.currentTime;
  playTone(523.25, start, 0.18, 0.045, "triangle");
  playTone(783.99, start + 0.14, 0.28, 0.045, "triangle");
}

function playDeniedTone() {
  if (!canPlayAudio()) return;
  const start = audioContext.currentTime;
  playTone(293.66, start, 0.18, 0.04, "square");
  playTone(196, start + 0.2, 0.3, 0.04, "square");
}

function playErrorTone() {
  if (!canPlayAudio()) return;
  playTone(246.94, audioContext.currentTime, 0.22, 0.018, "sine");
}

function playBlueConfirmationFailure() {
  if (!canPlayAudio()) return;
  const start = audioContext.currentTime;
  playTone(880, start, 0.12, 0.055, "square");
  playTone(330, start + 0.13, 0.18, 0.06, "sawtooth");
  playTone(110, start + 0.29, 0.42, 0.05, "square");
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

function scheduleInteractionEffects(result) {
  cancelInteractionEffects();
  activeInteractionId = result.interactionId;
  effectQueue.begin(result.interactionId);
  appendInteractionEffects(result.effects);
}

function appendInteractionEffects(effects) {
  const startingIndex = interactionEffects.length;
  interactionEffects.push(
    ...effects.filter((effect) =>
      ["DISPLAY_CONTENT", "DISPLAY_MESSAGE", "PLAY_AUDIO"].includes(
        effect.type,
      ),
    ),
  );
  for (
    let index = startingIndex;
    index < interactionEffects.length;
    index += 1
  ) {
    const effect = interactionEffects[index];
    effectQueue.schedule(effect, () => {
      if (!activeInteractionId) return;
      if (effect.type === "PLAY_AUDIO") {
        playTriggeredAudio(effect.content);
      } else if (currentEffectIndex === -1 || effect.delayMs > 0) {
        currentEffectIndex = index;
        renderContentEffect(effect.content);
      }
    });
  }
}

function renderContentEffect(content, { notify = true, counter = null } = {}) {
  contentViewer.hidden = false;
  const isAnomaly = content.id?.startsWith("playwall-anomaly-") === true;
  contentViewer.classList.toggle("anomaly-content", isAnomaly);
  contentClassification.textContent =
    content.classification ?? content.type.toUpperCase();
  contentCounter.textContent =
    counter ?? `${currentEffectIndex + 1} / ${interactionEffects.length}`;
  contentTitle.textContent = content.title;
  if (
    notify &&
    content.id &&
    !notifiedContent.has(`${activeInteractionId}:${content.id}`)
  ) {
    notifiedContent.add(`${activeInteractionId}:${content.id}`);
    void postJson("/api/content-opened", {
      interactionId: activeInteractionId,
      contentId: content.id,
    }).catch(() => {});
  }
  contentBody.replaceChildren();
  contentImage.hidden = true;
  contentImage.removeAttribute("src");
  contentMediaError.hidden = true;
  if (Array.isArray(content.body)) {
    for (const paragraph of content.body) {
      const element = document.createElement("p");
      element.textContent = paragraph;
      contentBody.append(element);
    }
  }
  if (content.type === "image") {
    contentImage.alt = content.alt;
    contentImage.src = content.assetUrl;
    contentImage.hidden = false;
    contentImage.onerror = () => {
      contentImage.hidden = true;
      contentMediaError.textContent = `IMAGE UNAVAILABLE — ${content.alt}`;
      contentMediaError.hidden = false;
    };
  }
  contentAcknowledge.textContent = isAnomaly
    ? "CONFIRM"
    : hasLaterDisplayEffect()
      ? "ACKNOWLEDGE / NEXT"
      : "ACKNOWLEDGE";
}

function showNextEffect() {
  const nextIndex = interactionEffects.findIndex(
    (effect, index) =>
      index > currentEffectIndex && effect.type !== "PLAY_AUDIO",
  );
  if (nextIndex === -1) {
    hideContentViewer();
    return;
  }
  currentEffectIndex = nextIndex;
  renderContentEffect(interactionEffects[nextIndex].content);
}

function hasLaterDisplayEffect() {
  return interactionEffects.some(
    (effect, index) =>
      index > currentEffectIndex && effect.type !== "PLAY_AUDIO",
  );
}

function playTriggeredAudio(content) {
  if (!canPlayAudio()) return;
  const audio = new Audio(content.assetUrl);
  audio.volume = 0.35;
  audio
    .play()
    .catch(() =>
      addEvent(`ERROR: Audio content "${content.title}" could not be played`),
    );
}

function hideContentViewer() {
  contentViewer.hidden = true;
  contentViewer.classList.remove("anomaly-content");
  contentBody.replaceChildren();
  contentImage.removeAttribute("src");
  activeContainmentRecord = null;
}

function cancelInteractionEffects() {
  effectQueue.cancel();
  interactionEffects = [];
  currentEffectIndex = -1;
  activeInteractionId = null;
  hideContentViewer();
}

function playTone(frequency, start, duration, volume, type) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function setAudioButton(enabled) {
  audioButton.setAttribute("aria-pressed", String(enabled));
  audioButton.textContent = enabled ? "DISABLE AUDIO" : "ENABLE AUDIO";
  audioButton.classList.toggle("enabled", enabled);
}

function setTestMode(enabled) {
  testModeButton.setAttribute("aria-pressed", String(enabled));
  testModeButton.textContent = enabled
    ? "DISABLE TEST MODE"
    : "ENABLE TEST MODE";
  testModeButton.classList.toggle("enabled", enabled);
  testPanel.hidden = !enabled;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Local test request failed");
  return result;
}

function setResources(resources, selected) {
  availableResources = resources;
  resourceSelect.replaceChildren(new Option("NO RESOURCE SELECTED", ""));
  for (const resource of resources) {
    const suffix = resource.enabled ? "" : " — DISABLED";
    resourceSelect.add(
      new Option(`${resource.name.toUpperCase()}${suffix}`, resource.id),
    );
  }
  setSelectedResource(selected);
}

function setSelectedResource(resource) {
  selectedResource = resource;
  resourceSelect.value = resource?.id ?? "";
  resourceDetails.hidden = !resource;
  if (resource) {
    resourceName.textContent = resource.name.toUpperCase();
    resourceDescription.textContent = resource.description;
    resourceClearance.textContent = `LEVEL ${resource.minimumClearance}`;
    resourceDepartments.textContent = resource.allowedDepartments.length
      ? resource.allowedDepartments.join(", ").toUpperCase()
      : "ALL DEPARTMENTS";
    resourceStatuses.textContent = resource.allowedStatuses.join(", ");
    resourceEnabled.textContent = resource.enabled ? "ENABLED" : "DISABLED";
  }
  if (!uidElement.textContent && employeeElement.hidden) showWaitingState();
}

async function requestResource(resourceId) {
  try {
    await postJson("/__resource-selection", { resourceId });
    const name = availableResources.find(
      (resource) => resource.id === resourceId,
    )?.name;
    addEvent(name ? `Destination selected: ${name}` : "Destination cleared");
  } catch (error) {
    addEvent(`ERROR: ${error.message}`);
  }
}

function addEvent(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  eventsElement.prepend(item);
  while (eventsElement.children.length > 5)
    eventsElement.lastElementChild.remove();
}

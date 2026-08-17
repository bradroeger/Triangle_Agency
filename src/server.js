import http from "node:http";
import { networkInterfaces } from "node:os";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server as SocketServer } from "socket.io";
import { AccessLogger } from "./access/AccessLogger.js";
import { CampaignEventLogger } from "./access/CampaignEventLogger.js";
import { TerminalApplication } from "./application/TerminalApplication.js";
import { ContentRegistry } from "./content/ContentRegistry.js";
import { EmployeeRegistry } from "./employees/EmployeeRegistry.js";
import {
  buildEmployeeNumber,
  generateBadgeUid,
  generatePayrollNumber,
} from "./employees/employeeIdentifiers.js";
import { NfcService } from "./nfc/NfcService.js";
import { GMMessageRegistry } from "./messages/GMMessageRegistry.js";
import { normalizeUid } from "./nfc/uid.js";
import { ResourceRegistry } from "./resources/ResourceRegistry.js";
import { StateStore } from "./state/StateStore.js";
import { TriggerEngine } from "./triggers/TriggerEngine.js";

let employeeRegistry;
let resourceRegistry;
let contentRegistry;
let stateStore;
let triggerEngine;
let gmMessageRegistry;
try {
  employeeRegistry = await EmployeeRegistry.load(
    new URL("../data/employees.json", import.meta.url),
  );
  resourceRegistry = await ResourceRegistry.load(
    new URL("../data/resources.json", import.meta.url),
  );
  resourceRegistry.validateEmployeePermissions(employeeRegistry.list());
  const contentSources = [new URL("../data/content.json", import.meta.url)];
  const localPlaywallContent = new URL(
    "../data/playwall-content.json",
    import.meta.url,
  );
  try {
    await access(localPlaywallContent);
    contentSources.push(localPlaywallContent);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log("No local Playwall content found; continuing without it.");
  }
  contentRegistry = await ContentRegistry.load(
    contentSources,
    new URL("../data/assets/", import.meta.url),
  );
  stateStore = await StateStore.load(
    new URL("../data/state.json", import.meta.url),
  );
  const employees = new Map(
    employeeRegistry
      .list()
      .map(({ employee }) => [employee.employeeId, employee]),
  );
  const resources = new Map(
    resourceRegistry.listSummaries().map((resource) => [resource.id, resource]),
  );
  triggerEngine = await TriggerEngine.load(
    new URL("../data/triggers.json", import.meta.url),
    {
      stateStore,
      contentRegistry,
      employees,
      resources,
    },
  );
  gmMessageRegistry = await GMMessageRegistry.load(
    new URL("../data/GM_message.json", import.meta.url),
  );
  console.log(`Loaded employees: ${employeeRegistry.size}`);
  console.log(`Loaded resources: ${resourceRegistry.listSummaries().length}`);
} catch (error) {
  console.error(`Registry startup error: ${error.message}`);
  process.exit(1);
}

const host = "0.0.0.0";
const port = parsePort(process.env.PORT);
const app = express();
const httpServer = http.createServer(app);
const io = new SocketServer(httpServer);
const nfc = new NfcService();
const accessLogger = new AccessLogger(
  new URL("../data/access-log.jsonl", import.meta.url),
);
const campaignLogger = new CampaignEventLogger(
  new URL("../data/campaign-events.jsonl", import.meta.url),
);
const deviceAccessLogger = new CampaignEventLogger(
  new URL("../data/device-access-log.jsonl", import.meta.url),
);
const terminalApplication = new TerminalApplication({
  employeeRegistry,
  resourceRegistry,
  contentRegistry,
  stateStore,
  triggerEngine,
  accessLogger,
  campaignLogger,
  backupDirectory: fileURLToPath(new URL("../backups/", import.meta.url)),
  exportDirectory: fileURLToPath(new URL("../exports/", import.meta.url)),
  onWarning: (error) => console.warn(error.message),
});
const readers = new Map();
const activeAgents = new Map();
const recentAgentDevices = new Map();
const penalizedDeviceSessions = new Set();
let currentBadge = null;
let activeResourceId = null;
let displayRevision = 0;
let shuttingDown = false;
let anomalyInputBlocked = false;
let anomalyFailsafe;
let heldBadgeUid = null;
let badgeHoldUntil = 0;

app.use(express.json({ limit: "16kb" }));
app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));

app.get("/supervisor", (_request, response) => {
  response.sendFile(
    fileURLToPath(new URL("./supervisor/index.html", import.meta.url)),
  );
});
app.get("/office", (_request, response) => {
  response.sendFile(
    fileURLToPath(new URL("./office/index.html", import.meta.url)),
  );
});
app.get("/agent/:employeeId", (request, response) => {
  if (!terminalApplication.getEffectiveEmployeeById(request.params.employeeId))
    return response.status(404).send("Employee portal not found.");
  response.set("Cache-Control", "no-store");
  return response.sendFile(
    fileURLToPath(new URL("./agent/index.html", import.meta.url)),
  );
});
app.use(
  "/supervisor-assets",
  express.static(fileURLToPath(new URL("./supervisor", import.meta.url))),
);
app.use(
  "/office-assets",
  express.static(fileURLToPath(new URL("./office", import.meta.url))),
);
app.use(
  "/agent-assets",
  express.static(fileURLToPath(new URL("./agent", import.meta.url)), {
    etag: false,
    maxAge: 0,
    setHeaders(response) {
      response.setHeader("Cache-Control", "no-store, max-age=0");
    },
  }),
);
app.use(
  "/office-media",
  express.static(
    fileURLToPath(new URL("../data/assets/office", import.meta.url)),
  ),
);

app.get("/content-assets/:contentId", (request, response) => {
  const asset = terminalApplication.getContentAsset(
    request.params.contentId,
    currentBadge?.employee?.employeeId,
  );
  if (!asset) return response.status(404).send("Content asset not found.");
  response.type(asset.mimeType);
  return response.sendFile(path.resolve(asset.filePath));
});

app.get("/api/agent/:employeeId", (request, response) => {
  response.set("Cache-Control", "no-store, max-age=0");
  const employeeId = request.params.employeeId;
  if (!terminalApplication.getEffectiveEmployeeById(employeeId))
    return response
      .status(404)
      .json({ ok: false, error: "Employee portal not found." });
  if (!activeAgents.has(employeeId))
    return response.json({ ok: true, unlocked: false });
  return response.json(agentPortalSnapshot(employeeId));
});

app.get("/api/agent/:employeeId/content/:contentId", (request, response) => {
  const { employeeId, contentId } = request.params;
  if (
    !activeAgents.has(employeeId) ||
    !employeeHasContent(employeeId, contentId)
  )
    return response.status(403).send("This file is locked.");
  const asset = terminalApplication.getContentAsset(contentId, employeeId);
  if (!asset) return response.status(404).send("File asset not found.");
  response.type(asset.mimeType);
  return response.sendFile(path.resolve(asset.filePath));
});

app.post("/api/agent/:employeeId/viewed", async (request, response) => {
  const employeeId = request.params.employeeId;
  const contentId = request.body?.contentId;
  if (
    !activeAgents.has(employeeId) ||
    !employeeHasContent(employeeId, contentId)
  )
    return response
      .status(403)
      .json({ ok: false, error: "This file is locked." });
  try {
    await terminalApplication.markEmployeePlaywallSeen(employeeId, contentId);
    broadcastAgentPortal(employeeId);
    broadcastSupervisorState();
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/agent/:employeeId/device", async (request, response) => {
  const employeeId = request.params.employeeId;
  const session = activeAgents.get(employeeId);
  if (!terminalApplication.getEffectiveEmployeeById(employeeId))
    return response
      .status(404)
      .json({ ok: false, error: "Employee portal not found." });
  const deviceId = request.body?.deviceId;
  if (typeof deviceId !== "string" || !/^[a-zA-Z0-9-]{16,128}$/.test(deviceId))
    return response
      .status(400)
      .json({ ok: false, error: "Invalid device identifier." });
  const userAgent = String(
    request.get("user-agent") ?? "Unknown browser",
  ).slice(0, 300);
  const suppliedLabel = String(request.body?.label ?? "Browser device")
    .trim()
    .slice(0, 100);
  const observed = {
    deviceId,
    label: suppliedLabel || "Browser device",
    userAgent,
    ip: request.ip,
    observedAt: new Date().toISOString(),
  };
  recentAgentDevices.set(employeeId, observed);
  const policy = terminalApplication.getEmployeeDevicePolicy(employeeId);
  const approved = policy.approvedDeviceId === deviceId;
  const incorrect = Boolean(session && policy.approvedDeviceId && !approved);
  const penaltyKey = session
    ? `${employeeId}:${session.loggedInAt}:${deviceId}`
    : null;
  let demeritAdded = false;
  if (incorrect && !penalizedDeviceSessions.has(penaltyKey)) {
    penalizedDeviceSessions.add(penaltyKey);
    await terminalApplication.addEmployeeDemerit(employeeId);
    demeritAdded = true;
  }
  await deviceAccessLogger
    .append({
      event: "AGENT_PORTAL_DEVICE_ACCESS",
      employeeId,
      ...observed,
      approved,
      incorrect,
      demeritAdded,
      portalUnlocked: Boolean(session),
    })
    .catch((error) => console.warn(error.message));
  broadcastAgentPortal(employeeId);
  broadcastSupervisorState();
  return response.json({
    ok: true,
    status: !session
      ? "LOCKED_VISIT"
      : approved
        ? "APPROVED"
        : incorrect
          ? "INCORRECT"
          : "PENDING_APPROVAL",
    demeritAdded,
  });
});

app.get("/api/personnel-records", (_request, response) => {
  const access = currentBadge?.access;
  if (
    access?.resource?.id !== "personnel-records" ||
    access.decision?.granted !== true
  ) {
    return response.status(403).json({
      ok: false,
      error:
        "Personnel Records access has not been granted for the active badge.",
    });
  }
  return response.json({
    ok: true,
    records: terminalApplication.listEmployeePlaywallContent(
      access.employee.employeeId,
      "playwall-agency-",
    ),
  });
});

app.post("/api/personnel-records/viewed", async (request, response) => {
  const access = currentBadge?.access;
  if (
    access?.resource?.id !== "personnel-records" ||
    access.decision?.granted !== true
  ) {
    return response.status(403).json({
      ok: false,
      error: "Personnel Records access is not active.",
    });
  }
  try {
    await terminalApplication.markEmployeePlaywallSeen(
      access.employee.employeeId,
      request.body?.contentId,
    );
    refreshCurrentBadgeFiles(access.employee.employeeId);
    broadcastSupervisorState();
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/containment-vault", (_request, response) => {
  const employeeId = currentBadge?.employee?.employeeId;
  if (!employeeId) {
    return response
      .status(403)
      .json({ ok: false, error: "No identified employee." });
  }
  return response.json({
    ok: true,
    records: terminalApplication.listEmployeePlaywallContent(
      employeeId,
      "playwall-anomaly-",
    ),
  });
});

app.post("/api/containment-vault/viewed", async (request, response) => {
  const employeeId = currentBadge?.employee?.employeeId;
  const contentId = request.body?.contentId;
  if (!employeeId || !contentId?.startsWith("playwall-anomaly-")) {
    return response
      .status(403)
      .json({ ok: false, error: "Containment Vault access is not active." });
  }
  try {
    await terminalApplication.markEmployeePlaywallSeen(employeeId, contentId);
    refreshCurrentBadgeFiles(employeeId);
    broadcastSupervisorState();
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/break-room-messages", (_request, response) => {
  const access = currentBadge?.access;
  if (
    access?.resource?.id !== "break-room" ||
    access.decision?.granted !== true
  ) {
    return response.status(403).json({
      ok: false,
      error: "Break Room access has not been granted for the active badge.",
    });
  }
  return response.json({
    ok: true,
    dependant: access.employee.dependant,
    dependantContact: access.employee.dependantContact,
    messages: terminalApplication.listEmployeePlaywallContent(
      access.employee.employeeId,
      "playwall-reality-",
    ),
  });
});

app.post("/api/break-room-messages/viewed", async (request, response) => {
  const access = currentBadge?.access;
  const contentId = request.body?.contentId;
  if (
    access?.resource?.id !== "break-room" ||
    access.decision?.granted !== true ||
    !contentId?.startsWith("playwall-reality-")
  ) {
    return response
      .status(403)
      .json({ ok: false, error: "Break Room message access is not active." });
  }
  try {
    await terminalApplication.markEmployeePlaywallSeen(
      access.employee.employeeId,
      contentId,
    );
    refreshCurrentBadgeFiles(access.employee.employeeId);
    broadcastSupervisorState();
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/__simulate", (request, response) => {
  try {
    const uid = normalizeUid(request.body?.uid);
    if (request.body?.resourceId !== undefined) {
      selectResource(request.body.resourceId);
    }
    enableTestReader();
    handleBadgeScanned({ readerId: "SIMULATOR", uid, simulated: true });
    response.json({ ok: true, uid });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/anomaly-sequence-complete", (_request, response) => {
  finishAnomalyInputBlock("sequence complete");
  response.json({ ok: true });
});

app.post("/__resource-selection", (request, response) => {
  try {
    const resource = selectResource(request.body?.resourceId ?? null);
    response.json({ ok: true, resource });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/supervisor/state", (_request, response) => {
  response.json(supervisorSnapshot());
});

app.post("/api/supervisor/employees", async (request, response) => {
  try {
    const supplied = request.body?.employee ?? {};
    const employeeId = buildEmployeeNumber(supplied);
    const employee = {
      ...supplied,
      employeeId,
      payrollNumber: generatePayrollNumber(),
    };
    let uid;
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const candidate = generateBadgeUid();
      if (!employeeRegistry.list().some((record) => record.uid === candidate)) {
        uid = candidate;
        break;
      }
    }
    if (!uid)
      throw new Error("Could not generate a unique badge UID. Try again.");
    resourceRegistry.validateEmployeePermissions([{ uid, employee }]);
    const created = await employeeRegistry.add(uid, employee);
    await campaignLogger
      .append({
        event: "SUPERVISOR_ACTION",
        action: "ADD_EMPLOYEE",
        employeeId: created.employee.employeeId,
      })
      .catch((error) => console.warn(error.message));
    broadcastState();
    broadcastSupervisorState();
    return response.status(201).json({ ok: true, ...created });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/supervisor/agent-logout", (request, response) => {
  if (request.body?.confirmation !== "CONFIRM")
    return response
      .status(400)
      .json({ ok: false, error: "Confirmation required." });
  const employeeId = request.body?.employeeId;
  if (!terminalApplication.getEffectiveEmployeeById(employeeId))
    return response.status(404).json({ ok: false, error: "Unknown employee." });
  lockAgentPortal(employeeId, "SUPERVISOR");
  return response.json({ ok: true });
});

app.post("/api/supervisor/approve-agent-device", async (request, response) => {
  if (request.body?.confirmation !== "CONFIRM")
    return response
      .status(400)
      .json({ ok: false, error: "Confirmation required." });
  const employeeId = request.body?.employeeId;
  const observed = recentAgentDevices.get(employeeId);
  if (!observed)
    return response.status(400).json({
      ok: false,
      error: "No device has been observed for this employee.",
    });
  try {
    await terminalApplication.approveEmployeeDevice(
      employeeId,
      observed.deviceId,
      observed.label,
    );
    broadcastSupervisorState();
    broadcastAgentPortal(employeeId);
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/supervisor/mutate", async (request, response) => {
  if (request.body?.confirmation !== "CONFIRM") {
    return response
      .status(400)
      .json({ ok: false, error: "Enter CONFIRM to apply this change." });
  }
  try {
    await terminalApplication.supervisorMutation(request.body.command ?? {});
    broadcastState();
    broadcastSupervisorState();
    if (request.body.command?.type === "SET_EMPLOYEE_MISSION_MVP") {
      for (const employeeId of activeAgents.keys())
        broadcastAgentPortal(employeeId);
    } else {
      const affectedEmployeeId = request.body.command?.employeeId;
      if (affectedEmployeeId && activeAgents.has(affectedEmployeeId)) {
        broadcastAgentPortal(affectedEmployeeId);
      }
    }
    if (request.body.command?.type?.includes("PLAYWALL_DOCUMENT")) {
      io.emit("playwall-access-updated");
      const command = request.body.command;
      if (
        command.employeeId === currentBadge?.employee?.employeeId &&
        command.contentId?.startsWith("playwall-anomaly-")
      ) {
        const anomalyDocuments =
          terminalApplication.listEmployeePlaywallContent(
            command.employeeId,
            "playwall-anomaly-",
          );
        io.emit("containment-vault-available", {
          count: anomalyDocuments.length,
        });
        const unseenAnomalies = anomalyDocuments.filter(
          (content) => !content.seen,
        );
        if (
          command.type === "GRANT_PLAYWALL_DOCUMENT" &&
          unseenAnomalies.length > 0
        ) {
          io.emit("containment-vault-notification", {
            count: unseenAnomalies.length,
            designations: unseenAnomalies.map((content) =>
              content.id.replace("playwall-anomaly-", "").toUpperCase(),
            ),
          });
        }
      }
      if (
        command.employeeId === currentBadge?.employee?.employeeId &&
        command.contentId?.startsWith("playwall-reality-")
      ) {
        const realityMessages = terminalApplication
          .listEmployeePlaywallContent(command.employeeId, "playwall-reality-")
          .filter((content) => !content.seen);
        currentBadge.realityMessageCount = realityMessages.length;
        io.emit("break-room-notification", {
          count: realityMessages.length,
          dependant: currentBadge.employee.dependant,
        });
      }
      refreshCurrentBadgeFiles(command.employeeId);
    }
    if (request.body.command?.type?.includes("EMPLOYEE_REMINDER")) {
      refreshCurrentBadgeReminders(request.body.command.employeeId);
    }
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/supervisor/event", async (request, response) => {
  if (request.body?.confirmation !== "CONFIRM") {
    return response
      .status(400)
      .json({ ok: false, error: "Enter CONFIRM to trigger the event." });
  }
  const result = await terminalApplication.triggerSupervisorEvent();
  if (result.supervisorEffects.length) {
    io.of("/supervisor").emit("supervisor-effects", result.supervisorEffects);
  }
  broadcastSupervisorState();
  return response.json({ ok: true, effects: result.supervisorEffects });
});

app.post("/api/content-opened", async (request, response) => {
  const contentId = request.body?.contentId;
  const interaction = currentBadge?.interaction;
  const displayed = interaction?.effects.some(
    (effect) => effect.content?.id === contentId,
  );
  if (
    !interaction ||
    interaction.interactionId !== request.body?.interactionId ||
    !displayed
  ) {
    return response.status(400).json({
      ok: false,
      error: "Content is not part of the active interaction.",
    });
  }
  const result = await terminalApplication.contentOpened(contentId, {
    employeeId: interaction.employee?.employeeId,
    uid: interaction.uid,
    resourceId: interaction.resource?.id,
    simulated: interaction.simulated,
  });
  if (result.effects.length) {
    io.emit("additional-effects", {
      interactionId: interaction.interactionId,
      effects: result.effects,
    });
  }
  if (result.supervisorEffects.length) {
    io.of("/supervisor").emit("supervisor-effects", result.supervisorEffects);
  }
  return response.json({ ok: true });
});

app.post("/api/supervisor/export", async (request, response) => {
  if (request.body?.confirmation !== "CONFIRM") {
    return response
      .status(400)
      .json({ ok: false, error: "Enter CONFIRM to export state." });
  }
  try {
    const exported = await terminalApplication.exportState();
    return response.json({ ok: true, filename: path.basename(exported) });
  } catch (error) {
    return response.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/supervisor/reset", async (request, response) => {
  if (request.body?.confirmation !== "RESET") {
    return response
      .status(400)
      .json({ ok: false, error: "Enter RESET to reset campaign state." });
  }
  try {
    const backup = await terminalApplication.resetState();
    broadcastState();
    broadcastSupervisorState();
    return response.json({ ok: true, backup: path.basename(backup) });
  } catch (error) {
    return response.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/__simulate/remove", (_request, response) => {
  if (currentBadge?.readerId === "SIMULATOR") {
    handleBadgeRemoved({ readerId: "SIMULATOR", uid: currentBadge.uid });
  }
  response.json({ ok: true });
});

app.post("/__test-mode", (request, response) => {
  const enabled = request.body?.enabled === true;
  if (enabled) {
    enableTestReader();
  } else {
    disableTestReader();
  }
  response.json({ ok: true, enabled });
});

io.on("connection", (socket) => {
  socket.emit("terminal-state", {
    connected: readers.size > 0,
    readers: [...readers.values()],
    badge: browserBadgeSnapshot(),
    testMode: readers.has("SIMULATOR"),
    resources: terminalApplication.listEffectiveResources(),
    selectedResource: activeResourceId
      ? terminalApplication.getEffectiveResource(activeResourceId)
      : null,
  });
  socket.on("agent-subscribe", (employeeId) => {
    if (
      typeof employeeId !== "string" ||
      !terminalApplication.getEffectiveEmployeeById(employeeId)
    )
      return;
    socket.join(`agent:${employeeId}`);
    socket.emit("agent-portal-state", agentPortalSnapshot(employeeId));
  });
});

io.of("/supervisor").on("connection", (socket) => {
  socket.emit("supervisor-state", supervisorSnapshot());
});

nfc.on("readerConnected", ({ readerId, name }) => {
  readers.set(readerId, name);
  console.log(`NFC reader connected: ${name}`);
  io.emit("reader-status", { connected: true, readers: [...readers.values()] });
});

nfc.on("readerDisconnected", ({ readerId, name }) => {
  readers.delete(readerId);
  console.log(`NFC reader disconnected: ${name}`);
  io.emit("reader-status", {
    connected: readers.size > 0,
    readers: [...readers.values()],
  });
  if (currentBadge?.readerId === readerId) {
    displayRevision += 1;
    currentBadge = null;
    io.emit("display-reset");
  }
});

nfc.on("badgeScanned", (badge) => void handleBadgeScanned(badge));
nfc.on("badgeRemoved", handleBadgeRemoved);
nfc.on("buzzerError", (error) => console.warn(error.message));
nfc.on("error", (error) => {
  console.error("NFC error:", error);
  io.emit("terminal-error", { message: "The NFC reader reported an error." });
});

async function handleBadgeScanned({ readerId, uid, simulated }) {
  if (anomalyInputBlocked) {
    console.log("Badge input ignored while anomaly recovery is in progress.");
    return;
  }
  const knownEmployee = terminalApplication.getEffectiveEmployeeByUid(uid);
  if (
    uid === heldBadgeUid &&
    Date.now() < badgeHoldUntil &&
    !activeAgents.has(knownEmployee?.employeeId)
  ) {
    return;
  }
  heldBadgeUid = null;
  badgeHoldUntil = 0;
  const scanRevision = ++displayRevision;
  const badge = {
    uid,
    scannedAt: new Date().toISOString(),
    simulated: Boolean(simulated),
  };
  currentBadge = {
    ...badge,
    readerId,
    employee: null,
    access: null,
    interaction: null,
  };
  console.log(`${simulated ? "[SIMULATED] " : ""}Badge scanned: ${uid}`);
  io.emit("badge-scanned", badge);
  if (knownEmployee && activeAgents.has(knownEmployee.employeeId)) {
    lockAgentPortal(knownEmployee.employeeId, "BADGE");
    currentBadge = { ...badge, readerId, employee: knownEmployee };
    io.emit("office-agent-logout", { employee: knownEmployee });
    io.emit("display-reset");
    return;
  }
  const result = await terminalApplication.processScan({
    ...badge,
    resourceId: activeResourceId,
  });
  if (displayRevision !== scanRevision) return;
  currentBadge = {
    ...badge,
    readerId,
    employee: result.employee,
    access: result.resource ? result : null,
    interaction: result,
  };
  if (result.employee) {
    unlockAgentPortal(result.employee.employeeId);
    const unresolvedFiles = listUnresolvedPlaywallFiles(
      result.employee.employeeId,
    );
    currentBadge.unresolvedFiles = unresolvedFiles;
    const reminders = terminalApplication.listEmployeeReminders(
      result.employee.employeeId,
    );
    currentBadge.reminders = reminders;
    const gmSelection = gmMessageRegistry.findForEmployee(
      result.employee.employeeId,
    );
    currentBadge.gmMessage = gmSelection.message;
    currentBadge.gmMessageCategory = gmSelection.category;
    if (gmSelection.category === "unhinged") beginAnomalyInputBlock();
    console.log(`Employee identified: ${result.employee.employeeId}`);
    io.emit("employee-identified", {
      ...badge,
      employee: result.employee,
      gmMessage: gmSelection.message,
    });
    io.emit("office-identification", {
      employee: result.employee,
      gmMessage: gmSelection.message,
      gmMessageCategory: gmSelection.category,
      unresolvedFiles,
      reminders,
    });
    const agencyDocuments = terminalApplication.listEmployeePlaywallContent(
      result.employee.employeeId,
      "playwall-agency-",
    );
    const unseenDocuments = agencyDocuments.filter((content) => !content.seen);
    if (unseenDocuments.length > 0) {
      io.emit("personnel-records-notification", {
        count: unseenDocuments.length,
        designations: unseenDocuments.map((content) =>
          content.id.replace("playwall-agency-", "").toUpperCase(),
        ),
      });
    }
    const anomalyDocuments = terminalApplication.listEmployeePlaywallContent(
      result.employee.employeeId,
      "playwall-anomaly-",
    );
    if (anomalyDocuments.length > 0) {
      io.emit("containment-vault-available", {
        count: anomalyDocuments.length,
      });
      const unseenAnomalies = anomalyDocuments.filter(
        (content) => !content.seen,
      );
      if (unseenAnomalies.length > 0) {
        io.emit("containment-vault-notification", {
          count: unseenAnomalies.length,
          designations: unseenAnomalies.map((content) =>
            content.id.replace("playwall-anomaly-", "").toUpperCase(),
          ),
        });
      }
    }
    const realityDocuments = terminalApplication.listEmployeePlaywallContent(
      result.employee.employeeId,
      "playwall-reality-",
    );
    const unseenReality = realityDocuments.filter((content) => !content.seen);
    currentBadge.realityMessageCount = unseenReality.length;
    if (unseenReality.length > 0) {
      io.emit("break-room-notification", {
        count: unseenReality.length,
        dependant: result.employee.dependant,
      });
    }
  } else {
    console.log("Unknown credential");
    io.emit("employee-unknown", badge);
    io.emit("office-unknown", { uid });
  }
  if (result.resource) {
    console.log(
      `Access ${result.decision.granted ? "granted" : "denied"}: ${result.decision.reasonCode}`,
    );
    io.emit("access-evaluated", result);
  }
  io.emit("interaction-result", result);
  if (result.supervisorEffects.length)
    io.of("/supervisor").emit("supervisor-effects", result.supervisorEffects);
  broadcastState();
}

function listUnresolvedPlaywallFiles(employeeId) {
  return terminalApplication
    .listEmployeePlaywallContent(employeeId)
    .filter((content) => !content.seen)
    .map((content) => {
      const anomaly = content.id.startsWith("playwall-anomaly-");
      const reality = content.id.startsWith("playwall-reality-");
      return {
        id: content.id,
        title: content.title,
        category: anomaly ? "anomaly" : reality ? "reality" : "agency",
        designation: content.id
          .replace(/^playwall-(agency|anomaly|reality)-/, "")
          .toUpperCase(),
      };
    });
}

function refreshCurrentBadgeFiles(employeeId) {
  if (currentBadge?.employee?.employeeId !== employeeId) return;
  currentBadge.unresolvedFiles = listUnresolvedPlaywallFiles(employeeId);
  io.emit("office-files-updated", {
    unresolvedFiles: currentBadge.unresolvedFiles,
  });
}

function refreshCurrentBadgeReminders(employeeId) {
  if (currentBadge?.employee?.employeeId !== employeeId) return;
  currentBadge.reminders =
    terminalApplication.listEmployeeReminders(employeeId);
  io.emit("office-reminders-updated", {
    reminders: currentBadge.reminders,
  });
}

function handleBadgeRemoved({ readerId, uid }) {
  io.emit("badge-removed", { readerId, uid });
  if (currentBadge?.readerId !== readerId || currentBadge.uid !== uid) return;
  const removalRevision = displayRevision;
  heldBadgeUid = uid;
  badgeHoldUntil = Date.now() + 10_000;
  setTimeout(() => {
    if (displayRevision !== removalRevision || anomalyInputBlocked) return;
    currentBadge = null;
    heldBadgeUid = null;
    badgeHoldUntil = 0;
    io.emit("display-reset");
  }, 10_000);
}

function beginAnomalyInputBlock() {
  anomalyInputBlocked = true;
  clearTimeout(anomalyFailsafe);
  anomalyFailsafe = setTimeout(() => {
    console.warn("Anomaly input block released by safety timeout.");
    finishAnomalyInputBlock("safety timeout");
  }, 60_000);
  anomalyFailsafe.unref();
  io.emit("input-blocked", { reason: "ANOMALY_RECOVERY" });
}

function finishAnomalyInputBlock(reason) {
  if (!anomalyInputBlocked) return;
  anomalyInputBlocked = false;
  clearTimeout(anomalyFailsafe);
  anomalyFailsafe = undefined;
  displayRevision += 1;
  currentBadge = null;
  heldBadgeUid = null;
  badgeHoldUntil = 0;
  console.log(`Badge input restored (${reason}).`);
  io.emit("display-reset");
  io.emit("input-restored");
}

function enableTestReader() {
  if (readers.has("SIMULATOR")) return;
  readers.set("SIMULATOR", "SIMULATED READER");
  console.log("[TEST MODE] Simulated reader enabled");
  io.emit("test-mode-status", { enabled: true });
  io.emit("reader-status", { connected: true, readers: [...readers.values()] });
}

function disableTestReader() {
  if (!readers.has("SIMULATOR")) return;
  if (currentBadge?.readerId === "SIMULATOR") {
    handleBadgeRemoved({ readerId: "SIMULATOR", uid: currentBadge.uid });
  }
  readers.delete("SIMULATOR");
  console.log("[TEST MODE] Simulated reader disabled");
  io.emit("test-mode-status", { enabled: false });
  io.emit("reader-status", {
    connected: readers.size > 0,
    readers: [...readers.values()],
  });
}

function selectResource(resourceId) {
  if (resourceId === null || resourceId === "") {
    activeResourceId = null;
    io.emit("resource-selected", { resource: null });
    return null;
  }
  if (typeof resourceId !== "string")
    throw new Error("Resource ID must be a string.");
  const resource = resourceRegistry.findById(resourceId);
  if (!resource) throw new Error(`Unknown resource: ${resourceId}`);
  activeResourceId = resource.id;
  const effective = terminalApplication.getEffectiveResource(resource.id);
  io.emit("resource-selected", { resource: effective });
  return effective;
}

function broadcastState() {
  io.emit("resources-updated", {
    resources: terminalApplication.listEffectiveResources(),
    selectedResource: activeResourceId
      ? terminalApplication.getEffectiveResource(activeResourceId)
      : null,
  });
}

function supervisorSnapshot() {
  const snapshot = terminalApplication.getSupervisorState(
    currentBadge?.employee?.employeeId ?? null,
    activeResourceId,
  );
  return {
    ...snapshot,
    agentAccess: snapshot.employees.map((employee) => ({
      employeeId: employee.employeeId,
      unlocked: activeAgents.has(employee.employeeId),
      loggedInAt: activeAgents.get(employee.employeeId)?.loggedInAt ?? null,
      path: `/agent/${encodeURIComponent(employee.employeeId)}`,
    })),
    agentPortalOrigins: localNetworkOrigins(),
    deviceAccess: snapshot.employees.map((employee) => ({
      employeeId: employee.employeeId,
      ...terminalApplication.getEmployeeDevicePolicy(employee.employeeId),
      observed: recentAgentDevices.get(employee.employeeId) ?? null,
    })),
  };
}

function localNetworkOrigins() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}

function agentPortalSnapshot(employeeId) {
  if (!activeAgents.has(employeeId)) return { ok: true, unlocked: false };
  const employee = terminalApplication.getEffectiveEmployeeById(employeeId);
  const files = terminalApplication
    .listEmployeePlaywallContent(employeeId)
    .map((content) => ({
      ...content,
      category: content.id.includes("-anomaly-")
        ? "blue"
        : content.id.includes("-reality-")
          ? "yellow"
          : "red",
      ...(content.assetUrl && {
        assetUrl: `/api/agent/${encodeURIComponent(employeeId)}/content/${encodeURIComponent(content.id)}`,
      }),
    }));
  return {
    ok: true,
    unlocked: true,
    loggedInAt: activeAgents.get(employeeId).loggedInAt,
    employee,
    files,
  };
}

function employeeHasContent(employeeId, contentId) {
  return (
    typeof contentId === "string" &&
    terminalApplication
      .listEmployeePlaywallContent(employeeId)
      .some((content) => content.id === contentId)
  );
}

function unlockAgentPortal(employeeId) {
  activeAgents.set(employeeId, { loggedInAt: new Date().toISOString() });
  console.log(`Agent portal unlocked: ${employeeId}`);
  broadcastAgentPortal(employeeId);
  broadcastSupervisorState();
}

function lockAgentPortal(employeeId, source) {
  activeAgents.delete(employeeId);
  console.log(`Agent portal locked: ${employeeId} (${source})`);
  broadcastAgentPortal(employeeId);
  broadcastSupervisorState();
}

function broadcastAgentPortal(employeeId) {
  io.to(`agent:${employeeId}`).emit(
    "agent-portal-state",
    agentPortalSnapshot(employeeId),
  );
}

function broadcastSupervisorState() {
  io.of("/supervisor").emit("supervisor-state", supervisorSnapshot());
}

function browserBadgeSnapshot() {
  if (!currentBadge) return null;
  return {
    ...currentBadge,
    ...(currentBadge.access && {
      access: { ...currentBadge.access, effects: [], supervisorEffects: [] },
    }),
    interaction: null,
  };
}

function parsePort(rawPort) {
  const value = rawPort ?? "3000";
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    console.error(
      `Invalid PORT value "${value}". Choose a number from 1 to 65535.`,
    );
    process.exit(1);
  }
  return Number(value);
}

async function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;
  try {
    const { default: open } = await import("open");
    await open(url);
  } catch (error) {
    console.warn(`Could not open the browser automatically: ${error.message}`);
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down (${signal})...`);
  httpServer.close();
  const forcedExit = setTimeout(() => process.exit(1), 3000);
  forcedExit.unref();
  try {
    await nfc.stop();
    await new Promise((resolve) => io.close(resolve));
    clearTimeout(forcedExit);
    process.exit(0);
  } catch (error) {
    console.error("Shutdown error:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

httpServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Set another port with: $env:PORT = 3001`,
    );
  } else {
    console.error("Web server failed:", error);
  }
  void nfc.stop().finally(() => process.exit(1));
});

httpServer.listen(port, host, () => {
  const url = `http://localhost:${port}/office`;
  console.log("TRIANGLE AGENCY IDENTIFICATION TERMINAL");
  console.log("Starting local terminal...");
  console.log(`Office portal: ${url}`);
  console.log("Waiting for NFC reader...");
  try {
    nfc.start();
  } catch (error) {
    console.error("Could not start PC/SC monitoring:", error);
    io.emit("terminal-error", {
      message: "PC/SC monitoring could not be started.",
    });
  }
  void openBrowser(url);
});

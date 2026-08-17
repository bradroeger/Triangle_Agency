import { randomUUID } from "node:crypto";
import {
  evaluateAccess,
  noResourceSelected,
} from "../access/evaluateAccess.js";
import { mergeEmployee, mergeResource } from "../state/effectiveRecords.js";
import { buildEmployeeNumber } from "../employees/employeeIdentifiers.js";

export class TerminalApplication {
  #employeeRegistry;
  #resourceRegistry;
  #contentRegistry;
  #stateStore;
  #triggerEngine;
  #accessLogger;
  #campaignLogger;
  #backupDirectory;
  #exportDirectory;
  #onWarning;

  constructor(options) {
    this.#employeeRegistry = options.employeeRegistry;
    this.#resourceRegistry = options.resourceRegistry;
    this.#contentRegistry = options.contentRegistry;
    this.#stateStore = options.stateStore;
    this.#triggerEngine = options.triggerEngine;
    this.#accessLogger = options.accessLogger;
    this.#campaignLogger = options.campaignLogger;
    this.#backupDirectory = options.backupDirectory;
    this.#exportDirectory = options.exportDirectory;
    this.#onWarning = options.onWarning ?? (() => {});
    this.#validateStateReferences();
  }

  async processScan({ uid, scannedAt, simulated, resourceId }) {
    const interactionId = randomUUID();
    const scanCount = await this.#incrementScanCount(uid);
    let employee = this.getEffectiveEmployeeByUid(uid);
    const effects = [];
    const supervisorEffects = [];

    const identification = await this.#runEvent({
      event: employee ? "BADGE_IDENTIFIED" : "UNKNOWN_BADGE",
      employee,
      employeeId: employee?.employeeId,
      uid,
      simulated,
      scanCount,
    });
    collectEffects(identification, effects, supervisorEffects);
    if (employee) employee = this.getEffectiveEmployeeById(employee.employeeId);

    if (!resourceId) {
      const noResource = await this.#runEvent({
        event: "NO_RESOURCE_SELECTED",
        employee,
        employeeId: employee?.employeeId,
        uid,
        simulated,
        scanCount,
        reasonCode: "NO_RESOURCE_SELECTED",
      });
      collectEffects(noResource, effects, supervisorEffects);
      return {
        interactionId,
        scan: { uid, scannedAt, simulated },
        uid,
        scannedAt,
        simulated,
        employee: publicEmployee(employee),
        resource: null,
        decision: noResourceSelected(),
        effects,
        supervisorEffects,
      };
    }

    const resource = this.getEffectiveResource(resourceId);
    const decision = evaluateAccess(employee, resource);
    await this.#accessLogger
      .append({
        timestamp: scannedAt,
        uid,
        employeeId: employee?.employeeId ?? null,
        resourceId,
        granted: decision.granted,
        reasonCode: decision.reasonCode,
        simulated,
      })
      .catch((error) => this.#onWarning(error));

    const accessEvent = await this.#runEvent({
      event: decision.granted ? "ACCESS_GRANTED" : "ACCESS_DENIED",
      employee,
      employeeId: employee?.employeeId,
      uid,
      resourceId,
      reasonCode: decision.reasonCode,
      simulated,
      scanCount,
    });
    collectEffects(accessEvent, effects, supervisorEffects);

    return {
      interactionId,
      scan: { uid, scannedAt, simulated },
      uid,
      scannedAt,
      simulated,
      employee: publicEmployee(employee),
      resource: publicResource(resource),
      decision,
      effects,
      supervisorEffects,
    };
  }

  getEffectiveEmployeeByUid(uid) {
    const employee = this.#employeeRegistry.findByUid(uid);
    return employee
      ? mergeEmployee(
          employee,
          this.#stateStore.getEmployeeOverride(employee.employeeId),
        )
      : null;
  }

  getEffectiveEmployeeById(employeeId) {
    const record = this.#employeeRegistry
      .list()
      .find(({ employee }) => employee.employeeId === employeeId)?.employee;
    return record
      ? mergeEmployee(record, this.#stateStore.getEmployeeOverride(employeeId))
      : null;
  }

  getEffectiveResource(resourceId) {
    const resource = this.#resourceRegistry.findById(resourceId);
    return resource
      ? mergeResource(
          resource,
          this.#stateStore.getResourceOverride(resourceId),
        )
      : null;
  }

  listEffectiveResources() {
    return this.#resourceRegistry
      .listSummaries()
      .map((resource) =>
        publicResource(
          mergeResource(
            resource,
            this.#stateStore.getResourceOverride(resource.id),
          ),
        ),
      );
  }

  getContentAsset(contentId, employeeId = null) {
    if (
      contentId.startsWith("playwall-") &&
      !this.#employeeCanAccessPlaywall(employeeId, contentId)
    ) {
      return null;
    }
    return this.#contentRegistry.getAsset(contentId);
  }

  listUnlockedContent(prefix = "") {
    return this.#stateStore
      .getState()
      .unlockedContent.filter((contentId) => contentId.startsWith(prefix))
      .map((contentId) => this.#contentRegistry.findById(contentId))
      .filter(Boolean);
  }

  listEmployeePlaywallContent(employeeId, prefix = "playwall-") {
    if (!employeeId) return [];
    const override = this.#stateStore.getEmployeeOverride(employeeId);
    const assigned = override.playwallDocuments ?? [];
    const seen = new Set(override.seenPlaywallDocuments ?? []);
    return assigned
      .map((contentId) => this.#contentRegistry.findById(contentId))
      .filter(
        (content) =>
          content?.id.startsWith(prefix) &&
          !(content.id.startsWith("playwall-anomaly-") && seen.has(content.id)),
      )
      .map((content) => ({ ...content, seen: seen.has(content.id) }));
  }

  listEmployeeReminders(employeeId) {
    if (!employeeId) return [];
    return [
      ...(this.#stateStore.getEmployeeOverride(employeeId).reminders ?? []),
    ];
  }

  getEmployeeDevicePolicy(employeeId) {
    this.#requireEmployee(employeeId);
    const override = this.#stateStore.getEmployeeOverride(employeeId);
    return {
      approvedDeviceId: override.approvedDeviceId ?? null,
      approvedDeviceLabel: override.approvedDeviceLabel ?? null,
    };
  }

  async approveEmployeeDevice(employeeId, deviceId, label) {
    this.#requireEmployee(employeeId);
    if (
      typeof deviceId !== "string" ||
      !/^[a-zA-Z0-9-]{16,128}$/.test(deviceId)
    )
      throw new Error("Device identifier is invalid.");
    if (typeof label !== "string" || !label.trim())
      throw new Error("Device label is required.");
    await this.#stateStore.applyEmployeeOverride(employeeId, {
      approvedDeviceId: deviceId,
      approvedDeviceLabel: label.trim().slice(0, 160),
    });
  }

  async addEmployeeDemerit(employeeId) {
    const employee = this.getEffectiveEmployeeById(employeeId);
    if (!employee) throw new Error(`Unknown employee: ${employeeId}`);
    await this.#stateStore.applyEmployeeOverride(employeeId, {
      demerits: employee.demerits + 1,
    });
    return employee.demerits + 1;
  }

  async markEmployeePlaywallSeen(employeeId, contentId) {
    if (!this.#employeeCanAccessPlaywall(employeeId, contentId)) {
      throw new Error(
        "This Playwall document is not assigned to the employee.",
      );
    }
    const override = this.#stateStore.getEmployeeOverride(employeeId);
    if (contentId.startsWith("playwall-anomaly-")) {
      const assigned = new Set(override.playwallDocuments ?? []);
      const seen = new Set(override.seenPlaywallDocuments ?? []);
      assigned.delete(contentId);
      seen.delete(contentId);
      await this.#stateStore.applyEmployeeOverride(employeeId, {
        playwallDocuments: [...assigned].sort(),
        seenPlaywallDocuments: [...seen].sort(),
      });
      return;
    }
    const seen = new Set(override.seenPlaywallDocuments ?? []);
    seen.add(contentId);
    await this.#stateStore.applyEmployeeOverride(employeeId, {
      seenPlaywallDocuments: [...seen].sort(),
    });
  }

  listEffectiveEmployees() {
    return this.#employeeRegistry.list().map(({ uid, employee }) => ({
      uid,
      ...publicEmployee(
        mergeEmployee(
          employee,
          this.#stateStore.getEmployeeOverride(employee.employeeId),
        ),
      ),
      playwallDocuments:
        this.#stateStore.getEmployeeOverride(employee.employeeId)
          .playwallDocuments ?? [],
      seenPlaywallDocuments:
        this.#stateStore.getEmployeeOverride(employee.employeeId)
          .seenPlaywallDocuments ?? [],
      reminders:
        this.#stateStore.getEmployeeOverride(employee.employeeId).reminders ??
        [],
    }));
  }

  getSupervisorState(currentEmployeeId, currentResourceId) {
    const state = this.#stateStore.getState();
    return {
      version: state.version,
      flags: state.flags,
      employee: currentEmployeeId
        ? this.getEffectiveEmployeeById(currentEmployeeId)
        : null,
      resource: currentResourceId
        ? this.getEffectiveResource(currentResourceId)
        : null,
      resources: this.listEffectiveResources(),
      employees: this.listEffectiveEmployees(),
      content: this.#contentRegistry.listMetadata(),
      unlockedContent: [...state.unlockedContent],
      triggerHistory: state.triggerHistory,
    };
  }

  async supervisorMutation(command) {
    const { type } = command;
    if (type === "SET_FLAG") {
      await this.#stateStore.setFlag(command.flag, command.value);
    } else if (type === "SET_EMPLOYEE_CLEARANCE") {
      this.#requireEmployee(command.employeeId);
      requireClearance(command.clearance);
      await this.#stateStore.applyEmployeeOverride(command.employeeId, {
        clearance: command.clearance,
      });
    } else if (type === "SET_EMPLOYEE_STATUS") {
      this.#requireEmployee(command.employeeId);
      if (typeof command.status !== "string" || !command.status.trim()) {
        throw new Error("Employee status must be a non-empty string.");
      }
      await this.#stateStore.applyEmployeeOverride(command.employeeId, {
        status: command.status.trim(),
      });
    } else if (type === "SET_EMPLOYEE_LOYALTY") {
      this.#requireEmployee(command.employeeId);
      if (
        !Number.isInteger(command.loyalty) ||
        command.loyalty < 1 ||
        command.loyalty > 9
      )
        throw new Error("Employee loyalty must be an integer from 1 to 9.");
      await this.#stateStore.applyEmployeeOverride(command.employeeId, {
        loyalty: command.loyalty,
      });
    } else if (type === "SET_EMPLOYEE_MISSION_MVP") {
      this.#requireEmployee(command.employeeId);
      if (typeof command.enabled !== "boolean")
        throw new Error("Mission MVP enabled value must be boolean.");
      await this.#stateStore.setMissionMvp(command.employeeId, command.enabled);
    } else if (type === "ADD_EMPLOYEE_PERMISSION") {
      await this.#changePermission(command, true);
    } else if (type === "REMOVE_EMPLOYEE_PERMISSION") {
      await this.#changePermission(command, false);
    } else if (type === "SET_RESOURCE_ENABLED") {
      this.#requireResource(command.resourceId);
      if (typeof command.enabled !== "boolean")
        throw new Error("Resource enabled value must be boolean.");
      await this.#stateStore.applyResourceOverride(command.resourceId, {
        enabled: command.enabled,
      });
    } else if (type === "SET_RESOURCE_CLEARANCE") {
      this.#requireResource(command.resourceId);
      requireClearance(command.clearance);
      await this.#stateStore.applyResourceOverride(command.resourceId, {
        minimumClearance: command.clearance,
      });
    } else if (type === "UNLOCK_CONTENT") {
      if (!this.#contentRegistry.findById(command.contentId))
        throw new Error(`Unknown content: ${command.contentId}`);
      await this.#stateStore.unlockContent(command.contentId);
    } else if (
      type === "GRANT_PLAYWALL_DOCUMENT" ||
      type === "REVOKE_PLAYWALL_DOCUMENT"
    ) {
      await this.#changePlaywallDocument(
        command.employeeId,
        command.contentId,
        type === "GRANT_PLAYWALL_DOCUMENT",
      );
    } else if (
      type === "ADD_EMPLOYEE_REMINDER" ||
      type === "REMOVE_EMPLOYEE_REMINDER"
    ) {
      await this.#changeEmployeeReminder(
        command.employeeId,
        command.reminder,
        type === "ADD_EMPLOYEE_REMINDER",
      );
    } else {
      throw new Error(`Unknown supervisor command: ${String(type)}`);
    }
    await this.#campaignLogger
      .append({ event: "SUPERVISOR_ACTION", action: type })
      .catch(this.#onWarning);
  }

  async #changePermission(command, add) {
    this.#requireEmployee(command.employeeId);
    this.#requireResource(command.resourceId);
    if (!["allow", "deny"].includes(command.permission)) {
      throw new Error("Permission must be allow or deny.");
    }
    const effective = this.getEffectiveEmployeeById(command.employeeId);
    const allow = new Set(effective.permissions.allow);
    const deny = new Set(effective.permissions.deny);
    const selected = command.permission === "allow" ? allow : deny;
    const opposite = command.permission === "allow" ? deny : allow;
    if (add) {
      selected.add(command.resourceId);
      opposite.delete(command.resourceId);
    } else {
      selected.delete(command.resourceId);
    }
    await this.#stateStore.applyEmployeeOverride(command.employeeId, {
      permissions: { allow: [...allow], deny: [...deny] },
    });
  }

  async #changePlaywallDocument(employeeId, contentId, grant) {
    this.#requireEmployee(employeeId);
    const content = this.#contentRegistry.findById(contentId);
    if (!/^playwall-(agency|anomaly|reality)-/.test(content?.id ?? "")) {
      throw new Error(
        `Unknown assignable Playwall document: ${String(contentId)}`,
      );
    }
    const override = this.#stateStore.getEmployeeOverride(employeeId);
    const assigned = new Set(override.playwallDocuments ?? []);
    const seen = new Set(override.seenPlaywallDocuments ?? []);
    if (grant) assigned.add(contentId);
    else {
      assigned.delete(contentId);
      seen.delete(contentId);
    }
    await this.#stateStore.applyEmployeeOverride(employeeId, {
      playwallDocuments: [...assigned].sort(),
      seenPlaywallDocuments: [...seen].sort(),
    });
    if (grant) await this.#stateStore.unlockContent(contentId);
  }

  async #changeEmployeeReminder(employeeId, reminder, add) {
    this.#requireEmployee(employeeId);
    if (typeof reminder !== "string" || !reminder.trim()) {
      throw new Error("Employee reminder must be a non-empty string.");
    }
    const normalized = reminder.trim();
    if (normalized.length > 240) {
      throw new Error("Employee reminder must be 240 characters or fewer.");
    }
    const override = this.#stateStore.getEmployeeOverride(employeeId);
    const reminders = new Set(override.reminders ?? []);
    if (add) reminders.add(normalized);
    else reminders.delete(normalized);
    await this.#stateStore.applyEmployeeOverride(employeeId, {
      reminders: [...reminders],
    });
  }

  #employeeCanAccessPlaywall(employeeId, contentId) {
    if (!employeeId) return false;
    const override = this.#stateStore.getEmployeeOverride(employeeId);
    return (
      (override.playwallDocuments ?? []).includes(contentId) &&
      !(
        contentId.startsWith("playwall-anomaly-") &&
        (override.seenPlaywallDocuments ?? []).includes(contentId)
      )
    );
  }

  async triggerSupervisorEvent() {
    return this.#runEvent({
      event: "SUPERVISOR_ACTION",
      simulated: false,
      scanCount: 0,
    });
  }

  async contentOpened(contentId, context = {}) {
    if (!this.#contentRegistry.findById(contentId))
      throw new Error(`Unknown content: ${contentId}`);
    return this.#runEvent({
      event: "CONTENT_OPENED",
      contentId,
      employeeId: context.employeeId,
      employee: context.employeeId
        ? this.getEffectiveEmployeeById(context.employeeId)
        : null,
      uid: context.uid,
      resourceId: context.resourceId,
      simulated: Boolean(context.simulated),
      scanCount: 0,
    });
  }

  exportState() {
    return this.#stateStore.exportTo(this.#exportDirectory);
  }

  async resetState() {
    const backup = await this.#stateStore.reset(this.#backupDirectory);
    await this.#campaignLogger
      .append({ event: "SUPERVISOR_RESET" })
      .catch(this.#onWarning);
    return backup;
  }

  async #incrementScanCount(uid) {
    let count;
    await this.#stateStore.mutate((draft) => {
      count = (draft.scanCounts[uid] ?? 0) + 1;
      draft.scanCounts[uid] = count;
    });
    return count;
  }

  async #runEvent(context) {
    try {
      const result = await this.#triggerEngine.process(context);
      for (const mutation of result.mutations) {
        await this.#campaignLogger
          .append({
            ...mutation,
            employeeId: context.employeeId ?? null,
            simulated: Boolean(context.simulated),
          })
          .catch(this.#onWarning);
      }
      return result;
    } catch (error) {
      this.#onWarning(
        new Error(
          `Trigger processing failed for ${context.event}: ${error.message}`,
        ),
      );
      return {
        effects: [],
        supervisorEffects: [],
        mutations: [],
        executedTriggerIds: [],
      };
    }
  }

  #validateStateReferences() {
    const state = this.#stateStore.getState();
    for (const [employeeId, override] of Object.entries(state.employees)) {
      this.#requireEmployee(employeeId);
      for (const type of ["allow", "deny"]) {
        for (const resourceId of override.permissions?.[type] ?? [])
          this.#requireResource(resourceId);
      }
      for (const contentId of override.playwallDocuments ?? []) {
        if (
          !/^playwall-(agency|anomaly|reality)-/.test(
            this.#contentRegistry.findById(contentId)?.id ?? "",
          )
        ) {
          throw new Error(
            `Campaign state employee ${employeeId} references unknown assignable Playwall document "${contentId}".`,
          );
        }
      }
      for (const contentId of override.seenPlaywallDocuments ?? []) {
        if (!override.playwallDocuments?.includes(contentId)) {
          throw new Error(
            `Campaign state employee ${employeeId} has seen unassigned Playwall document "${contentId}".`,
          );
        }
      }
    }
    for (const resourceId of Object.keys(state.resources))
      this.#requireResource(resourceId);
    for (const contentId of state.unlockedContent) {
      if (!this.#contentRegistry.findById(contentId))
        throw new Error(
          `Campaign state references unknown content "${contentId}".`,
        );
    }
  }

  #requireEmployee(employeeId) {
    if (!this.getEffectiveEmployeeById(employeeId))
      throw new Error(`Unknown employee: ${employeeId}`);
  }

  #requireResource(resourceId) {
    if (!this.#resourceRegistry.findById(resourceId))
      throw new Error(`Unknown resource: ${resourceId}`);
  }
}

function publicEmployee(employee) {
  if (!employee) return null;
  const {
    employeeId,
    name,
    department,
    clearance,
    status,
    message,
    role,
    anomalyDesignation,
    dependant,
    dependantContact,
    demerits,
    commendations,
    pronouns,
    birthday,
    nextOfKin,
    manager,
    hireDate,
    employmentType,
    workLocation,
    phoneExtension,
    payrollNumber,
    anomalyType,
    competencyType,
    realityType,
    entityType,
    personnelNotes,
    nonHuman,
    anomalousEmployee,
    realityCompromised,
    containmentRequired,
    anomalyDanger,
    loyalty,
    missionMvp,
  } = employee;
  let employeeNumber = employeeId;
  if (competencyType && anomalyDanger && loyalty) {
    try {
      employeeNumber = buildEmployeeNumber({
        competencyType,
        anomalyDanger,
        nonHuman,
        loyalty,
      });
    } catch {
      /* Legacy records retain their original employee number. */
    }
  }
  return {
    employeeId,
    employeeNumber,
    name,
    department,
    clearance,
    status,
    role,
    anomalyDesignation,
    dependant,
    dependantContact: {
      ...dependantContact,
      methods: [...dependantContact.methods],
    },
    demerits,
    commendations,
    pronouns,
    birthday,
    nextOfKin,
    manager,
    hireDate,
    employmentType,
    workLocation,
    phoneExtension,
    payrollNumber,
    anomalyType,
    competencyType,
    realityType,
    entityType,
    personnelNotes,
    nonHuman,
    anomalousEmployee,
    realityCompromised,
    containmentRequired,
    anomalyDanger,
    loyalty,
    missionMvp: missionMvp ?? false,
    ...(message && { message }),
  };
}

function publicResource(resource) {
  if (!resource) return null;
  const {
    id,
    name,
    description,
    minimumClearance,
    allowedDepartments,
    allowedStatuses,
    enabled,
    message,
  } = resource;
  return {
    id,
    name,
    description,
    minimumClearance,
    allowedDepartments: [...allowedDepartments],
    allowedStatuses: [...allowedStatuses],
    enabled,
    ...(message && { message }),
  };
}

function collectEffects(result, effects, supervisorEffects) {
  effects.push(...result.effects);
  supervisorEffects.push(...result.supervisorEffects);
}

function requireClearance(value) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error("Clearance must be an integer from 0 to 9.");
  }
}

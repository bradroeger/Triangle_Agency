import { copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESOURCE_ID_PATTERN } from "../resources/ResourceRegistry.js";

export const STATE_VERSION = 1;

export class StateStore {
  #filePath;
  #state;
  #queue = Promise.resolve();

  constructor(filePath, state) {
    this.#filePath = toPath(filePath);
    this.#state = state;
  }

  static async load(filePath) {
    const resolvedPath = toPath(filePath);
    let state;
    try {
      state = JSON.parse(await readFile(resolvedPath, "utf8"));
      validateState(state);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`Could not load campaign state: ${error.message}`);
      }
      state = createDefaultState();
      await writeAtomic(resolvedPath, state);
    }
    return new StateStore(resolvedPath, state);
  }

  getState() {
    return structuredClone(this.#state);
  }

  getFlag(name) {
    return structuredClone(this.#state.flags[name]);
  }

  getEmployeeOverride(employeeId) {
    return structuredClone(this.#state.employees[employeeId] ?? {});
  }

  getResourceOverride(resourceId) {
    return structuredClone(this.#state.resources[resourceId] ?? {});
  }

  isContentUnlocked(contentId) {
    return this.#state.unlockedContent.includes(contentId);
  }

  wasTriggerExecuted(triggerId) {
    return Boolean(this.#state.triggerHistory[triggerId]);
  }

  async mutate(mutator) {
    return this.#enqueue(async () => {
      const draft = structuredClone(this.#state);
      const result = await mutator(draft);
      validateState(draft);
      await writeAtomic(this.#filePath, draft);
      this.#state = draft;
      return result;
    });
  }

  async setFlag(name, value) {
    validateFlagValue(name, value);
    return this.mutate((draft) => {
      draft.flags[name] = value;
    });
  }

  async incrementFlag(name, amount = 1) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      throw new Error(`Flag increment for "${name}" must be a finite number.`);
    }
    return this.mutate((draft) => {
      const current = draft.flags[name] ?? 0;
      if (typeof current !== "number" || !Number.isFinite(current)) {
        throw new Error(`Cannot increment non-numeric flag "${name}".`);
      }
      draft.flags[name] = current + amount;
    });
  }

  async applyEmployeeOverride(employeeId, override) {
    return this.mutate((draft) => {
      draft.employees[employeeId] = {
        ...(draft.employees[employeeId] ?? {}),
        ...structuredClone(override),
      };
    });
  }

  async applyResourceOverride(resourceId, override) {
    return this.mutate((draft) => {
      draft.resources[resourceId] = {
        ...(draft.resources[resourceId] ?? {}),
        ...structuredClone(override),
      };
    });
  }

  async unlockContent(contentId) {
    return this.mutate((draft) => {
      if (!draft.unlockedContent.includes(contentId))
        draft.unlockedContent.push(contentId);
    });
  }

  async recordTrigger(triggerId, details = {}) {
    return this.mutate((draft) => {
      draft.triggerHistory[triggerId] = {
        executedAt: new Date().toISOString(),
        count: (draft.triggerHistory[triggerId]?.count ?? 0) + 1,
        ...structuredClone(details),
      };
    });
  }

  async exportTo(directory) {
    return this.#enqueue(async () => {
      await mkdir(directory, { recursive: true });
      const timestamp = fileTimestamp();
      const destination = path.join(
        directory,
        `triangle-state-${timestamp}.json`,
      );
      const handle = await open(destination, "wx");
      try {
        await handle.writeFile(
          `${JSON.stringify(this.#state, null, 2)}\n`,
          "utf8",
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      return destination;
    });
  }

  async reset(backupDirectory) {
    return this.#enqueue(async () => {
      await mkdir(backupDirectory, { recursive: true });
      const backupPath = path.join(
        backupDirectory,
        `state-${fileTimestamp()}.json`,
      );
      await copyFile(this.#filePath, backupPath);
      const fresh = createDefaultState();
      await writeAtomic(this.#filePath, fresh);
      this.#state = fresh;
      return backupPath;
    });
  }

  #enqueue(operation) {
    const pending = this.#queue.then(operation, operation);
    this.#queue = pending.catch(() => {});
    return pending;
  }
}

export function createDefaultState() {
  return {
    version: STATE_VERSION,
    flags: {},
    employees: {},
    resources: {},
    triggerHistory: {},
    unlockedContent: [],
    scanCounts: {},
  };
}

function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Campaign state must be a JSON object.");
  }
  if (state.version !== STATE_VERSION) {
    throw new Error(
      `Unsupported campaign state version ${String(state.version)}; expected ${STATE_VERSION}.`,
    );
  }
  for (const field of [
    "flags",
    "employees",
    "resources",
    "triggerHistory",
    "scanCounts",
  ]) {
    if (
      !state[field] ||
      typeof state[field] !== "object" ||
      Array.isArray(state[field])
    ) {
      throw new Error(`Campaign state field "${field}" must be an object.`);
    }
  }
  if (
    !Array.isArray(state.unlockedContent) ||
    new Set(state.unlockedContent).size !== state.unlockedContent.length
  ) {
    throw new Error(
      'Campaign state field "unlockedContent" must contain unique entries.',
    );
  }
  for (const [name, value] of Object.entries(state.flags))
    validateFlagValue(name, value);
  for (const [employeeId, override] of Object.entries(state.employees)) {
    requireObject(`employees.${employeeId}`, override);
    if (override.clearance !== undefined)
      validateClearance(
        `employees.${employeeId}.clearance`,
        override.clearance,
      );
    if (
      override.loyalty !== undefined &&
      (!Number.isInteger(override.loyalty) ||
        override.loyalty < 1 ||
        override.loyalty > 9)
    ) {
      throw new Error(
        `Campaign state field "employees.${employeeId}.loyalty" must be an integer from 1 to 9.`,
      );
    }
    if (
      override.status !== undefined &&
      (typeof override.status !== "string" || !override.status.trim())
    ) {
      throw new Error(
        `Campaign state field "employees.${employeeId}.status" must be a non-empty string.`,
      );
    }
    if (override.permissions !== undefined) {
      requireObject(
        `employees.${employeeId}.permissions`,
        override.permissions,
      );
      for (const type of ["allow", "deny"])
        validateResourceIds(
          `employees.${employeeId}.permissions.${type}`,
          override.permissions[type],
        );
      const overlap = override.permissions.allow?.find((id) =>
        override.permissions.deny?.includes(id),
      );
      if (overlap)
        throw new Error(
          `Campaign state employee ${employeeId} allows and denies "${overlap}".`,
        );
    }
    if (override.flags !== undefined) {
      requireObject(`employees.${employeeId}.flags`, override.flags);
      for (const [name, value] of Object.entries(override.flags))
        validateFlagValue(name, value);
    }
    if (override.playwallDocuments !== undefined) {
      validateResourceIds(
        `employees.${employeeId}.playwallDocuments`,
        override.playwallDocuments,
      );
    }
    if (override.seenPlaywallDocuments !== undefined) {
      validateResourceIds(
        `employees.${employeeId}.seenPlaywallDocuments`,
        override.seenPlaywallDocuments,
      );
    }
    if (override.reminders !== undefined) {
      validateStringArray(
        `employees.${employeeId}.reminders`,
        override.reminders,
      );
      if (override.reminders.some((reminder) => reminder.length > 240)) {
        throw new Error(
          `Campaign state employee ${employeeId} has a reminder longer than 240 characters.`,
        );
      }
    }
  }
  for (const [resourceId, override] of Object.entries(state.resources)) {
    requireObject(`resources.${resourceId}`, override);
    if (
      override.enabled !== undefined &&
      typeof override.enabled !== "boolean"
    ) {
      throw new Error(
        `Campaign state field "resources.${resourceId}.enabled" must be boolean.`,
      );
    }
    if (override.minimumClearance !== undefined)
      validateClearance(
        `resources.${resourceId}.minimumClearance`,
        override.minimumClearance,
      );
    for (const field of ["allowedDepartments", "allowedStatuses"]) {
      if (override[field] !== undefined)
        validateStringArray(
          `resources.${resourceId}.${field}`,
          override[field],
        );
    }
  }
  for (const [triggerId, history] of Object.entries(state.triggerHistory)) {
    requireObject(`triggerHistory.${triggerId}`, history);
    if (
      !Number.isInteger(history.count) ||
      history.count < 1 ||
      typeof history.executedAt !== "string"
    ) {
      throw new Error(
        `Campaign state trigger history "${triggerId}" is malformed.`,
      );
    }
  }
  for (const [uid, count] of Object.entries(state.scanCounts)) {
    if (!Number.isInteger(count) || count < 0)
      throw new Error(`Campaign state scan count for "${uid}" is invalid.`);
  }
  if (state.unlockedContent.some((id) => typeof id !== "string" || !id)) {
    throw new Error(
      "Campaign state unlocked content IDs must be non-empty strings.",
    );
  }
}

function validateFlagValue(name, value) {
  if (typeof name !== "string" || !name.trim())
    throw new Error("Campaign flag names must be non-empty strings.");
  if (
    value !== null &&
    typeof value !== "boolean" &&
    typeof value !== "string" &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`Campaign flag "${name}" must be a JSON-safe primitive.`);
  }
}

function requireObject(field, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Campaign state field "${field}" must be an object.`);
  }
}

function validateClearance(field, value) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(
      `Campaign state field "${field}" must be an integer from 0 to 9.`,
    );
  }
}

function validateResourceIds(field, values) {
  if (
    !Array.isArray(values) ||
    values.some(
      (id) => typeof id !== "string" || !RESOURCE_ID_PATTERN.test(id),
    ) ||
    new Set(values).size !== values.length
  ) {
    throw new Error(
      `Campaign state field "${field}" must contain unique valid resource IDs.`,
    );
  }
}

function validateStringArray(field, values) {
  if (
    !Array.isArray(values) ||
    (field.endsWith("allowedStatuses") && values.length === 0) ||
    values.some((value) => typeof value !== "string" || !value.trim()) ||
    new Set(values).size !== values.length
  ) {
    throw new Error(
      `Campaign state field "${field}" must contain unique non-empty strings.`,
    );
  }
}

async function writeAtomic(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, filePath);
}

function fileTimestamp() {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
}

function toPath(value) {
  return value instanceof URL ? fileURLToPath(value) : value;
}

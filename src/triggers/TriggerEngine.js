import { readFile } from "node:fs/promises";
import { ACCESS_REASON_CODES } from "../access/evaluateAccess.js";
import { normalizeUid } from "../nfc/uid.js";
import { mergeEmployee } from "../state/effectiveRecords.js";

export const TRIGGER_EVENTS = new Set([
  "BADGE_IDENTIFIED",
  "UNKNOWN_BADGE",
  "ACCESS_GRANTED",
  "ACCESS_DENIED",
  "NO_RESOURCE_SELECTED",
  "CONTENT_OPENED",
  "SUPERVISOR_ACTION",
]);

export const ACTION_TYPES = new Set([
  "DISPLAY_CONTENT",
  "DISPLAY_MESSAGE",
  "UNLOCK_CONTENT",
  "SET_FLAG",
  "INCREMENT_FLAG",
  "SET_EMPLOYEE_CLEARANCE",
  "SET_EMPLOYEE_STATUS",
  "ADD_EMPLOYEE_PERMISSION",
  "REMOVE_EMPLOYEE_PERMISSION",
  "SET_RESOURCE_ENABLED",
  "SET_RESOURCE_CLEARANCE",
  "PLAY_AUDIO",
  "DELAY",
]);

export class TriggerEngine {
  #triggers;
  #stateStore;
  #contentRegistry;
  #employees;
  #resources;
  #queue = Promise.resolve();

  constructor({ triggers, stateStore, contentRegistry, employees, resources }) {
    this.#triggers = triggers;
    this.#stateStore = stateStore;
    this.#contentRegistry = contentRegistry;
    this.#employees = employees;
    this.#resources = resources;
  }

  static async load(filePath, dependencies) {
    let source;
    try {
      source = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      throw new Error(`Could not load trigger registry: ${error.message}`);
    }
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(
        "Trigger registry must be a JSON object keyed by trigger ID.",
      );
    }
    const triggers = Object.entries(source).map(([id, trigger]) =>
      validateTrigger(id, trigger, dependencies),
    );
    triggers.sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    );
    return new TriggerEngine({ ...dependencies, triggers });
  }

  process(context) {
    const operation = this.#queue.then(() => this.#process(context));
    this.#queue = operation.catch(() => {});
    return operation;
  }

  async #process(context) {
    const effects = [];
    const supervisorEffects = [];
    const mutations = [];
    const executedTriggerIds = [];

    for (const trigger of this.#triggers) {
      const state = this.#stateStore.getState();
      if (!trigger.enabled || trigger.conditions.event !== context.event)
        continue;
      if (trigger.once && state.triggerHistory[trigger.id]) continue;
      if (!triggerMatches(trigger, context, state)) continue;

      const result = await this.#stateStore.mutate((draft) =>
        executeTrigger(trigger, context, draft, {
          contentRegistry: this.#contentRegistry,
          employees: this.#employees,
          resources: this.#resources,
        }),
      );
      effects.push(...result.effects);
      supervisorEffects.push(...result.supervisorEffects);
      mutations.push(...result.mutations);
      executedTriggerIds.push(trigger.id);
    }
    return { effects, supervisorEffects, mutations, executedTriggerIds };
  }
}

export function triggerMatches(trigger, context, state) {
  const condition = trigger.conditions;
  if (condition.event !== context.event) return false;
  for (const field of [
    "employeeId",
    "uid",
    "resourceId",
    "reasonCode",
    "employeeStatus",
    "simulated",
  ]) {
    const contextField =
      field === "employeeStatus" ? context.employee?.status : context[field];
    if (condition[field] !== undefined && condition[field] !== contextField)
      return false;
  }
  const clearance = context.employee?.clearance;
  if (
    condition.minimumEmployeeClearance !== undefined &&
    (clearance ?? -1) < condition.minimumEmployeeClearance
  )
    return false;
  if (
    condition.maximumEmployeeClearance !== undefined &&
    (clearance ?? 10) > condition.maximumEmployeeClearance
  )
    return false;
  if (
    condition.scanCountMinimum !== undefined &&
    context.scanCount < condition.scanCountMinimum
  )
    return false;
  if (
    condition.scanCountMaximum !== undefined &&
    context.scanCount > condition.scanCountMaximum
  )
    return false;
  if (condition.triggerPreviouslyExecuted !== undefined) {
    if (
      Boolean(state.triggerHistory[trigger.id]) !==
      condition.triggerPreviouslyExecuted
    )
      return false;
  }
  if (
    condition.contentUnlocked !== undefined &&
    !state.unlockedContent.includes(condition.contentUnlocked)
  )
    return false;
  if (!objectMatches(condition.flags, state.flags)) return false;
  const employeeFlags = context.employeeId
    ? (state.employees[context.employeeId]?.flags ?? {})
    : {};
  if (!objectMatches(condition.employeeFlags, employeeFlags)) return false;
  return true;
}

function executeTrigger(trigger, context, draft, dependencies) {
  const output = { effects: [], supervisorEffects: [], mutations: [] };
  let delayMs = 0;
  for (const action of trigger.actions) {
    if (action.type === "DELAY") {
      delayMs += action.milliseconds;
      continue;
    }
    actionHandlers[action.type](
      action,
      context,
      draft,
      dependencies,
      output,
      delayMs,
    );
  }
  draft.triggerHistory[trigger.id] = {
    executedAt: new Date().toISOString(),
    count: (draft.triggerHistory[trigger.id]?.count ?? 0) + 1,
    employeeId: context.employeeId ?? null,
    simulated: Boolean(context.simulated),
  };
  output.mutations.push({ event: "TRIGGER_EXECUTED", triggerId: trigger.id });
  return output;
}

const actionHandlers = {
  DISPLAY_CONTENT(
    action,
    _context,
    _draft,
    { contentRegistry },
    output,
    delayMs,
  ) {
    addEffect(output, {
      type: "DISPLAY_CONTENT",
      content: contentRegistry.findById(action.contentId),
      delayMs,
    });
  },
  DISPLAY_MESSAGE(action, _context, _draft, _dependencies, output, delayMs) {
    addEffect(output, {
      type: "DISPLAY_MESSAGE",
      content: {
        type: "message",
        title: action.title,
        classification: action.classification,
        audience: action.audience,
        body: [...action.body],
      },
      delayMs,
    });
  },
  UNLOCK_CONTENT(action, _context, draft, _dependencies, output) {
    if (!draft.unlockedContent.includes(action.contentId))
      draft.unlockedContent.push(action.contentId);
    output.mutations.push({
      event: "CONTENT_UNLOCKED",
      contentId: action.contentId,
    });
  },
  SET_FLAG(action, _context, draft, _dependencies, output) {
    draft.flags[action.flag] = action.value;
    output.mutations.push({ event: "FLAG_CHANGED", flag: action.flag });
  },
  INCREMENT_FLAG(action, _context, draft, _dependencies, output) {
    const current = draft.flags[action.flag] ?? 0;
    if (typeof current !== "number")
      throw new Error(`Cannot increment non-numeric flag "${action.flag}".`);
    draft.flags[action.flag] = current + action.amount;
    output.mutations.push({ event: "FLAG_CHANGED", flag: action.flag });
  },
  SET_EMPLOYEE_CLEARANCE(action, context, draft, _dependencies, output) {
    const employeeId = targetEmployee(action, context);
    employeeOverride(draft, employeeId).clearance = action.clearance;
    output.mutations.push({ event: "CLEARANCE_CHANGED", employeeId });
  },
  SET_EMPLOYEE_STATUS(action, context, draft, _dependencies, output) {
    const employeeId = targetEmployee(action, context);
    employeeOverride(draft, employeeId).status = action.status;
    output.mutations.push({ event: "EMPLOYEE_STATUS_CHANGED", employeeId });
  },
  ADD_EMPLOYEE_PERMISSION(action, context, draft, { employees }, output) {
    const employeeId = targetEmployee(action, context);
    const override = employeeOverride(draft, employeeId);
    const effective = mergeEmployee(employees.get(employeeId), override);
    const allow = new Set(effective.permissions.allow);
    const deny = new Set(effective.permissions.deny);
    const selected = action.permission === "allow" ? allow : deny;
    const opposite = action.permission === "allow" ? deny : allow;
    selected.add(action.resourceId);
    opposite.delete(action.resourceId);
    override.permissions = { allow: [...allow], deny: [...deny] };
    output.mutations.push({
      event: "PERMISSION_CHANGED",
      employeeId,
      resourceId: action.resourceId,
    });
  },
  REMOVE_EMPLOYEE_PERMISSION(action, context, draft, { employees }, output) {
    const employeeId = targetEmployee(action, context);
    const override = employeeOverride(draft, employeeId);
    const effective = mergeEmployee(employees.get(employeeId), override);
    effective.permissions[action.permission] = effective.permissions[
      action.permission
    ].filter((id) => id !== action.resourceId);
    override.permissions = effective.permissions;
    output.mutations.push({
      event: "PERMISSION_CHANGED",
      employeeId,
      resourceId: action.resourceId,
    });
  },
  SET_RESOURCE_ENABLED(action, _context, draft, _dependencies, output) {
    resourceOverride(draft, action.resourceId).enabled = action.enabled;
    output.mutations.push({
      event: "RESOURCE_CHANGED",
      resourceId: action.resourceId,
    });
  },
  SET_RESOURCE_CLEARANCE(action, _context, draft, _dependencies, output) {
    resourceOverride(draft, action.resourceId).minimumClearance =
      action.clearance;
    output.mutations.push({
      event: "RESOURCE_CHANGED",
      resourceId: action.resourceId,
    });
  },
  PLAY_AUDIO(action, _context, _draft, { contentRegistry }, output, delayMs) {
    addEffect(output, {
      type: "PLAY_AUDIO",
      content: contentRegistry.findById(action.contentId),
      delayMs,
    });
  },
};

function validateTrigger(id, trigger, dependencies) {
  if (!trigger || typeof trigger !== "object" || Array.isArray(trigger))
    fail(id, "record", "expected an object");
  if (typeof trigger.enabled !== "boolean")
    fail(id, "enabled", "expected a boolean");
  if (!Number.isInteger(trigger.priority))
    fail(id, "priority", "expected an integer");
  if (typeof trigger.once !== "boolean") fail(id, "once", "expected a boolean");
  validateConditions(id, trigger.conditions, dependencies);
  if (!Array.isArray(trigger.actions) || trigger.actions.length === 0)
    fail(id, "actions", "expected a non-empty array");
  let totalDelay = 0;
  trigger.actions.forEach((action, index) => {
    validateAction(id, action, `actions[${index}]`, dependencies);
    if (action.type === "DELAY") totalDelay += action.milliseconds;
  });
  if (totalDelay > 20000)
    fail(id, "actions", "total delay cannot exceed 20000 milliseconds");
  return {
    id,
    enabled: trigger.enabled,
    priority: trigger.priority,
    once: trigger.once,
    conditions: structuredClone(trigger.conditions),
    actions: structuredClone(trigger.actions),
  };
}

function validateConditions(
  id,
  condition,
  { employees, resources, contentRegistry },
) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition))
    fail(id, "conditions", "expected an object");
  if (!TRIGGER_EVENTS.has(condition.event))
    fail(id, "conditions.event", "unknown event");
  if (condition.employeeId && !employees.has(condition.employeeId))
    fail(id, "conditions.employeeId", "unknown employee");
  if (condition.resourceId && !resources.has(condition.resourceId))
    fail(id, "conditions.resourceId", "unknown resource");
  if (condition.reasonCode && !ACCESS_REASON_CODES.has(condition.reasonCode))
    fail(id, "conditions.reasonCode", "unknown reason code");
  if (condition.uid !== undefined) {
    try {
      normalizeUid(condition.uid);
    } catch {
      fail(id, "conditions.uid", "expected a valid badge UID");
    }
  }
  if (
    condition.employeeStatus !== undefined &&
    (typeof condition.employeeStatus !== "string" ||
      !condition.employeeStatus.trim())
  )
    fail(id, "conditions.employeeStatus", "expected a non-empty string");
  if (
    condition.simulated !== undefined &&
    typeof condition.simulated !== "boolean"
  )
    fail(id, "conditions.simulated", "expected a boolean");
  for (const field of [
    "minimumEmployeeClearance",
    "maximumEmployeeClearance",
    "scanCountMinimum",
    "scanCountMaximum",
  ]) {
    if (
      condition[field] !== undefined &&
      (!Number.isInteger(condition[field]) || condition[field] < 0)
    )
      fail(id, `conditions.${field}`, "expected a non-negative integer");
  }
  if (condition.minimumEmployeeClearance > condition.maximumEmployeeClearance)
    fail(id, "conditions", "minimum clearance exceeds maximum");
  if (condition.scanCountMinimum > condition.scanCountMaximum)
    fail(id, "conditions", "minimum scan count exceeds maximum");
  for (const field of ["flags", "employeeFlags"])
    validatePrimitiveObject(id, `conditions.${field}`, condition[field]);
  if (
    condition.triggerPreviouslyExecuted !== undefined &&
    typeof condition.triggerPreviouslyExecuted !== "boolean"
  )
    fail(id, "conditions.triggerPreviouslyExecuted", "expected a boolean");
  if (
    condition.contentUnlocked !== undefined &&
    !contentRegistry.findById(condition.contentUnlocked)
  )
    fail(id, "conditions.contentUnlocked", "unknown content");
}

function validateAction(
  id,
  action,
  field,
  { employees, resources, contentRegistry },
) {
  if (!action || typeof action !== "object" || !ACTION_TYPES.has(action.type))
    fail(id, `${field}.type`, "unknown action type");
  if (action.employeeId && !employees.has(action.employeeId))
    fail(id, `${field}.employeeId`, "unknown employee");
  if (action.resourceId && !resources.has(action.resourceId))
    fail(id, `${field}.resourceId`, "unknown resource");
  if (
    ["DISPLAY_CONTENT", "UNLOCK_CONTENT", "PLAY_AUDIO"].includes(action.type) &&
    !contentRegistry.findById(action.contentId)
  )
    fail(id, `${field}.contentId`, "unknown content");
  if (
    action.type === "PLAY_AUDIO" &&
    contentRegistry.findById(action.contentId)?.type !== "audio"
  )
    fail(id, `${field}.contentId`, "expected audio content");
  if (action.type === "DISPLAY_MESSAGE")
    validateInlineMessage(id, action, field);
  if (action.type === "SET_FLAG")
    validatePrimitive(id, `${field}.value`, action.value);
  if (
    ["SET_FLAG", "INCREMENT_FLAG"].includes(action.type) &&
    (typeof action.flag !== "string" || !action.flag.trim())
  )
    fail(id, `${field}.flag`, "expected a non-empty flag name");
  if (
    action.type === "INCREMENT_FLAG" &&
    (typeof action.amount !== "number" || !Number.isFinite(action.amount))
  )
    fail(id, `${field}.amount`, "expected a finite number");
  if (
    ["SET_EMPLOYEE_CLEARANCE", "SET_RESOURCE_CLEARANCE"].includes(
      action.type,
    ) &&
    (!Number.isInteger(action.clearance) ||
      action.clearance < 0 ||
      action.clearance > 9)
  )
    fail(id, `${field}.clearance`, "expected an integer from 0 to 9");
  if (
    action.type === "SET_EMPLOYEE_STATUS" &&
    (typeof action.status !== "string" || !action.status.trim())
  )
    fail(id, `${field}.status`, "expected a non-empty string");
  if (
    ["ADD_EMPLOYEE_PERMISSION", "REMOVE_EMPLOYEE_PERMISSION"].includes(
      action.type,
    ) &&
    !["allow", "deny"].includes(action.permission)
  )
    fail(id, `${field}.permission`, "expected allow or deny");
  if (
    [
      "ADD_EMPLOYEE_PERMISSION",
      "REMOVE_EMPLOYEE_PERMISSION",
      "SET_RESOURCE_ENABLED",
      "SET_RESOURCE_CLEARANCE",
    ].includes(action.type) &&
    !resources.has(action.resourceId)
  )
    fail(id, `${field}.resourceId`, "unknown resource");
  if (
    action.type === "SET_RESOURCE_ENABLED" &&
    typeof action.enabled !== "boolean"
  )
    fail(id, `${field}.enabled`, "expected a boolean");
  if (
    action.type === "DELAY" &&
    (!Number.isInteger(action.milliseconds) ||
      action.milliseconds < 0 ||
      action.milliseconds > 10000)
  )
    fail(id, `${field}.milliseconds`, "expected 0 through 10000");
}

function validateInlineMessage(id, action, field) {
  for (const name of ["title", "classification"])
    if (typeof action[name] !== "string" || !action[name].trim())
      fail(id, `${field}.${name}`, "expected a non-empty string");
  if (
    !["PUBLIC", "SCANNED_EMPLOYEE", "SUPERVISOR"].includes(
      action.audience ?? "PUBLIC",
    )
  )
    fail(id, `${field}.audience`, "invalid audience");
  if (
    !Array.isArray(action.body) ||
    !action.body.length ||
    action.body.some((line) => typeof line !== "string" || !line.trim())
  )
    fail(id, `${field}.body`, "expected non-empty strings");
  action.audience ??= "PUBLIC";
}

function addEffect(output, effect) {
  const destination =
    effect.content.audience === "SUPERVISOR"
      ? output.supervisorEffects
      : output.effects;
  destination.push(effect);
}

function targetEmployee(action, context) {
  const id = action.employeeId ?? context.employeeId;
  if (!id) throw new Error(`Action ${action.type} requires an employee.`);
  return id;
}

function employeeOverride(draft, id) {
  return (draft.employees[id] ??= {});
}

function resourceOverride(draft, id) {
  return (draft.resources[id] ??= {});
}

function objectMatches(expected, actual) {
  return (
    !expected ||
    Object.entries(expected).every(([key, value]) =>
      Object.is(actual[key], value),
    )
  );
}

function validatePrimitiveObject(id, field, value) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(id, field, "expected an object");
  for (const item of Object.values(value)) validatePrimitive(id, field, item);
}

function validatePrimitive(id, field, value) {
  if (value !== null && !["boolean", "number", "string"].includes(typeof value))
    fail(id, field, "expected a JSON-safe primitive");
}

function fail(id, field, message) {
  throw new Error(`Invalid trigger "${id}", field "${field}": ${message}.`);
}

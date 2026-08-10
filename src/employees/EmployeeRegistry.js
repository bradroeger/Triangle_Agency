import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeUid } from "../nfc/uid.js";
import { RESOURCE_ID_PATTERN } from "../resources/ResourceRegistry.js";

const stringFields = ["employeeId", "name", "department", "status"];
const optionalEmployeeFields = [
  "pronouns",
  "birthday",
  "nextOfKin",
  "manager",
  "hireDate",
  "employmentType",
  "workLocation",
  "phoneExtension",
  "payrollNumber",
  "anomalyType",
  "competencyType",
  "realityType",
  "entityType",
  "personnelNotes",
];
const employeeBooleanFields = [
  "nonHuman",
  "anomalousEmployee",
  "realityCompromised",
  "containmentRequired",
];
const dependantContactMethods = new Set([
  "telephone",
  "came-to-see-you",
  "please-call",
  "will-call",
  "wants-to-see-you",
  "left-package",
]);

export class EmployeeRegistry {
  #employees;
  #filePath;

  constructor(employees, filePath) {
    this.#employees = employees;
    this.#filePath = filePath;
  }

  static async load(filePath) {
    let contents;
    try {
      contents = await readFile(filePath, "utf8");
    } catch (error) {
      throw new Error(`Could not load employee registry: ${error.message}`);
    }

    let source;
    try {
      source = JSON.parse(contents);
    } catch (error) {
      throw new Error(
        `Employee registry contains invalid JSON: ${error.message}`,
      );
    }

    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(
        "Employee registry must be a JSON object keyed by badge UID.",
      );
    }

    const employees = new Map();
    for (const [rawUid, record] of Object.entries(source)) {
      let uid;
      try {
        uid = normalizeUid(rawUid);
      } catch (error) {
        throw new Error(`Invalid employee UID "${rawUid}": ${error.message}`);
      }
      if (employees.has(uid)) {
        throw new Error(`Duplicate normalized employee UID: ${uid}`);
      }
      employees.set(uid, validateRecord(uid, record));
    }

    return new EmployeeRegistry(employees, resolveFilePath(filePath));
  }

  findByUid(rawUid) {
    const uid = normalizeUid(rawUid);
    const employee = this.#employees.get(uid);
    return employee ? copyEmployee(employee) : null;
  }

  list() {
    return [...this.#employees.entries()].map(([uid, employee]) => ({
      uid,
      employee: copyEmployee(employee),
    }));
  }

  async add(rawUid, record) {
    const uid = normalizeUid(rawUid);
    if (this.#employees.has(uid)) {
      throw new Error(`Badge UID ${uid} is already assigned.`);
    }
    const employee = validateRecord(uid, record);
    if (
      [...this.#employees.values()].some(
        (existing) => existing.employeeId === employee.employeeId,
      )
    ) {
      throw new Error(`Employee number ${employee.employeeId} already exists.`);
    }

    const updated = new Map(this.#employees);
    updated.set(uid, employee);
    await persistEmployees(this.#filePath, updated);
    this.#employees = updated;
    return { uid, employee: copyEmployee(employee) };
  }

  get size() {
    return this.#employees.size;
  }
}

function validateRecord(uid, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(
      `Invalid employee record for UID ${uid}: record must be an object.`,
    );
  }

  const employee = {};
  for (const field of stringFields) {
    if (
      typeof record[field] !== "string" ||
      record[field].trim().length === 0
    ) {
      throw new Error(
        `Invalid employee record for UID ${uid}, field "${field}": expected a non-empty string.`,
      );
    }
    employee[field] = record[field].trim();
  }

  if (
    !Number.isInteger(record.clearance) ||
    record.clearance < 0 ||
    record.clearance > 9
  ) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "clearance": expected an integer from 0 to 9.`,
    );
  }
  employee.clearance = record.clearance;
  employee.role = optionalString(uid, record, "role", "UNASSIGNED");
  employee.anomalyDesignation = optionalString(
    uid,
    record,
    "anomalyDesignation",
    "NONE ASSIGNED",
  );
  employee.dependant = optionalString(
    uid,
    record,
    "dependant",
    "your registered dependant",
  );
  employee.dependantContact = validateDependantContact(
    uid,
    record.dependantContact,
  );
  employee.demerits = optionalCount(uid, record, "demerits");
  employee.commendations = optionalCount(uid, record, "commendations");
  employee.anomalyDanger = optionalRating(uid, record, "anomalyDanger", 1);
  employee.loyalty = optionalRating(uid, record, "loyalty", 5);
  for (const field of optionalEmployeeFields) {
    if (record[field] !== undefined) {
      employee[field] = optionalString(uid, record, field, "");
    }
  }
  for (const field of employeeBooleanFields) {
    if (record[field] !== undefined && typeof record[field] !== "boolean") {
      throw new Error(
        `Invalid employee record for UID ${uid}, field "${field}": expected a boolean.`,
      );
    }
    employee[field] = record[field] ?? false;
  }
  const permissions = validatePermissions(uid, record.permissions);
  if (permissions) employee.permissions = permissions;
  return Object.freeze(employee);
}

function optionalRating(uid, record, field, fallback) {
  const value = record[field] ?? fallback;
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "${field}": expected an integer from 1 to 9.`,
    );
  }
  return value;
}

function optionalString(uid, record, field, fallback) {
  if (record[field] === undefined) return fallback;
  if (typeof record[field] !== "string" || !record[field].trim()) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "${field}": expected a non-empty string.`,
    );
  }
  return record[field].trim();
}

function optionalCount(uid, record, field) {
  if (record[field] === undefined) return 0;
  if (!Number.isInteger(record[field]) || record[field] < 0) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "${field}": expected a non-negative integer.`,
    );
  }
  return record[field];
}

function validateDependantContact(uid, contact) {
  if (contact === undefined) {
    return Object.freeze({ methods: Object.freeze([]), urgent: false });
  }
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "dependantContact": expected an object.`,
    );
  }
  const methods = contact.methods ?? [];
  if (
    !Array.isArray(methods) ||
    methods.some((method) => !dependantContactMethods.has(method)) ||
    new Set(methods).size !== methods.length
  ) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "dependantContact.methods": expected unique supported contact methods.`,
    );
  }
  if (contact.urgent !== undefined && typeof contact.urgent !== "boolean") {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "dependantContact.urgent": expected a boolean.`,
    );
  }
  const result = {
    methods: Object.freeze([...methods]),
    urgent: contact.urgent ?? false,
  };
  if (contact.phone !== undefined) {
    if (typeof contact.phone !== "string" || !contact.phone.trim()) {
      throw new Error(
        `Invalid employee record for UID ${uid}, field "dependantContact.phone": expected a non-empty string.`,
      );
    }
    result.phone = contact.phone.trim();
  }
  return Object.freeze(result);
}

function validatePermissions(uid, permissions) {
  if (permissions === undefined) return undefined;
  if (
    !permissions ||
    typeof permissions !== "object" ||
    Array.isArray(permissions)
  ) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "permissions": expected an object.`,
    );
  }
  const allow = validatePermissionList(uid, permissions.allow ?? [], "allow");
  const deny = validatePermissionList(uid, permissions.deny ?? [], "deny");
  const overlap = allow.find((resourceId) => deny.includes(resourceId));
  if (overlap) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "permissions": resource "${overlap}" appears in allow and deny.`,
    );
  }
  return Object.freeze({
    allow: Object.freeze(allow),
    deny: Object.freeze(deny),
  });
}

function validatePermissionList(uid, value, type) {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "permissions.${type}": expected an array.`,
    );
  }
  if (
    value.some(
      (resourceId) =>
        typeof resourceId !== "string" || !RESOURCE_ID_PATTERN.test(resourceId),
    )
  ) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "permissions.${type}": expected valid resource IDs.`,
    );
  }
  if (new Set(value).size !== value.length) {
    throw new Error(
      `Invalid employee record for UID ${uid}, field "permissions.${type}": duplicate resource ID.`,
    );
  }
  return [...value];
}

function copyEmployee(employee) {
  return {
    ...employee,
    dependantContact: {
      ...employee.dependantContact,
      methods: [...employee.dependantContact.methods],
    },
    ...(employee.permissions && {
      permissions: {
        allow: [...employee.permissions.allow],
        deny: [...employee.permissions.deny],
      },
    }),
  };
}

function resolveFilePath(filePath) {
  return filePath instanceof URL
    ? fileURLToPath(filePath)
    : path.resolve(filePath);
}

async function persistEmployees(filePath, employees) {
  const source = Object.fromEntries(
    [...employees.entries()].map(([uid, employee]) => [
      uid,
      copyEmployee(employee),
    ]),
  );
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(source, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw new Error(`Could not save employee registry: ${error.message}`);
  }
}

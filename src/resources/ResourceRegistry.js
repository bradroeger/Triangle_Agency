import { readFile } from "node:fs/promises";

export const RESOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ResourceRegistry {
  #resources;

  constructor(resources) {
    this.#resources = resources;
  }

  static async load(filePath) {
    let contents;
    try {
      contents = await readFile(filePath, "utf8");
    } catch (error) {
      throw new Error(`Could not load resource registry: ${error.message}`);
    }

    let source;
    try {
      source = JSON.parse(contents);
    } catch (error) {
      throw new Error(
        `Resource registry contains invalid JSON: ${error.message}`,
      );
    }
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(
        "Resource registry must be a JSON object keyed by resource ID.",
      );
    }

    const resources = new Map();
    for (const [id, record] of Object.entries(source)) {
      if (!RESOURCE_ID_PATTERN.test(id)) {
        throw new Error(
          `Invalid resource ID "${id}": use lowercase letters, numbers, and hyphens only.`,
        );
      }
      resources.set(id, validateResource(id, record));
    }
    return new ResourceRegistry(resources);
  }

  findById(id) {
    const resource = this.#resources.get(id);
    return resource ? copyResource(resource) : null;
  }

  listSummaries() {
    return [...this.#resources.values()].map(copyResource);
  }

  validateEmployeePermissions(employees) {
    for (const { uid, employee } of employees) {
      for (const type of ["allow", "deny"]) {
        for (const resourceId of employee.permissions?.[type] ?? []) {
          if (!this.#resources.has(resourceId)) {
            throw new Error(
              `Invalid employee record for UID ${uid}, field "permissions.${type}": unknown resource "${resourceId}".`,
            );
          }
        }
      }
    }
  }
}

function validateResource(id, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Invalid resource "${id}": record must be an object.`);
  }
  requireString(id, record, "name", false);
  requireString(id, record, "description", true);
  if (
    !Number.isInteger(record.minimumClearance) ||
    record.minimumClearance < 0 ||
    record.minimumClearance > 9
  ) {
    fail(id, "minimumClearance", "expected an integer from 0 to 9");
  }
  const allowedDepartments = validateUniqueStrings(
    id,
    record,
    "allowedDepartments",
    true,
  );
  const allowedStatuses = validateUniqueStrings(
    id,
    record,
    "allowedStatuses",
    false,
  );
  if (typeof record.enabled !== "boolean")
    fail(id, "enabled", "expected a boolean");

  return Object.freeze({
    id,
    name: record.name.trim(),
    description: record.description,
    minimumClearance: record.minimumClearance,
    allowedDepartments: Object.freeze(allowedDepartments),
    allowedStatuses: Object.freeze(allowedStatuses),
    enabled: record.enabled,
  });
}

function requireString(id, record, field, allowEmpty) {
  if (
    typeof record[field] !== "string" ||
    (!allowEmpty && record[field].trim().length === 0)
  ) {
    fail(
      id,
      field,
      `expected ${allowEmpty ? "a string" : "a non-empty string"}`,
    );
  }
}

function validateUniqueStrings(id, record, field, allowEmpty) {
  const values = record[field];
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    fail(
      id,
      field,
      `expected ${allowEmpty ? "an array" : "a non-empty array"}`,
    );
  }
  if (
    values.some(
      (value) => typeof value !== "string" || value.trim().length === 0,
    )
  ) {
    fail(id, field, "entries must be non-empty strings");
  }
  const trimmed = values.map((value) => value.trim());
  if (new Set(trimmed).size !== trimmed.length)
    fail(id, field, "entries must be unique");
  return trimmed;
}

function fail(id, field, message) {
  throw new Error(`Invalid resource "${id}", field "${field}": ${message}.`);
}

function copyResource(resource) {
  return {
    ...resource,
    allowedDepartments: [...resource.allowedDepartments],
    allowedStatuses: [...resource.allowedStatuses],
  };
}

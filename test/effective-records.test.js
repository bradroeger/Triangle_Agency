import assert from "node:assert/strict";
import test from "node:test";
import { mergeEmployee, mergeResource } from "../src/state/effectiveRecords.js";

const employee = {
  employeeId: "TA-1",
  name: "Agent",
  department: "Ops",
  clearance: 1,
  status: "ACTIVE",
  permissions: { allow: ["archive"], deny: ["lift"] },
};
const resource = {
  id: "archive",
  name: "Archive",
  enabled: true,
  minimumClearance: 2,
  allowedDepartments: [],
  allowedStatuses: ["ACTIVE"],
};

test("merges employee clearance, status, and permission overrides", () => {
  assert.deepEqual(mergeEmployee(employee).permissions, employee.permissions);
  const effective = mergeEmployee(employee, {
    clearance: 4,
    status: "PROBATION",
    permissions: { allow: ["lift"], deny: [] },
  });
  assert.equal(effective.clearance, 4);
  assert.equal(effective.status, "PROBATION");
  assert.deepEqual(effective.permissions, { allow: ["lift"], deny: [] });
});

test("merges resource enabled and clearance overrides without mutating static data", () => {
  const unchanged = mergeResource(resource);
  assert.equal(unchanged.enabled, true);
  const effective = mergeResource(resource, {
    enabled: false,
    minimumClearance: 7,
  });
  assert.equal(effective.enabled, false);
  assert.equal(effective.minimumClearance, 7);
  effective.allowedStatuses.push("CHANGED");
  assert.deepEqual(resource.allowedStatuses, ["ACTIVE"]);
});

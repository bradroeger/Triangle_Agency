import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAccess,
  noResourceSelected,
} from "../src/access/evaluateAccess.js";

const employee = {
  employeeId: "TA-0417",
  name: "Agent Pendleton",
  department: "Containment",
  clearance: 3,
  status: "ACTIVE",
  permissions: { allow: [], deny: [] },
};
const resource = {
  id: "containment-floor",
  name: "Containment Floor",
  minimumClearance: 3,
  allowedDepartments: ["Containment"],
  allowedStatuses: ["ACTIVE"],
  enabled: true,
};

function decision(employeeChanges = {}, resourceChanges = {}) {
  return evaluateAccess(
    { ...employee, ...employeeChanges },
    { ...resource, ...resourceChanges },
  );
}

test("grants access when requirements are met", () => {
  assert.equal(decision().reasonCode, "REQUIREMENTS_MET");
  assert.equal(decision().granted, true);
});

test("denies a disabled resource first", () => {
  assert.equal(
    decision({}, { enabled: false }).reasonCode,
    "RESOURCE_DISABLED",
  );
});

test("honors explicit deny", () => {
  assert.equal(
    decision({ permissions: { allow: [], deny: ["containment-floor"] } })
      .reasonCode,
    "EXPLICITLY_DENIED",
  );
});

test("denies disallowed status, insufficient clearance, and restricted department", () => {
  assert.equal(
    decision({ status: "SUSPENDED" }).reasonCode,
    "STATUS_RESTRICTED",
  );
  assert.equal(decision({ clearance: 2 }).reasonCode, "INSUFFICIENT_CLEARANCE");
  assert.equal(
    decision({ department: "Acquisitions" }).reasonCode,
    "DEPARTMENT_RESTRICTED",
  );
});

test("an empty department restriction permits every department", () => {
  assert.equal(
    decision({ department: "Acquisitions" }, { allowedDepartments: [] })
      .granted,
    true,
  );
});

test("explicit allow grants only after mandatory requirements pass", () => {
  const permissions = { allow: ["containment-floor"], deny: [] };
  assert.equal(decision({ permissions }).reasonCode, "EXPLICITLY_ALLOWED");
  assert.equal(
    decision({ permissions, clearance: 1 }).reasonCode,
    "INSUFFICIENT_CLEARANCE",
  );
  assert.equal(
    decision({ permissions, status: "SUSPENDED" }).reasonCode,
    "STATUS_RESTRICTED",
  );
  assert.equal(
    decision({ permissions, department: "Acquisitions" }).reasonCode,
    "DEPARTMENT_RESTRICTED",
  );
});

test("returns stable results for unknown employee, unknown resource, and no selection", () => {
  assert.equal(evaluateAccess(null, resource).reasonCode, "UNKNOWN_EMPLOYEE");
  assert.equal(evaluateAccess(employee, null).reasonCode, "UNKNOWN_RESOURCE");
  assert.equal(noResourceSelected().reasonCode, "NO_RESOURCE_SELECTED");
});

test("returned decisions are immutable", () => {
  const accessDecision = decision();
  assert.throws(() => {
    accessDecision.granted = false;
  }, TypeError);
});

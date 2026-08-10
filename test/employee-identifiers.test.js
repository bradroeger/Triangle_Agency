import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmployeeNumber,
  generateBadgeUid,
  generatePayrollNumber,
} from "../src/employees/employeeIdentifiers.js";

test("buildEmployeeNumber encodes competency, danger, humanity, and loyalty", () => {
  assert.equal(
    buildEmployeeNumber({
      competencyType: "R&D",
      anomalyDanger: 7,
      nonHuman: false,
      loyalty: 4,
    }),
    "TA2714",
  );
  assert.equal(
    buildEmployeeNumber({
      competencyType: "Clown",
      anomalyDanger: 9,
      nonHuman: true,
      loyalty: 1,
    }),
    "TA9901",
  );
});

test("buildEmployeeNumber rejects invalid classifications", () => {
  assert.throws(
    () =>
      buildEmployeeNumber({
        competencyType: "Accountant",
        anomalyDanger: 1,
        nonHuman: false,
        loyalty: 5,
      }),
    /Competency/,
  );
  assert.throws(
    () =>
      buildEmployeeNumber({
        competencyType: "PR",
        anomalyDanger: 0,
        nonHuman: false,
        loyalty: 5,
      }),
    /danger/,
  );
});

test("generated identifiers use local valid formats", () => {
  assert.match(generateBadgeUid(), /^[0-9A-F]{14}$/);
  assert.match(generatePayrollNumber(), /^PAY-\d{10}$/);
});

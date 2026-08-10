import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { EmployeeRegistry } from "../src/employees/EmployeeRegistry.js";

const validEmployee = {
  employeeId: "TA-0417",
  name: "Agent Pendleton",
  department: "Containment",
  role: "UNASSIGNED",
  anomalyDesignation: "NONE ASSIGNED",
  dependant: "your registered dependant",
  dependantContact: { methods: [], urgent: false },
  nonHuman: false,
  anomalousEmployee: false,
  realityCompromised: false,
  containmentRequired: false,
  clearance: 2,
  status: "ACTIVE",
  demerits: 0,
  commendations: 0,
  anomalyDanger: 1,
  loyalty: 5,
};

async function loadRegistry(data) {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-employees-"));
  const file = path.join(directory, "employees.json");
  await writeFile(file, JSON.stringify(data));
  try {
    return await EmployeeRegistry.load(file);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("loads a valid registry, normalizes keys, and finds known UIDs", async () => {
  const registry = await loadRegistry({ "04:a7:81:2c": validEmployee });
  assert.equal(registry.size, 1);
  assert.deepEqual(registry.findByUid("04 A7 81 2C"), validEmployee);
});

test("returns null for an unknown UID", async () => {
  const registry = await loadRegistry({ A1B2C3D4: validEmployee });
  assert.equal(registry.findByUid("FFFFFFFF"), null);
});

test("adds an employee, persists it, and rejects duplicate identifiers", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-employees-"));
  const file = path.join(directory, "employees.json");
  await writeFile(file, JSON.stringify({ A1B2C3D4: validEmployee }));
  try {
    const registry = await EmployeeRegistry.load(file);
    const created = await registry.add("11:22:33:44", {
      ...validEmployee,
      employeeId: "TA-2048",
      name: "Agent Newhire",
      birthday: "1992-03-03",
      anomalyType: "RECURSIVE",
      competencyType: "FIELD",
      realityType: "CONSENSUAL",
      nonHuman: true,
    });
    assert.equal(created.uid, "11223344");
    assert.equal(registry.findByUid("11223344").name, "Agent Newhire");
    const reloaded = await EmployeeRegistry.load(file);
    assert.equal(reloaded.findByUid("11223344").birthday, "1992-03-03");
    assert.equal(reloaded.findByUid("11223344").nonHuman, true);
    await assert.rejects(
      registry.add("11:22:33:44", {
        ...validEmployee,
        employeeId: "TA-9998",
      }),
      /already assigned/,
    );
    await assert.rejects(
      registry.add("55:66:77:88", {
        ...validEmployee,
        employeeId: "TA-2048",
      }),
      /already exists/,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("loads an optional dependant name for personal messages", async () => {
  const registry = await loadRegistry({
    A1B2C3D4: { ...validEmployee, dependant: "Casey Pendleton" },
  });
  assert.equal(registry.findByUid("A1B2C3D4").dependant, "Casey Pendleton");
});

test("loads validated dependant contact instructions", async () => {
  const registry = await loadRegistry({
    A1B2C3D4: {
      ...validEmployee,
      dependantContact: {
        methods: ["telephone", "please-call"],
        phone: "555-0133",
        urgent: true,
      },
    },
  });
  assert.deepEqual(registry.findByUid("A1B2C3D4").dependantContact, {
    methods: ["telephone", "please-call"],
    phone: "555-0133",
    urgent: true,
  });
});

test("rejects unsupported dependant contact instructions", async () => {
  await assert.rejects(
    loadRegistry({
      A1B2C3D4: {
        ...validEmployee,
        dependantContact: { methods: ["carrier-pigeon"] },
      },
    }),
    /dependantContact.methods/,
  );
});

test("returned records cannot mutate stored employee data", async () => {
  const registry = await loadRegistry({ A1B2C3D4: validEmployee });
  const employee = registry.findByUid("A1B2C3D4");
  employee.name = "Changed";
  assert.equal(registry.findByUid("A1B2C3D4").name, "Agent Pendleton");
});

test("rejects invalid, duplicate, and conflicting employee permissions", async () => {
  await assert.rejects(
    loadRegistry({
      A1B2C3D4: {
        ...validEmployee,
        permissions: { allow: ["Bad ID"], deny: [] },
      },
    }),
    /permissions.allow/,
  );
  await assert.rejects(
    loadRegistry({
      A1B2C3D4: {
        ...validEmployee,
        permissions: { allow: ["secure-lift", "secure-lift"], deny: [] },
      },
    }),
    /duplicate resource ID/,
  );
  await assert.rejects(
    loadRegistry({
      A1B2C3D4: {
        ...validEmployee,
        permissions: { allow: ["secure-lift"], deny: ["secure-lift"] },
      },
    }),
    /appears in allow and deny/,
  );
});

test("rejects invalid and duplicate normalized UIDs", async () => {
  await assert.rejects(
    loadRegistry({ INVALID: validEmployee }),
    /Invalid employee UID/,
  );
  await assert.rejects(
    loadRegistry({ "04:A7": validEmployee, "04 A7": validEmployee }),
    /Duplicate normalized employee UID: 04A7/,
  );
});

for (const [description, change, expectedField] of [
  ["missing name", { name: undefined }, "name"],
  ["missing employee ID", { employeeId: undefined }, "employeeId"],
  ["invalid clearance", { clearance: 10 }, "clearance"],
  ["empty department", { department: " " }, "department"],
  ["empty status", { status: "" }, "status"],
  ["empty dependant", { dependant: " " }, "dependant"],
]) {
  test(`rejects a record with ${description}`, async () => {
    await assert.rejects(
      loadRegistry({ A1B2C3D4: { ...validEmployee, ...change } }),
      new RegExp(`UID A1B2C3D4, field "${expectedField}"`),
    );
  });
}

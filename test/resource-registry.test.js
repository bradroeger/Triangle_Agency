import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ResourceRegistry } from "../src/resources/ResourceRegistry.js";

const validResource = {
  name: "Evidence Archive",
  description: "Archived evidence.",
  minimumClearance: 2,
  allowedDepartments: [],
  allowedStatuses: ["ACTIVE"],
  enabled: true,
};

async function loadRegistry(data) {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-resources-"));
  const file = path.join(directory, "resources.json");
  await writeFile(file, JSON.stringify(data));
  try {
    return await ResourceRegistry.load(file);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("loads a valid registry and returns independent safe copies", async () => {
  const registry = await loadRegistry({ "evidence-archive": validResource });
  const found = registry.findById("evidence-archive");
  found.allowedStatuses.push("CHANGED");
  assert.deepEqual(registry.findById("evidence-archive").allowedStatuses, [
    "ACTIVE",
  ]);
  assert.equal(registry.listSummaries()[0].name, "Evidence Archive");
});

for (const [description, id, change, expected] of [
  ["invalid resource ID", "Bad ID", {}, /Invalid resource ID/],
  ["missing name", "valid-id", { name: "" }, /field "name"/],
  [
    "invalid clearance",
    "valid-id",
    { minimumClearance: 12 },
    /field "minimumClearance"/,
  ],
  [
    "duplicate departments",
    "valid-id",
    { allowedDepartments: ["Ops", "Ops"] },
    /field "allowedDepartments"/,
  ],
  [
    "duplicate statuses",
    "valid-id",
    { allowedStatuses: ["ACTIVE", "ACTIVE"] },
    /field "allowedStatuses"/,
  ],
  [
    "empty statuses",
    "valid-id",
    { allowedStatuses: [] },
    /field "allowedStatuses"/,
  ],
  ["invalid enabled value", "valid-id", { enabled: "yes" }, /field "enabled"/],
]) {
  test(`rejects ${description}`, async () => {
    await assert.rejects(
      loadRegistry({ [id]: { ...validResource, ...change } }),
      expected,
    );
  });
}

test("rejects unknown employee permission references", async () => {
  const registry = await loadRegistry({ "evidence-archive": validResource });
  assert.throws(
    () =>
      registry.validateEmployeePermissions([
        {
          uid: "A1B2C3D4",
          employee: { permissions: { allow: ["missing-room"], deny: [] } },
        },
      ]),
    /unknown resource "missing-room"/,
  );
});

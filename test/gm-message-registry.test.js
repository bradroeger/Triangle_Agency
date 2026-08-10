import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { GMMessageRegistry } from "../src/messages/GMMessageRegistry.js";

const ten = (prefix) =>
  Array.from({ length: 10 }, (_, index) => `${prefix} ${index + 1}`);
const validRegistry = {
  specific: { "TA-1": "Specific" },
  weights: { benign: 75, strange: 20, unhinged: 5 },
  defaults: {
    benign: ten("Benign"),
    strange: ten("Strange"),
    unhinged: ten("Unhinged"),
  },
};

async function load(data, random = () => 0) {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-messages-"));
  const file = path.join(directory, "messages.json");
  await writeFile(file, JSON.stringify(data));
  try {
    return await GMMessageRegistry.load(file, random);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("specific employee message takes priority", async () => {
  const registry = await load(validRegistry, () => 0.99);
  assert.deepEqual(registry.findForEmployee("TA-1"), {
    message: "Specific",
    category: "specific",
  });
});

test("selects deterministic benign, strange, and unhinged fallbacks by weight", async () => {
  const benign = await load(validRegistry, () => 0);
  assert.deepEqual(benign.findForEmployee("TA-X"), {
    message: "Benign 1",
    category: "benign",
  });
  const strange = await load(validRegistry, () => 0.8);
  assert.deepEqual(strange.findForEmployee("TA-X"), {
    message: "Strange 9",
    category: "strange",
  });
  const unhinged = await load(validRegistry, () => 0.99);
  assert.deepEqual(unhinged.findForEmployee("TA-X"), {
    message: "Unhinged 10",
    category: "unhinged",
  });
});

test("forces an unhinged message by the fourth sign-in without one", async () => {
  const registry = await load(validRegistry, () => 0);
  assert.equal(registry.findForEmployee("TA-X").category, "benign");
  assert.equal(registry.findForEmployee("TA-X").category, "benign");
  assert.equal(registry.findForEmployee("TA-X").category, "benign");
  assert.deepEqual(registry.findForEmployee("TA-X"), {
    message: "Unhinged 1",
    category: "unhinged",
  });
  assert.equal(registry.findForEmployee("TA-X").category, "benign");
});

test("the fourth sign-in guarantee also applies to specific employee messages", async () => {
  const registry = await load(validRegistry, () => 0);
  assert.equal(registry.findForEmployee("TA-1").category, "specific");
  assert.equal(registry.findForEmployee("TA-1").category, "specific");
  assert.equal(registry.findForEmployee("TA-1").category, "specific");
  assert.equal(registry.findForEmployee("TA-1").category, "unhinged");
});

test("rejects empty or incorrectly sized message pools", async () => {
  await assert.rejects(
    load({
      ...validRegistry,
      defaults: { ...validRegistry.defaults, benign: ["Only one"] },
    }),
    /exactly 10 messages/,
  );
  await assert.rejects(
    load({
      ...validRegistry,
      defaults: {
        ...validRegistry.defaults,
        strange: [...ten("X").slice(0, 9), ""],
      },
    }),
    /non-empty string/,
  );
});

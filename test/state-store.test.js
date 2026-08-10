import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { StateStore, createDefaultState } from "../src/state/StateStore.js";

async function workspace() {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-state-"));
  return { directory, file: path.join(directory, "state.json") };
}

test("creates and persists default state when missing", async () => {
  const area = await workspace();
  try {
    const store = await StateStore.load(area.file);
    assert.deepEqual(store.getState(), createDefaultState());
    await access(area.file);
  } finally {
    await rm(area.directory, { recursive: true });
  }
});

test("loads valid state and returns safe copies", async () => {
  const area = await workspace();
  try {
    const state = createDefaultState();
    state.flags.ready = true;
    await writeFile(area.file, JSON.stringify(state));
    const store = await StateStore.load(area.file);
    const copy = store.getState();
    copy.flags.ready = false;
    assert.equal(store.getFlag("ready"), true);
  } finally {
    await rm(area.directory, { recursive: true });
  }
});

test("rejects corrupt JSON and unsupported versions without overwriting", async () => {
  const area = await workspace();
  try {
    await writeFile(area.file, "{damaged");
    await assert.rejects(
      StateStore.load(area.file),
      /Could not load campaign state/,
    );
    assert.equal(await readFile(area.file, "utf8"), "{damaged");
    await writeFile(
      area.file,
      JSON.stringify({ ...createDefaultState(), version: 99 }),
    );
    await assert.rejects(
      StateStore.load(area.file),
      /Unsupported campaign state version 99/,
    );
  } finally {
    await rm(area.directory, { recursive: true });
  }
});

test("persists flags, overrides, unlocked content, and trigger history atomically", async () => {
  const area = await workspace();
  try {
    const store = await StateStore.load(area.file);
    await store.setFlag("count", 1);
    await store.incrementFlag("count", 2);
    await store.applyEmployeeOverride("TA-1", {
      clearance: 4,
      playwallDocuments: ["playwall-agency-a1"],
      seenPlaywallDocuments: ["playwall-agency-a1"],
      reminders: ["Complete mandatory corridor awareness training."],
    });
    await store.applyResourceOverride("archive", { enabled: false });
    await store.unlockContent("notice");
    await store.recordTrigger("first-event");
    const reloaded = await StateStore.load(area.file);
    assert.equal(reloaded.getFlag("count"), 3);
    assert.equal(reloaded.getEmployeeOverride("TA-1").clearance, 4);
    assert.deepEqual(reloaded.getEmployeeOverride("TA-1").playwallDocuments, [
      "playwall-agency-a1",
    ]);
    assert.deepEqual(
      reloaded.getEmployeeOverride("TA-1").seenPlaywallDocuments,
      ["playwall-agency-a1"],
    );
    assert.deepEqual(reloaded.getEmployeeOverride("TA-1").reminders, [
      "Complete mandatory corridor awareness training.",
    ]);
    assert.equal(reloaded.getResourceOverride("archive").enabled, false);
    assert.equal(reloaded.isContentUnlocked("notice"), true);
    assert.equal(reloaded.wasTriggerExecuted("first-event"), true);
    const temporaryFiles = (await import("node:fs/promises")).readdir(
      area.directory,
    );
    assert.equal(
      (await temporaryFiles).some((name) => name.endsWith(".tmp")),
      false,
    );
  } finally {
    await rm(area.directory, { recursive: true });
  }
});

test("creates a backup before reset and exports without overwriting", async () => {
  const area = await workspace();
  try {
    const store = await StateStore.load(area.file);
    await store.setFlag("important", true);
    const backup = await store.reset(path.join(area.directory, "backups"));
    assert.equal(
      JSON.parse(await readFile(backup, "utf8")).flags.important,
      true,
    );
    assert.deepEqual(store.getState(), createDefaultState());
    const exported = await store.exportTo(path.join(area.directory, "exports"));
    assert.equal(JSON.parse(await readFile(exported, "utf8")).version, 1);
  } finally {
    await rm(area.directory, { recursive: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { TerminalApplication } from "../src/application/TerminalApplication.js";
import { StateStore } from "../src/state/StateStore.js";
import {
  getProgressionDesignations,
  progressionTracks,
} from "../src/agent/trackDefinitions.js";

const playwall = JSON.parse(
  await readFile(new URL("../data/playwall-content.json", import.meta.url)),
);

test("every progression track has 30 boxes and linked designations resolve to Playwall files", () => {
  const contentDesignations = new Set(
    Object.keys(playwall).map((id) => id.split("-").at(-1)),
  );
  for (const track of progressionTracks) {
    assert.equal(track.labels.length, 30, `${track.name} box count`);
    for (const designation of track.labels.filter(Boolean)) {
      assert.ok(
        contentDesignations.has(designation.toLowerCase()),
        `${track.name} designation ${designation} has a Playwall file`,
      );
    }
  }
});

test("only reached labeled boxes are returned for automatic Playwall assignment", () => {
  assert.deepEqual([...getProgressionDesignations({ competency: 2 })], []);
  assert.deepEqual([...getProgressionDesignations({ competency: 3 })], ["a3"]);
  assert.deepEqual(
    [...getProgressionDesignations({ reality: 3, anomaly: 4 })].sort(),
    ["c4", "h3", "h4", "l11", "u2"],
  );
});

test("allocating a labeled box assigns its Playwall item to that agent", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-progress-"));
  try {
    const stateStore = await StateStore.load(
      path.join(directory, "state.json"),
    );
    const employee = {
      employeeId: "TA-1",
      name: "Agent Test",
      department: "Research",
      status: "ACTIVE",
      clearance: 1,
    };
    const contentRegistry = {
      listMetadata: () => Object.keys(playwall).map((id) => ({ id })),
      findById: (id) => (playwall[id] ? { id } : null),
    };
    const app = new TerminalApplication({
      employeeRegistry: {
        list: () => [{ employee, uid: "00000000" }],
      },
      resourceRegistry: { findById: () => null },
      contentRegistry,
      stateStore,
    });

    await app.setEmployeeProgress("TA-1", "competency", 3);
    assert.deepEqual(
      stateStore.getEmployeeOverride("TA-1").progressPlaywallDocuments,
      ["playwall-agency-a3"],
    );
    assert.equal(stateStore.isContentUnlocked("playwall-agency-a3"), true);

    await app.setEmployeeProgress("TA-1", "competency", 2);
    assert.deepEqual(
      stateStore.getEmployeeOverride("TA-1").playwallDocuments,
      [],
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

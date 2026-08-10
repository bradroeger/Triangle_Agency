import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { StateStore } from "../src/state/StateStore.js";
import {
  TriggerEngine,
  triggerMatches,
} from "../src/triggers/TriggerEngine.js";

const staticEmployee = {
  employeeId: "TA-1",
  name: "Agent",
  department: "Ops",
  clearance: 2,
  status: "ACTIVE",
  permissions: { allow: [], deny: [] },
};
const staticResource = {
  id: "archive",
  name: "Archive",
  description: "",
  minimumClearance: 2,
  allowedDepartments: [],
  allowedStatuses: ["ACTIVE"],
  enabled: true,
};
const content = {
  notice: {
    id: "notice",
    type: "message",
    title: "Notice",
    classification: "X",
    audience: "PUBLIC",
    body: ["Text"],
  },
  tone: {
    id: "tone",
    type: "audio",
    title: "Tone",
    audience: "PUBLIC",
    assetUrl: "/content-assets/tone",
  },
};

async function engineFor(triggers) {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-triggers-"));
  const triggerFile = path.join(directory, "triggers.json");
  await writeFile(triggerFile, JSON.stringify(triggers));
  const stateStore = await StateStore.load(path.join(directory, "state.json"));
  const dependencies = {
    stateStore,
    employees: new Map([["TA-1", staticEmployee]]),
    resources: new Map([["archive", staticResource]]),
    contentRegistry: { findById: (id) => structuredClone(content[id] ?? null) },
  };
  try {
    const engine = await TriggerEngine.load(triggerFile, dependencies);
    return { engine, stateStore, directory };
  } catch (error) {
    await rm(directory, { recursive: true });
    throw error;
  }
}

const event = {
  event: "ACCESS_GRANTED",
  employeeId: "TA-1",
  employee: staticEmployee,
  uid: "A1B2",
  resourceId: "archive",
  reasonCode: "REQUIREMENTS_MET",
  simulated: true,
  scanCount: 2,
};

test("matches event, identity, resource, reason, flags, employee flags, scan count, and simulation", () => {
  const trigger = {
    id: "match",
    conditions: {
      event: "ACCESS_GRANTED",
      employeeId: "TA-1",
      resourceId: "archive",
      reasonCode: "REQUIREMENTS_MET",
      simulated: true,
      scanCountMinimum: 2,
      scanCountMaximum: 2,
      flags: { ready: true },
      employeeFlags: { briefed: true },
    },
  };
  const state = {
    flags: { ready: true },
    employees: { "TA-1": { flags: { briefed: true } } },
    triggerHistory: {},
    unlockedContent: [],
  };
  assert.equal(triggerMatches(trigger, event, state), true);
  assert.equal(
    triggerMatches(trigger, { ...event, resourceId: "other" }, state),
    false,
  );
});

test("executes display and state actions in order with delayed effects", async () => {
  const actions = [
    { type: "UNLOCK_CONTENT", contentId: "notice" },
    { type: "DISPLAY_CONTENT", contentId: "notice" },
    { type: "DELAY", milliseconds: 50 },
    {
      type: "DISPLAY_MESSAGE",
      title: "Later",
      classification: "X",
      body: ["Message"],
    },
    { type: "PLAY_AUDIO", contentId: "tone" },
    { type: "SET_FLAG", flag: "count", value: 1 },
    { type: "INCREMENT_FLAG", flag: "count", amount: 2 },
    { type: "SET_EMPLOYEE_CLEARANCE", clearance: 4 },
    { type: "SET_EMPLOYEE_STATUS", status: "PROBATION" },
    {
      type: "ADD_EMPLOYEE_PERMISSION",
      permission: "allow",
      resourceId: "archive",
    },
    {
      type: "ADD_EMPLOYEE_PERMISSION",
      permission: "deny",
      resourceId: "archive",
    },
    {
      type: "REMOVE_EMPLOYEE_PERMISSION",
      permission: "deny",
      resourceId: "archive",
    },
    { type: "SET_RESOURCE_ENABLED", resourceId: "archive", enabled: false },
    { type: "SET_RESOURCE_CLEARANCE", resourceId: "archive", clearance: 7 },
  ];
  const setup = await engineFor({
    all: {
      enabled: true,
      priority: 1,
      once: false,
      conditions: { event: "ACCESS_GRANTED" },
      actions,
    },
  });
  try {
    const result = await setup.engine.process(event);
    assert.deepEqual(
      result.effects.map((effect) => effect.type),
      ["DISPLAY_CONTENT", "DISPLAY_MESSAGE", "PLAY_AUDIO"],
    );
    assert.deepEqual(
      result.effects.map((effect) => effect.delayMs),
      [0, 50, 50],
    );
    const state = setup.stateStore.getState();
    assert.equal(state.flags.count, 3);
    assert.equal(state.employees["TA-1"].clearance, 4);
    assert.equal(state.employees["TA-1"].status, "PROBATION");
    assert.deepEqual(state.employees["TA-1"].permissions.deny, []);
    assert.equal(state.resources.archive.enabled, false);
    assert.equal(state.resources.archive.minimumClearance, 7);
    assert.equal(state.unlockedContent.includes("notice"), true);
  } finally {
    await rm(setup.directory, { recursive: true });
  }
});

test("uses priority and trigger ID ordering, and later triggers see earlier state", async () => {
  const setup = await engineFor({
    zulu: {
      enabled: true,
      priority: 10,
      once: false,
      conditions: { event: "ACCESS_GRANTED" },
      actions: [{ type: "SET_FLAG", flag: "ready", value: true }],
    },
    alpha: {
      enabled: true,
      priority: 5,
      once: false,
      conditions: { event: "ACCESS_GRANTED", flags: { ready: true } },
      actions: [
        {
          type: "DISPLAY_MESSAGE",
          title: "Ready",
          classification: "X",
          body: ["Yes"],
        },
      ],
    },
  });
  try {
    const result = await setup.engine.process(event);
    assert.deepEqual(result.executedTriggerIds, ["zulu", "alpha"]);
  } finally {
    await rm(setup.directory, { recursive: true });
  }
});

test("once-only trigger cannot execute twice rapidly", async () => {
  const setup = await engineFor({
    once: {
      enabled: true,
      priority: 1,
      once: true,
      conditions: { event: "ACCESS_GRANTED" },
      actions: [{ type: "INCREMENT_FLAG", flag: "runs", amount: 1 }],
    },
  });
  try {
    await Promise.all([
      setup.engine.process(event),
      setup.engine.process(event),
    ]);
    assert.equal(setup.stateStore.getFlag("runs"), 1);
  } finally {
    await rm(setup.directory, { recursive: true });
  }
});

test("failed mutation does not mark trigger complete", async () => {
  const setup = await engineFor({
    broken: {
      enabled: true,
      priority: 1,
      once: true,
      conditions: { event: "ACCESS_GRANTED" },
      actions: [{ type: "INCREMENT_FLAG", flag: "bad", amount: 1 }],
    },
  });
  try {
    await setup.stateStore.setFlag("bad", "not numeric");
    await assert.rejects(setup.engine.process(event), /Cannot increment/);
    assert.equal(setup.stateStore.wasTriggerExecuted("broken"), false);
  } finally {
    await rm(setup.directory, { recursive: true });
  }
});

test("rejects unknown references, action types, and invalid delays", async () => {
  for (const action of [
    { type: "DISPLAY_CONTENT", contentId: "missing" },
    { type: "SET_RESOURCE_ENABLED", resourceId: "missing", enabled: true },
    { type: "SET_EMPLOYEE_CLEARANCE", employeeId: "missing", clearance: 2 },
    { type: "DELAY", milliseconds: 10001 },
    { type: "NOT_REAL" },
  ]) {
    await assert.rejects(
      engineFor({
        bad: {
          enabled: true,
          priority: 1,
          once: false,
          conditions: { event: "ACCESS_GRANTED" },
          actions: [action],
        },
      }),
      /Invalid trigger/,
    );
  }
});

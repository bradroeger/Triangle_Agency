import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AccessLogger } from "../src/access/AccessLogger.js";

test("creates a JSONL file and appends separate entries with simulated flags", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-log-"));
  const file = path.join(directory, "access-log.jsonl");
  try {
    const logger = new AccessLogger(file);
    await logger.append({
      timestamp: "2026-01-01T00:00:00.000Z",
      simulated: false,
    });
    await logger.append({
      timestamp: "2026-01-01T00:00:01.000Z",
      simulated: true,
    });
    const lines = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(lines.length, 2);
    assert.equal(lines[1].simulated, true);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("reports write failures for the application to recover from", async () => {
  const logger = new AccessLogger(
    path.join(tmpdir(), "missing-triangle-directory", "log.jsonl"),
  );
  await assert.rejects(
    logger.append({ ok: true }),
    /Could not append access log/,
  );
});

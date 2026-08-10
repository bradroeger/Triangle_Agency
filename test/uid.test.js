import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUid } from "../src/nfc/uid.js";

test("normalizes a Buffer UID", () => {
  assert.equal(normalizeUid(Buffer.from([0x04, 0xa7, 0x81, 0x2c])), "04A7812C");
});

test("normalizes string UIDs with supported separators", () => {
  assert.equal(normalizeUid("04:a7:81:2c"), "04A7812C");
  assert.equal(normalizeUid("04 A7 81 2C"), "04A7812C");
  assert.equal(normalizeUid("04-a7-81-2c"), "04A7812C");
});

test("rejects missing, empty, odd-length, and non-hex UIDs", () => {
  assert.throws(() => normalizeUid(), /required/);
  assert.throws(() => normalizeUid("  "), /empty/);
  assert.throws(() => normalizeUid("ABC"), /byte pairs/);
  assert.throws(() => normalizeUid("04-GG"), /hexadecimal/);
  assert.throws(() => normalizeUid(1234), /Buffer or string/);
});

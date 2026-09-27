import assert from "node:assert/strict";
import test from "node:test";
import { createOfficeQrSvg } from "../src/officeQr.js";

test("creates a red triangle QR with standard square finder markers", () => {
  const url = "http://192.168.1.20:3000/agent/TA-0001";
  const svg = createOfficeQrSvg(url);

  assert.match(
    svg,
    /<title>Agent portal: http:\/\/192\.168\.1\.20:3000\/agent\/TA-0001<\/title>/,
  );
  assert.match(svg, /fill="#ed1c24" d="M4 4h1v1h-1z/);
  assert.match(svg, /M\d+\.5 \d+\.02L\d+\.98 \d+\.94H\d+\.02z/);
  assert.match(svg, /fill="#fff9eb"/);
});

test("escapes URL text included in the SVG title", () => {
  const svg = createOfficeQrSvg("https://agency.test/agent/A&B");

  assert.match(
    svg,
    /<title>Agent portal: https:\/\/agency\.test\/agent\/A&amp;B<\/title>/,
  );
});

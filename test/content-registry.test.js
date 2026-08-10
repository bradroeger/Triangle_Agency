import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ContentRegistry } from "../src/content/ContentRegistry.js";

async function loadContent(data, assets = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "triangle-content-"));
  const assetDirectory = path.join(directory, "assets");
  await mkdir(assetDirectory);
  for (const [name, value] of Object.entries(assets))
    await writeFile(path.join(assetDirectory, name), value);
  const file = path.join(directory, "content.json");
  await writeFile(file, JSON.stringify(data));
  try {
    return await ContentRegistry.load(file, assetDirectory);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("loads message, document, image, and audio content with safe copies", async () => {
  const registry = await loadContent(
    {
      notice: {
        type: "message",
        title: "Notice",
        classification: "INTERNAL",
        body: ["Hello"],
      },
      manual: {
        type: "document",
        title: "Manual",
        classification: "PUBLIC",
        body: ["One"],
      },
      portrait: {
        type: "image",
        title: "Photo",
        classification: "SECRET",
        asset: "photo.png",
        alt: "Photo",
      },
      tone: { type: "audio", title: "Tone", asset: "tone.mp3" },
    },
    { "photo.png": "placeholder", "tone.mp3": "placeholder" },
  );
  const notice = registry.findById("notice");
  notice.body.push("Changed");
  assert.deepEqual(registry.findById("notice").body, ["Hello"]);
  assert.equal(
    registry.findById("portrait").assetUrl,
    "/content-assets/portrait",
  );
  assert.equal(registry.getAsset("tone").mimeType, "audio/mpeg");
});

test("rejects traversal, URLs, absolute paths, and missing assets", async () => {
  for (const asset of [
    "../secret.png",
    "https://example.com/a.png",
    "C:\\secret.png",
    "\\\\host\\file.png",
    "missing.png",
  ]) {
    await assert.rejects(
      loadContent({
        image: {
          type: "image",
          title: "Image",
          classification: "X",
          asset,
          alt: "x",
        },
      }),
      /field "asset"/,
    );
  }
});

test("rejects invalid type-specific content and audience", async () => {
  await assert.rejects(
    loadContent({
      bad: { type: "message", title: "X", classification: "X", body: [] },
    }),
    /field "body"/,
  );
  await assert.rejects(
    loadContent({
      bad: { type: "audio", title: "X", asset: "x.mp3", audience: "EVERYONE" },
    }),
    /field "audience"/,
  );
});

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESOURCE_ID_PATTERN } from "../resources/ResourceRegistry.js";

const contentTypes = new Set(["message", "document", "image", "audio"]);
const audiences = new Set(["PUBLIC", "SCANNED_EMPLOYEE", "SUPERVISOR"]);
const mimeTypes = new Map([
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
]);

export class ContentRegistry {
  #content;
  #assetDirectory;

  constructor(content, assetDirectory) {
    this.#content = content;
    this.#assetDirectory = assetDirectory;
  }

  static async load(filePath, assetDirectory) {
    const resolvedAssets = path.resolve(toPath(assetDirectory));
    const content = new Map();
    for (const sourcePath of Array.isArray(filePath) ? filePath : [filePath]) {
      let source;
      try {
        source = JSON.parse(await readFile(sourcePath, "utf8"));
      } catch (error) {
        throw new Error(`Could not load content registry: ${error.message}`);
      }
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error(
          "Content registry must be a JSON object keyed by content ID.",
        );
      }
      for (const [id, record] of Object.entries(source)) {
        if (!RESOURCE_ID_PATTERN.test(id))
          fail(id, "id", "use lowercase letters, numbers, and hyphens only");
        if (content.has(id))
          fail(id, "id", "duplicate content ID across registry files");
        content.set(id, await validateContent(id, record, resolvedAssets));
      }
    }
    return new ContentRegistry(content, resolvedAssets);
  }

  findById(id) {
    const item = this.#content.get(id);
    return item ? publicCopy(item) : null;
  }

  listMetadata() {
    return [...this.#content.values()].map(
      ({ id, type, title, classification, audience }) => ({
        id,
        type,
        title,
        ...(classification && { classification }),
        audience,
      }),
    );
  }

  getAsset(id) {
    const item = this.#content.get(id);
    if (!item?.asset) return null;
    return {
      filePath: path.join(this.#assetDirectory, item.asset),
      mimeType:
        mimeTypes.get(path.extname(item.asset).toLowerCase()) ??
        "application/octet-stream",
    };
  }
}

async function validateContent(id, record, assetDirectory) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    fail(id, "record", "expected an object");
  if (!contentTypes.has(record.type))
    fail(id, "type", "expected message, document, image, or audio");
  requireString(id, record, "title");
  const audience = record.audience ?? "PUBLIC";
  if (!audiences.has(audience))
    fail(id, "audience", "expected PUBLIC, SCANNED_EMPLOYEE, or SUPERVISOR");

  const item = { id, type: record.type, title: record.title.trim(), audience };
  if (record.type === "message" || record.type === "document") {
    requireString(id, record, "classification");
    if (
      !Array.isArray(record.body) ||
      record.body.length === 0 ||
      record.body.some(
        (line) => typeof line !== "string" || line.trim().length === 0,
      )
    ) {
      fail(id, "body", "expected a non-empty array of non-empty strings");
    }
    return Object.freeze({
      ...item,
      classification: record.classification.trim(),
      body: Object.freeze([...record.body]),
    });
  }

  requireString(id, record, "asset");
  const asset = validateAssetPath(id, record.asset, assetDirectory);
  await access(path.join(assetDirectory, asset)).catch((error) => {
    fail(id, "asset", `file is missing or inaccessible: ${error.message}`);
  });
  if (record.type === "image") {
    requireString(id, record, "classification");
    requireString(id, record, "alt");
    return Object.freeze({
      ...item,
      classification: record.classification.trim(),
      asset,
      alt: record.alt.trim(),
    });
  }
  return Object.freeze({ ...item, asset });
}

function validateAssetPath(id, asset, assetDirectory) {
  if (
    path.isAbsolute(asset) ||
    asset.startsWith("\\\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(asset) ||
    asset.split(/[\\/]/).includes("..")
  ) {
    fail(id, "asset", "must be a relative path beneath data/assets");
  }
  const resolved = path.resolve(assetDirectory, asset);
  if (
    resolved !== assetDirectory &&
    !resolved.startsWith(`${assetDirectory}${path.sep}`)
  ) {
    fail(id, "asset", "resolves outside data/assets");
  }
  return path.relative(assetDirectory, resolved);
}

function requireString(id, record, field) {
  if (typeof record[field] !== "string" || record[field].trim().length === 0) {
    fail(id, field, "expected a non-empty string");
  }
}

function fail(id, field, message) {
  throw new Error(`Invalid content "${id}", field "${field}": ${message}.`);
}

function publicCopy(item) {
  const copy = { ...item };
  if (item.body) copy.body = [...item.body];
  if (item.asset)
    copy.assetUrl = `/content-assets/${encodeURIComponent(item.id)}`;
  delete copy.asset;
  return copy;
}

function toPath(value) {
  return value instanceof URL ? fileURLToPath(value) : value;
}

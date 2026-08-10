export function normalizeUid(value) {
  if (value === null || value === undefined) {
    throw new TypeError("Badge UID is required.");
  }

  if (Buffer.isBuffer(value)) {
    if (value.length === 0) {
      throw new TypeError("Badge UID cannot be empty.");
    }
    return value.toString("hex").toUpperCase();
  }

  if (typeof value !== "string") {
    throw new TypeError("Badge UID must be a Buffer or string.");
  }

  const compact = value.replace(/[\s:-]/g, "");
  if (compact.length === 0) {
    throw new TypeError("Badge UID cannot be empty.");
  }
  if (!/^[0-9a-fA-F]+$/.test(compact)) {
    throw new TypeError(
      "Badge UID must contain only hexadecimal digits and separators.",
    );
  }
  if (compact.length % 2 !== 0) {
    throw new TypeError(
      "Badge UID must contain complete hexadecimal byte pairs.",
    );
  }

  return compact.toUpperCase();
}

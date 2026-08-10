import { randomBytes } from "node:crypto";

export const COMPETENCY_CODES = Object.freeze({
  PR: 1,
  "R&D": 2,
  Barista: 3,
  CEO: 4,
  Intern: 5,
  Gravedigger: 6,
  Reception: 7,
  Hotline: 8,
  Clown: 9,
});

export const ANOMALY_TYPES = Object.freeze([
  "Whisper",
  "Catalogue",
  "Drain",
  "Timepiece",
  "Growth",
  "Gun",
  "Dream",
  "Manifold",
  "Absence",
]);

export const REALITY_TYPES = Object.freeze([
  "Caretaker",
  "Overbooked",
  "Pursued",
  "Star",
  "Struggling",
  "Newborn",
  "Romantic",
  "Backbone",
  "Creature",
]);

export function buildEmployeeNumber({
  competencyType,
  anomalyDanger,
  nonHuman,
  loyalty,
}) {
  const competency = COMPETENCY_CODES[competencyType];
  if (!competency) throw new Error("Choose a valid Competency type.");
  requireRating("Anomaly danger", anomalyDanger);
  requireRating("Loyalty", loyalty);
  if (typeof nonHuman !== "boolean")
    throw new Error("Human status must be specified.");
  return `TA${competency}${anomalyDanger}${nonHuman ? 0 : 1}${loyalty}`;
}

export function generateBadgeUid() {
  return randomBytes(7).toString("hex").toUpperCase();
}

export function generatePayrollNumber() {
  return `PAY-${randomBytes(4).readUInt32BE().toString().padStart(10, "0")}`;
}

function requireRating(label, value) {
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new Error(`${label} must be an integer from 1 to 9.`);
  }
}

import { readFile } from "node:fs/promises";

const categories = ["benign", "strange", "unhinged"];

export class GMMessageRegistry {
  #specific;
  #defaults;
  #weights;
  #random;
  #signInsSinceUnhinged = 0;

  constructor({ specific, defaults, weights }, random = Math.random) {
    this.#specific = new Map(Object.entries(specific));
    this.#defaults = defaults;
    this.#weights = weights;
    this.#random = random;
  }

  static async load(filePath, random = Math.random) {
    let source;
    try {
      source = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      throw new Error(`Could not load GM message registry: ${error.message}`);
    }
    validateRegistry(source);
    return new GMMessageRegistry(source, random);
  }

  findForEmployee(employeeId) {
    const specific = this.#specific.get(employeeId);
    let selection;
    if (specific) {
      selection = { message: specific, category: "specific" };
    } else {
      const category = selectWeightedCategory(this.#weights, this.#random());
      selection = this.#selectDefault(category);
    }

    if (selection.category === "unhinged") {
      this.#signInsSinceUnhinged = 0;
      return selection;
    }

    this.#signInsSinceUnhinged += 1;
    if (this.#signInsSinceUnhinged < 4) return selection;

    this.#signInsSinceUnhinged = 0;
    return this.#selectDefault("unhinged");
  }

  #selectDefault(category) {
    const messages = this.#defaults[category];
    const index = Math.min(
      Math.floor(this.#random() * messages.length),
      messages.length - 1,
    );
    return { message: messages[index], category };
  }
}

function validateRegistry(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("GM message registry must be a JSON object.");
  }
  validateMessageObject(source.specific, "specific");
  if (
    !source.defaults ||
    typeof source.defaults !== "object" ||
    Array.isArray(source.defaults)
  ) {
    throw new Error('GM message registry field "defaults" must be an object.');
  }
  if (
    !source.weights ||
    typeof source.weights !== "object" ||
    Array.isArray(source.weights)
  ) {
    throw new Error('GM message registry field "weights" must be an object.');
  }
  for (const category of categories) {
    const messages = source.defaults[category];
    if (!Array.isArray(messages) || messages.length !== 10) {
      throw new Error(
        `GM message category "${category}" must contain exactly 10 messages.`,
      );
    }
    for (const message of messages)
      validateMessage(message, `defaults.${category}`);
    if (
      typeof source.weights[category] !== "number" ||
      source.weights[category] <= 0
    ) {
      throw new Error(
        `GM message weight "${category}" must be a positive number.`,
      );
    }
  }
}

function validateMessageObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GM message registry field "${field}" must be an object.`);
  }
  for (const [employeeId, message] of Object.entries(value)) {
    validateMessage(message, `${field}.${employeeId}`);
  }
}

function validateMessage(message, field) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error(
      `Invalid GM message at "${field}": expected a non-empty string.`,
    );
  }
}

function selectWeightedCategory(weights, roll) {
  const total = categories.reduce(
    (sum, category) => sum + weights[category],
    0,
  );
  let position = roll * total;
  for (const category of categories) {
    position -= weights[category];
    if (position < 0) return category;
  }
  return categories.at(-1);
}

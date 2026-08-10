import { AccessLogger } from "./AccessLogger.js";

export class CampaignEventLogger {
  #logger;

  constructor(filePath) {
    this.#logger = new AccessLogger(filePath);
  }

  append(event) {
    return this.#logger.append({
      timestamp: new Date().toISOString(),
      ...event,
    });
  }
}

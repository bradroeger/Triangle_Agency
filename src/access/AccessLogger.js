import { appendFile } from "node:fs/promises";

export class AccessLogger {
  #filePath;

  constructor(filePath) {
    this.#filePath = filePath;
  }

  async append(entry) {
    try {
      await appendFile(this.#filePath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      throw new Error(`Could not append access log: ${error.message}`);
    }
  }
}

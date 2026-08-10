import { fork } from "node:child_process";
import { EventEmitter } from "node:events";

export class NfcService extends EventEmitter {
  #worker;
  #stopping = false;

  start() {
    if (this.#worker) return;
    this.#stopping = false;
    this.#worker = fork(new URL("./nfc-worker.js", import.meta.url), [], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });

    this.#worker.on("message", (message) => {
      if (!message || typeof message.event !== "string") return;
      if (message.event === "error" || message.event === "buzzerError") {
        this.emit(message.event, new Error(message.data.message));
        return;
      }
      this.emit(message.event, message.data);
    });

    this.#worker.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) this.emit("error", new Error(`PC/SC process: ${message}`));
    });

    this.#worker.on("error", (error) => this.emit("error", error));
    this.#worker.on("exit", (code, signal) => {
      this.#worker = undefined;
      if (!this.#stopping) {
        this.emit(
          "error",
          new Error(
            `PC/SC process stopped unexpectedly (${signal || `exit ${code}`}).`,
          ),
        );
      }
    });
  }

  async stop() {
    const worker = this.#worker;
    if (!worker) return;
    this.#stopping = true;

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        worker.kill();
        resolve();
      }, 1500);
      timeout.unref();
      worker.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      worker.send({ command: "stop" }, (error) => {
        if (error && worker.connected) this.emit("error", error);
      });
    });
    this.#worker = undefined;
  }
}

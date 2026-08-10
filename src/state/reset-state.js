import { createInterface } from "node:readline/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { StateStore } from "./StateStore.js";

try {
  const automatic = process.argv.includes("--yes");
  if (!process.stdin.isTTY && !automatic) {
    throw new Error(
      "State reset requires an interactive terminal. For development only, pass --yes.",
    );
  }
  if (!automatic) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await prompt.question(
      "Type RESET to back up and reset runtime campaign state: ",
    );
    prompt.close();
    if (answer !== "RESET")
      throw new Error("Reset cancelled; confirmation did not match RESET.");
  }
  const store = await StateStore.load(
    new URL("../../data/state.json", import.meta.url),
  );
  const backup = await store.reset(
    fileURLToPath(new URL("../../backups/", import.meta.url)),
  );
  console.log(`Runtime state reset. Backup created: ${backup}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

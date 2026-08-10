import { StateStore } from "./StateStore.js";

try {
  const store = await StateStore.load(
    new URL("../../data/state.json", import.meta.url),
  );
  const state = store.getState();
  const onceOnlyExecutions = Object.values(state.triggerHistory).filter(
    (history) => history.count >= 1,
  ).length;
  console.log(`Campaign state version: ${state.version}`);
  console.log(`Flags: ${Object.keys(state.flags).length}`);
  console.log(`Employee overrides: ${Object.keys(state.employees).length}`);
  console.log(`Resource overrides: ${Object.keys(state.resources).length}`);
  console.log(`Unlocked content: ${state.unlockedContent.length}`);
  console.log(`Executed triggers: ${onceOnlyExecutions}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

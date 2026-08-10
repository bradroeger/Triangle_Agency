import assert from "node:assert/strict";
import test from "node:test";
import { InteractionEffectQueue } from "../src/public/InteractionEffectQueue.js";

test("badge removal cancellation prevents delayed effects", async () => {
  const queue = new InteractionEffectQueue();
  let displayed = false;
  queue.begin("first");
  queue.schedule({ delayMs: 20 }, () => {
    displayed = true;
  });
  queue.cancel();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(displayed, false);
});

test("a new interaction invalidates old effects while allowing current effects", async () => {
  const queue = new InteractionEffectQueue();
  const displayed = [];
  queue.begin("old");
  queue.schedule({ delayMs: 20, name: "old" }, (effect) =>
    displayed.push(effect.name),
  );
  queue.begin("new");
  queue.schedule({ delayMs: 5, name: "new" }, (effect) =>
    displayed.push(effect.name),
  );
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(displayed, ["new"]);
  assert.equal(queue.isActive("new"), true);
});

export class InteractionEffectQueue {
  #interactionId = null;
  #timers = new Set();

  begin(interactionId) {
    this.cancel();
    this.#interactionId = interactionId;
  }

  schedule(effect, callback) {
    const interactionId = this.#interactionId;
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      if (this.#interactionId === interactionId) callback(effect);
    }, effect.delayMs);
    this.#timers.add(timer);
  }

  cancel() {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#interactionId = null;
  }

  isActive(interactionId) {
    return this.#interactionId === interactionId;
  }
}

import { NFC } from "nfc-pcsc";
import { normalizeUid } from "./uid.js";

const readers = new Map();
let nextReaderId = 1;
const nfc = new NFC();

nfc.on("reader", connectReader);
nfc.on("error", (error) => sendError("error", error));

process.on("message", ({ command } = {}) => {
  if (command !== "stop") return;
  for (const reader of readers.keys()) {
    disconnectReader(reader);
    try {
      reader.close();
    } catch (error) {
      sendError("error", error);
    }
  }
  nfc.close();
  process.exit(0);
});

function connectReader(reader) {
  const state = {
    activeUid: null,
    readerId: `reader-${nextReaderId++}`,
    handlers: {},
  };
  state.handlers.card = (card) => void handleCard(reader, state, card);
  state.handlers.cardOff = () => handleCardRemoved(state);
  state.handlers.error = (error) => sendError("error", error, reader.name);
  state.handlers.end = () => disconnectReader(reader);

  reader.on("card", state.handlers.card);
  reader.on("card.off", state.handlers.cardOff);
  reader.on("error", state.handlers.error);
  reader.on("end", state.handlers.end);
  readers.set(reader, state);
  send("readerConnected", { readerId: state.readerId, name: reader.name });
}

async function handleCard(reader, state, card) {
  try {
    const uid = normalizeUid(card.uid);
    if (state.activeUid === uid) return;
    state.activeUid = uid;
    send("badgeScanned", { readerId: state.readerId, uid, simulated: false });
    await playOnboardBuzzer(reader);
  } catch (error) {
    sendError(
      "error",
      new Error(`Could not read badge: ${error.message}`),
      reader.name,
    );
  }
}

function handleCardRemoved(state) {
  if (!state.activeUid) return;
  const uid = state.activeUid;
  state.activeUid = null;
  send("badgeRemoved", { readerId: state.readerId, uid });
}

function disconnectReader(reader) {
  const state = readers.get(reader);
  if (!state) return;
  if (state.activeUid) handleCardRemoved(state);
  reader.removeListener("card", state.handlers.card);
  reader.removeListener("card.off", state.handlers.cardOff);
  reader.removeListener("error", state.handlers.error);
  reader.removeListener("end", state.handlers.end);
  readers.delete(reader);
  send("readerDisconnected", { readerId: state.readerId, name: reader.name });
}

async function playOnboardBuzzer(reader) {
  if (!/ACR122/i.test(reader.name)) return;
  try {
    // ACS-specific ACR122U direct command. Other PC/SC readers must not receive it.
    await reader.transmit(Buffer.from([0xff, 0x00, 0x52, 0x00, 0x00]), 2);
  } catch (error) {
    sendError(
      "buzzerError",
      new Error(`Onboard buzzer failed: ${error.message}`),
      reader.name,
    );
  }
}

function send(event, data) {
  if (process.connected) process.send({ event, data });
}

function sendError(event, error, readerName) {
  const prefix = readerName ? `${readerName}: ` : "";
  send(event, { message: `${prefix}${error.message}` });
}

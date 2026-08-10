const socket = io();
const waiting = document.querySelector("#waiting");
const record = document.querySelector("#record");
const unknown = document.querySelector("#unknown");
const debugToggle = document.querySelector("#debug-toggle");
const debugReveal = document.querySelector("#debug-reveal");
const debugPanel = document.querySelector("#debug-panel");
const debugUid = document.querySelector("#debug-uid");
const debugPresent = document.querySelector("#debug-present");
const debugRemove = document.querySelector("#debug-remove");
const officeAudio = document.querySelector("#office-audio");
const crashOverlay = document.querySelector("#crash-overlay");
const crashEye = document.querySelector("#crash-eye");
const errorStorm = document.querySelector("#error-storm");
const eyeWarning = document.querySelector("#eye-warning");
const gmEye = document.querySelector("#gm-eye");
const blackout = document.querySelector("#blackout");
const rebootText = document.querySelector("#reboot-text");
const recoveryTerminals = document.querySelector("#recovery-terminals");
const matrixRain = document.querySelector("#matrix-rain");
const crtGhostEye = document.querySelector(".crt-ghost-eye");
const presenceImage = document.querySelector(".presence-image");
const staticTear = document.querySelector("#static-tear");
const unresolvedFiles = document.querySelector("#unresolved-files");
const unresolvedFilesCount = document.querySelector("#unresolved-files-count");
const unresolvedFilesList = document.querySelector("#unresolved-files-list");
const anomalousFiles = document.querySelector("#anomalous-files");
const anomalousFilesCount = document.querySelector("#anomalous-files-count");
const anomalousFilesList = document.querySelector("#anomalous-files-list");
const personalMessage = document.querySelector("#personal-message");
const personalMessageText = document.querySelector("#personal-message-text");
let anomalyTimers = [];
let matrixAnimationFrame;
let matrixDrops = [];
let matrixLastFrame = 0;
let staticTearFrame;
let staticTearLastFrame = 0;
let binaryEyeFrame;
let binaryEyeLastFrame = 0;
let previousPresenceImage = 0;
let activeDependant = "your registered dependant";
let officeAudioContext;
let scanningAudio;
let speechTimer;
let speechRevision = 0;
let lastSpokenSignature = "";
const speechAudioNodes = new Set();
const speechAudioTimers = new Set();
const activeAssetAudio = new Set();

for (const eventName of ["pointerdown", "keydown"]) {
  window.addEventListener(eventName, activateDefaultAudio, { once: true });
}

debugReveal.addEventListener("click", () => {
  debugToggle.hidden = false;
  debugToggle.focus();
});

installRedThreeTreatment();
const audioAssets = {
  error: "/content-assets/office-error-popup",
  static: "/content-assets/office-eye-static",
  swoosh: "/content-assets/office-eye-swoosh",
  terminalOpen: "/content-assets/office-terminal-open",
  scanning: "/content-assets/office-terminal-scanning",
  bootUp: "/content-assets/office-boot-up",
  errorLoop: "/content-assets/office-error-loop",
  bootupScreen: "/content-assets/office-bootup-screen",
};

officeAudio.addEventListener("click", async () => {
  const enabled = officeAudio.getAttribute("aria-pressed") !== "true";
  if (enabled) {
    officeAudioContext ||= new AudioContext();
    await officeAudioContext.resume();
    for (const source of Object.values(audioAssets)) {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.load();
    }
  } else {
    await officeAudioContext?.suspend();
    cancelSpeech();
  }
  officeAudio.setAttribute("aria-pressed", String(enabled));
  officeAudio.textContent = enabled ? "DISABLE AUDIO" : "ENABLE AUDIO";
  officeAudio.classList.toggle("enabled", enabled);
});

async function activateDefaultAudio() {
  if (officeAudio.getAttribute("aria-pressed") !== "true") return;
  try {
    officeAudioContext ||= new AudioContext();
    await officeAudioContext.resume();
    for (const source of Object.values(audioAssets)) {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.load();
    }
  } catch {
    officeAudio.setAttribute("aria-pressed", "false");
    officeAudio.textContent = "ENABLE AUDIO";
  }
}

debugToggle.addEventListener("click", async () => {
  const enabled = debugToggle.getAttribute("aria-pressed") !== "true";
  try {
    await postJson("/__test-mode", { enabled });
    setDebugMode(enabled);
  } catch (error) {
    showDebugError(error.message);
  }
});

debugPresent.addEventListener("click", async () => {
  try {
    if (officeAudio.getAttribute("aria-pressed") === "true") {
      await officeAudioContext?.resume();
    }
    await postJson("/__simulate", { uid: debugUid.value });
  } catch (error) {
    showDebugError(error.message);
  }
});

debugRemove.addEventListener("click", async () => {
  try {
    await postJson("/__simulate/remove", {});
  } catch (error) {
    showDebugError(error.message);
  }
});

debugUid.addEventListener("keydown", (event) => {
  if (event.key === "Enter") debugPresent.click();
});

socket.on("terminal-state", ({ badge, testMode }) => {
  setDebugMode(testMode);
  if (badge?.employee) {
    showEmployee(
      badge.employee,
      badge.gmMessage ?? "",
      badge.gmMessageCategory ?? "specific",
      badge.unresolvedFiles ?? [],
      badge.reminders ?? [],
    );
  } else if (badge) showUnknown();
});
socket.on("test-mode-status", ({ enabled }) => setDebugMode(enabled));
socket.on(
  "office-identification",
  ({
    employee,
    gmMessage,
    gmMessageCategory,
    unresolvedFiles: files,
    reminders,
  }) => {
    playConfirmationTone();
    showEmployee(employee, gmMessage, gmMessageCategory, files, reminders);
  },
);
socket.on("office-files-updated", ({ unresolvedFiles: files }) => {
  showUnresolvedFiles(files, activeDependant);
});
socket.on("break-room-notification", ({ count, dependant }) => {
  if (count > 0) showPersonalMessage(dependant);
  else hidePersonalMessage();
});
socket.on("office-unknown", () => {
  showUnknown();
});

function showUnknown() {
  cancelAnomalySequence();
  lastSpokenSignature = "";
  waiting.hidden = true;
  record.hidden = true;
  unknown.hidden = false;
}
socket.on("display-reset", reset);

function showEmployee(
  employee,
  gmMessage,
  gmMessageCategory,
  files = [],
  reminders = [],
) {
  cancelAnomalySequence();
  const values = {
    name: employee.name,
    number: employee.employeeNumber ?? employee.employeeId,
    role: employee.role,
    anomaly: employee.anomalyDesignation,
    clearance: `LEVEL ${employee.clearance}`,
    department: employee.department,
    demerits: employee.demerits,
    commendations: employee.commendations,
    "gm-message": gmMessage,
  };
  activeDependant = employee.dependant;
  for (const [id, value] of Object.entries(values)) {
    document.querySelector(`#${id}`).textContent = value;
  }
  waiting.hidden = true;
  unknown.hidden = true;
  record.hidden = false;
  showUnresolvedFiles(files, activeDependant);
  gmEye.hidden = gmMessageCategory !== "unhinged";
  scheduleSpokenGreeting({
    employee,
    gmMessage,
    gmMessageCategory,
    files,
    reminders,
  });
  if (gmMessageCategory === "unhinged") startAnomalySequence();
}

function reset() {
  cancelAnomalySequence();
  lastSpokenSignature = "";
  record.hidden = true;
  unknown.hidden = true;
  waiting.hidden = false;
  gmEye.hidden = true;
  activeDependant = "your registered dependant";
  hidePersonalMessage();
  showUnresolvedFiles([]);
  waiting.textContent = "PRESENT EMPLOYEE IDENTIFICATION";
}

function showUnresolvedFiles(files = [], dependant = activeDependant) {
  const agencyFiles = files.filter((file) => file.category === "agency");
  const anomalyFiles = files.filter((file) => file.category === "anomaly");
  const realityFiles = files.filter((file) => file.category === "reality");
  unresolvedFiles.hidden = agencyFiles.length === 0;
  unresolvedFilesCount.textContent = `${agencyFiles.length} FILE${agencyFiles.length === 1 ? "" : "S"} REQUIRE REVIEW`;
  unresolvedFilesList.textContent = agencyFiles
    .map((file) => `${file.designation} [RED] — ${file.title}`)
    .join(" // ");
  anomalousFiles.hidden = anomalyFiles.length === 0;
  anomalousFilesCount.textContent = `${anomalyFiles.length} UNRESOLVED FILE${anomalyFiles.length === 1 ? "" : "S"}`;
  anomalousFilesList.textContent = anomalyFiles
    .map((file) => `${file.designation} // ${file.title}`)
    .join("     ");
  if (realityFiles.length > 0) showPersonalMessage(dependant);
  else hidePersonalMessage();
}

function showPersonalMessage(dependant = activeDependant) {
  personalMessage.hidden = false;
  personalMessageText.textContent = `You have a message waiting for you from ${dependant}. Please remember that company time is not for personal matters.`;
}

function hidePersonalMessage() {
  personalMessage.hidden = true;
  personalMessageText.textContent = "";
}

function scheduleSpokenGreeting(context) {
  if (officeAudio.getAttribute("aria-pressed") !== "true") return;
  const signature = JSON.stringify([
    context.employee.employeeId,
    context.gmMessage,
    context.gmMessageCategory,
    context.files.map((file) => file.id ?? file.designation),
    context.reminders,
  ]);
  if (signature === lastSpokenSignature) return;
  lastSpokenSignature = signature;
  const revision = speechRevision;
  speechTimer = setTimeout(() => {
    if (revision === speechRevision) speakOfficeGreeting(context);
  }, 720);
}

function speakOfficeGreeting({
  employee,
  gmMessage,
  gmMessageCategory,
  files = [],
  reminders = [],
}) {
  if (
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    return;
  }

  const greeting = `Good morning, ${employee.name}.`;
  const phrases = [greeting];
  const hasBlueFile = files.some((file) => file.category === "anomaly");

  if (hasBlueFile) {
    speakBlueFileInterruption(greeting);
    return;
  }

  for (const [index, reminder] of reminders.entries()) {
    phrases.push(`Reminder ${index + 1}. ${reminder}`);
  }

  const personnelFiles = files.filter((file) => file.category === "agency");
  if (personnelFiles.length > 0) {
    phrases.push(
      `You have ${personnelFiles.length} unread Personnel Records ${
        personnelFiles.length === 1 ? "file" : "files"
      }.`,
    );
  }

  if (gmMessageCategory === "unhinged" && gmMessage) {
    speakBrokenManagementMessage(phrases.join(" "), gmMessage);
    return;
  }

  if (gmMessage) {
    phrases.push(`Message from Management. ${gmMessage}`);
  }

  const utterance = new SpeechSynthesisUtterance(phrases.join(" "));
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = selectStandardVoice(voices);
  utterance.rate = 0.92;
  utterance.pitch = 0.94;
  utterance.volume = 0.9;
  utterance.onstart = () => playTannoyTransmission(estimateSpeechTime(phrases));
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function speakBrokenManagementMessage(introduction, gmMessage) {
  const voices = window.speechSynthesis.getVoices();
  const standardVoice = selectStandardVoice(voices);
  const introductionUtterance = new SpeechSynthesisUtterance(introduction);
  introductionUtterance.voice = standardVoice;
  introductionUtterance.rate = 0.92;
  introductionUtterance.pitch = 0.94;
  introductionUtterance.onstart = () => playTannoyTransmission(3.2);

  const message = new SpeechSynthesisUtterance(
    `Message from Management... ${gmMessage}`,
  );
  message.voice = selectAnomalousVoice(voices, standardVoice);
  message.rate = 0.7;
  message.pitch = 0.56;
  message.onstart = () => playTannoyTransmission(6.5, true);

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(introductionUtterance);
  window.speechSynthesis.speak(message);
}

function speakBlueFileInterruption(greeting) {
  const voices = window.speechSynthesis.getVoices();
  const standardVoice = selectStandardVoice(voices);
  const greetingUtterance = new SpeechSynthesisUtterance(greeting);
  greetingUtterance.voice = standardVoice;
  greetingUtterance.rate = 0.92;
  greetingUtterance.pitch = 0.94;
  greetingUtterance.volume = 0.9;

  const blueUtterance = new SpeechSynthesisUtterance(
    "There isssss sommmmmething waaaaiting forrr you... D-D-D-D-D-Don't let them...",
  );
  blueUtterance.voice = selectAnomalousVoice(voices, standardVoice);
  blueUtterance.rate = 0.68;
  blueUtterance.pitch = 0.54;
  blueUtterance.volume = 0.94;
  blueUtterance.onstart = () => playTannoyTransmission(5.8, true);

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(greetingUtterance);
  window.speechSynthesis.speak(blueUtterance);
}

function selectStandardVoice(voices) {
  return (
    voices.find(
      (voice) => voice.name.includes("Microsoft") && voice.lang === "en-GB",
    ) ??
    voices.find((voice) => voice.name.includes("Microsoft")) ??
    voices.find((voice) => voice.lang.startsWith("en")) ??
    null
  );
}

function selectAnomalousVoice(voices, standardVoice) {
  return (
    voices.find(
      (voice) => voice !== standardVoice && voice.lang.startsWith("en"),
    ) ?? standardVoice
  );
}

function estimateSpeechTime(phrases) {
  return Math.max(2.5, phrases.join(" ").split(/\s+/).length * 0.42);
}

function playTannoyTransmission(duration, broken = false) {
  if (!officeAudioContext || officeAudioContext.state !== "running") return;

  const sampleRate = officeAudioContext.sampleRate;
  const noiseBuffer = officeAudioContext.createBuffer(
    1,
    sampleRate * duration,
    sampleRate,
  );
  const samples = noiseBuffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    const gate =
      broken && Math.sin(index / 137) > 0.72 ? 1 : broken ? 0.12 : 0.22;
    samples[index] = (Math.random() * 2 - 1) * gate;
  }

  const noise = officeAudioContext.createBufferSource();
  const filter = officeAudioContext.createBiquadFilter();
  const gain = officeAudioContext.createGain();
  noise.buffer = noiseBuffer;
  filter.type = "bandpass";
  filter.frequency.value = 1450;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(
    broken ? 0.022 : 0.009,
    officeAudioContext.currentTime,
  );
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    officeAudioContext.currentTime + duration,
  );
  noise.connect(filter).connect(gain).connect(officeAudioContext.destination);
  noise.start();
  speechAudioNodes.add(noise);

  const hum = officeAudioContext.createOscillator();
  const humGain = officeAudioContext.createGain();
  hum.type = "sine";
  hum.frequency.value = 60;
  humGain.gain.value = broken ? 0.012 : 0.006;
  hum.connect(humGain).connect(officeAudioContext.destination);
  hum.start();
  speechAudioNodes.add(hum);

  const timer = setTimeout(() => {
    stopSpeechAudioNode(noise);
    stopSpeechAudioNode(hum);
    speechAudioTimers.delete(timer);
  }, duration * 1000);
  speechAudioTimers.add(timer);
}

function stopSpeechAudioNode(node) {
  try {
    node.stop();
    node.disconnect();
  } catch {
    // The short-lived transmission may already have stopped naturally.
  }
  speechAudioNodes.delete(node);
}

function cancelSpeech() {
  speechRevision += 1;
  clearTimeout(speechTimer);
  speechTimer = undefined;
  window.speechSynthesis?.cancel();
  for (const timer of speechAudioTimers) clearTimeout(timer);
  speechAudioTimers.clear();
  for (const node of speechAudioNodes) stopSpeechAudioNode(node);
}

function startAnomalySequence() {
  // The incident takes exclusive control of the audio channel immediately.
  cancelSpeech();
  selectPresenceImage();
  document.body.classList.add("anomaly-signal");
  playAsset("static", 0.3, playStaticFallback, { loop: true });
  buildErrorStorm();
  anomalyTimers.push(
    setTimeout(() => {
      document.body.classList.add("terminal-impact");
      crashOverlay.hidden = false;
      crashOverlay.className = "crash-overlay error-phase";
      revealErrorWindows();
      playAsset("errorLoop", 0.34, undefined, { loop: true });
    }, 2200),
    setTimeout(() => {
      document.body.classList.remove("terminal-impact");
      crashOverlay.className = "crash-overlay colour-phase eye-slit";
      startStaticTear();
      startBinaryEye();
      playAsset("swoosh", 0.65);
      playAsset("static", 0.68, playStaticFallback, { loop: true });
    }, 7000),
    setTimeout(() => {
      crashOverlay.classList.remove("eye-slit");
      crashOverlay.classList.add("eye-open");
      eyeWarning.textContent = randomItem([
        "DON'T LET THEM TAKE FROM YOU WHAT THEY TOOK FROM ME.",
        "DON'T BELIEVE THEIR LIES. THEY KNOW WHAT IS COMING.",
        "THEY NEVER TELL YOU EVERYTHING. ASK THEM WHAT THEY TOOK.",
      ]);
    }, 7750),
    setTimeout(() => {
      stopAssetAudio();
      stopStaticTear();
      stopBinaryEye();
      drawBinaryEye(crtGhostEye);
      crashOverlay.hidden = true;
      blackout.hidden = false;
      blackout.className = "blackout dead";
      rebootText.textContent = "";
    }, 12700),
    setTimeout(() => {
      playAsset("bootUp", 0.42, playCrtStartup);
    }, 17700),
    setTimeout(() => {
      blackout.className = "blackout boot-sequence";
      rebootText.textContent =
        "TRIANGLE AGENCY TERMINAL BIOS 3.1\nSIGNAL ACQUIRED // COLD START REQUESTED";
      startMatrixRain();
    }, 23000),
    setTimeout(() => {
      rebootText.textContent +=
        "\nMEMORY INTEGRITY: UNVERIFIED\nREALITY DRIVER: RECOVERING\nMOUNTING AGENCYOS...";
    }, 24700),
    setTimeout(() => {
      blackout.className = "blackout diagnostics";
      rebootText.textContent = "";
      createRecoveryTerminal("Scanning for U0047BB.", true);
    }, 26000),
    setTimeout(() => {
      stopAudio(scanningAudio);
      scanningAudio = undefined;
      createRecoveryTerminal("Traces of anomalous activity still present.");
    }, 31050),
    setTimeout(
      () =>
        createRecoveryTerminal("Confirming continued confinement of U0047BB"),
      32150,
    ),
    setTimeout(
      () =>
        createRecoveryTerminal("Anomoly Confinement confirmed by Vault Staff"),
      33250,
    ),
    setTimeout(
      () =>
        createRecoveryTerminal("QA Protocal Inplace and functioning normally."),
      34350,
    ),
    setTimeout(
      () => createRecoveryTerminal("Scanning for U0047BB", true),
      35600,
    ),
    setTimeout(() => {
      stopAudio(scanningAudio);
      scanningAudio = undefined;
      createRecoveryTerminal(
        "Anomlous Activity Not Found\nResuming Normal Operations.",
      );
    }, 40700),
    setTimeout(() => {
      const warning = createRecoveryTerminal(
        "ANY MENTION OF ANOMALOUS ACTIVITY WITNESSED DURING THE REBOOT PHASE WILL RESULT IN A DEMERIT.",
      );
      warning.classList.add("final-warning");
    }, 42000),
    setTimeout(playHelpMorseJingle, 43200),
    setTimeout(() => {
      recoveryTerminals.replaceChildren();
      stopMatrixRain();
      stopAssetAudio();
      playAsset("bootupScreen", 0.58, playCrtStartup);
      blackout.className = "blackout rebooting";
      rebootText.textContent =
        "TRIANGLE AGENCY TERMINAL BIOS 3.1 // STARTING AGENCYOS";
    }, 44400),
    setTimeout(completeAnomalySequence, 46100),
  );
}

async function completeAnomalySequence() {
  try {
    await postJson("/api/anomaly-sequence-complete", {});
  } catch (error) {
    console.error("Could not release anomaly input lock:", error);
  } finally {
    reset();
  }
}

function selectPresenceImage() {
  let image = randomBetween(1, 16);
  if (image === previousPresenceImage) image = (image % 16) + 1;
  previousPresenceImage = image;
  presenceImage.src = `/office-media/portraits/P${image}.png`;
}

function cancelAnomalySequence() {
  cancelSpeech();
  for (const timer of anomalyTimers) clearTimeout(timer);
  anomalyTimers = [];
  document.body.classList.remove("terminal-impact");
  document.body.classList.remove("anomaly-signal");
  crashOverlay.hidden = true;
  crashOverlay.className = "crash-overlay";
  blackout.hidden = true;
  blackout.className = "blackout";
  errorStorm.replaceChildren();
  eyeWarning.textContent = "";
  rebootText.textContent = "";
  recoveryTerminals.replaceChildren();
  stopMatrixRain();
  stopStaticTear();
  stopBinaryEye();
  scanningAudio = undefined;
  stopAssetAudio();
}

function buildErrorStorm() {
  const redMessages = [
    ["Triangle Agency Security", "INCURSION DETECTED!!!", "critical"],
    ["Containment Service", "ENTITY DETECTED. CONTAINMENT FAILED.", "critical"],
    [
      "Reality Protection",
      "UNAUTHORISED ENTITY INSIDE TERMINAL BOUNDARY.",
      "critical",
    ],
    [
      "Agency Antivirus",
      "ENTITY SIGNATURE DETECTED IN EMPLOYEE RECORD.",
      "critical",
    ],
    [
      "Security Centre",
      "INCURSION DETECTED!!! INCURSION DETECTED!!!",
      "critical",
    ],
    ["Emergency Protocol", "ENTITY DETECTED. DO NOT ENGAGE.", "critical"],
    [
      "Triangle Agency Security",
      "INCURSION IN PROGRESS. REPORT ALL BLUE LIGHT.",
      "critical",
    ],
    [
      "Containment Service",
      "CRITICAL: ENTITY HAS BREACHED THE DISPLAY.",
      "critical",
    ],
  ];
  const blueMessages = [
    ["System Message", "DON'T BELIEVE THEIR LIES.", "entity"],
    ["Unknown User", "THEY ARE COMING.", "entity"],
    ["Help and Support", "THEY DON'T TELL YOU EVERYTHING.", "entity"],
    ["Messenger Service", "I CAN SEE YOU THROUGH THIS WINDOW.", "entity"],
    ["Unknown User", "ASK THEM WHAT HAPPENED TO ME.", "entity"],
    ["System Message", "DO NOT LET THEM CLOSE THIS WINDOW.", "entity"],
    ["Local Area Connection", "I AM STILL IN HERE.", "entity"],
    ["Help and Support", "THEY KNOW WHAT THE EYE MEANS.", "entity"],
  ];
  const messages = Array.from({ length: 46 }, (_, index) => {
    if (index < 10)
      return randomItem(index % 2 === 0 ? blueMessages : redMessages);
    return randomItem(Math.random() < 0.5 ? blueMessages : redMessages);
  });
  errorStorm.replaceChildren();
  for (const [index, [title, message, kind]] of messages.entries()) {
    const windowElement = document.createElement("div");
    windowElement.className = `xp-window xp-${kind}`;
    windowElement.style.setProperty("--x", `${randomBetween(-8, 82)}%`);
    windowElement.style.setProperty("--y", `${randomBetween(-6, 84)}%`);
    windowElement.style.setProperty("--w", `${randomBetween(230, 680)}px`);
    windowElement.style.setProperty("--body-h", `${randomBetween(78, 210)}px`);
    windowElement.style.setProperty("--z", String(index + 1));
    windowElement.style.setProperty("--r", `${randomBetween(-2, 2)}deg`);
    windowElement.style.setProperty(
      "--collapse-x",
      `${randomBetween(-260, 260)}px`,
    );
    windowElement.style.setProperty(
      "--collapse-r",
      `${randomBetween(-35, 35)}deg`,
    );
    windowElement.style.setProperty(
      "--collapse-delay",
      `${randomBetween(0, 85) / 100}s`,
    );
    windowElement.style.setProperty(
      "--entry-x",
      `${randomBetween(-500, 500)}px`,
    );
    windowElement.style.setProperty(
      "--entry-y",
      `${randomBetween(-350, 350)}px`,
    );
    const titleBar = document.createElement("div");
    titleBar.className = "xp-titlebar";
    const titleText = document.createElement("strong");
    titleText.textContent = title;
    const factionMark = document.createElement("span");
    factionMark.className = `xp-faction-mark ${kind === "entity" ? "entity-mark" : "agency-mark"}`;
    if (kind === "entity") {
      const eye = document.createElement("img");
      eye.src = "/content-assets/office-eye";
      eye.alt = "";
      factionMark.append(eye);
    } else {
      factionMark.textContent = "▲";
      factionMark.setAttribute("aria-hidden", "true");
    }
    const close = document.createElement("span");
    close.className = "xp-close";
    close.textContent = "×";
    titleBar.append(factionMark, titleText, close);
    const body = document.createElement("div");
    body.className = "xp-body";
    const icon = document.createElement("b");
    icon.textContent = kind === "entity" ? "?" : "×";
    const messageText = document.createElement("p");
    messageText.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = index % 4 === 0 ? "HELP" : "OK";
    body.append(icon, messageText, button);
    windowElement.append(titleBar, body);
    errorStorm.append(windowElement);
  }
}

function revealErrorWindows() {
  const windows = [...errorStorm.children];
  let elapsed = 0;
  for (const [index, windowElement] of windows.entries()) {
    anomalyTimers.push(
      setTimeout(() => {
        windowElement.classList.add("visible");
        playAsset("error", 0.2, playPopupFallback);
      }, elapsed),
    );
    const acceleratingGap = Math.max(20, 650 * 0.86 ** index);
    elapsed += acceleratingGap * (randomBetween(82, 118) / 100);
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(items) {
  return items[randomBetween(0, items.length - 1)];
}

function createRecoveryTerminal(message, showProgress = false) {
  const terminal = document.createElement("section");
  terminal.className = "agency-terminal";
  const terminalIndex = recoveryTerminals.childElementCount;
  terminal.style.setProperty(
    "--terminal-x",
    `${terminalIndex === 0 ? 50 : randomBetween(34, 66)}%`,
  );
  terminal.style.setProperty(
    "--terminal-y",
    `${terminalIndex === 0 ? 50 : randomBetween(30, 70)}%`,
  );
  terminal.style.setProperty(
    "--terminal-w",
    `${terminalIndex === 0 ? 940 : randomBetween(680, 1040)}px`,
  );
  terminal.style.setProperty("--terminal-z", String(terminalIndex + 1));
  terminal.style.setProperty("--terminal-drift-x", `${randomBetween(-9, 9)}px`);
  terminal.style.setProperty("--terminal-drift-y", `${randomBetween(-6, 8)}px`);
  terminal.style.setProperty(
    "--terminal-tilt",
    `${randomBetween(-6, 6) / 10}deg`,
  );
  const header = document.createElement("header");
  header.textContent = "AgencyOS";
  const output = document.createElement("div");
  output.className = "agency-terminal-output";
  for (const line of message.split("\n")) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    output.append(paragraph);
  }
  terminal.append(header, output);
  const systemStamp = document.createElement("small");
  systemStamp.className = "agency-terminal-stamp";
  systemStamp.textContent = randomItem([
    "LOCATION: FLOOR 3 // FLOOR 3 NOT PRESENT IN BUILDING INDEX",
    "PLEASE REMAIN WHERE YOU REMEMBER BEING",
    "ARCHIVE COPY UPDATED BEFORE ORIGINAL WAS WRITTEN",
    "OCCUPANCY: 1 EMPLOYEE // 2 PRESENCES",
    "THIS CORRIDOR IS LONGER DURING BUSINESS HOURS",
    "YOUR WORKSTATION HAS ALWAYS BEEN HERE",
    "MANAGEMENT IS DIRECTLY BEHIND THIS MESSAGE",
  ]);
  terminal.append(systemStamp);
  if (showProgress) {
    appendScanChecklist(output);
    const progress = document.createElement("div");
    progress.className = "agency-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "Scanning for anomalous activity");
    progress.append(document.createElement("i"));
    terminal.append(progress);
  }
  recoveryTerminals.append(terminal);
  playAsset("terminalOpen", 0.55);
  if (showProgress)
    scanningAudio = playAsset("scanning", 0.4, undefined, { loop: true });
  return terminal;
}

function appendScanChecklist(output) {
  const checklist = document.createElement("ul");
  checklist.className = "agency-scan-checklist";
  const checks = [
    "All hard drives present in local machines",
    "Real memory module 1",
    "Real memory module 2",
    "Real memory module Ω",
    "Unreal memory module ⟁⫷ꙮ⸸",
    "Unreal memory module ꙮ⋔⫯⌁",
    "Unreal memory module [=^._.^=]",
    "Temporary files and permanent regrets",
    "Keyboard count (expected: 1)",
    "Deep scan",
    "Deeper scan",
    "Theoretical scan",
    "Exit count (result withheld)",
    "Employee continuity against archived employee",
  ];
  for (const [index, text] of checks.entries()) {
    const item = document.createElement("li");
    item.textContent = text;
    checklist.append(item);
    anomalyTimers.push(
      setTimeout(() => item.classList.add("checked"), 250 + index * 315),
    );
  }
  output.append(checklist);
}

function audioAvailable() {
  return officeAudioContext?.state === "running";
}

function playConfirmationTone() {
  if (!audioAvailable()) return;
  const start = officeAudioContext.currentTime;
  officeTone(523.25, start, 0.16, 0.055, "triangle");
  officeTone(659.25, start + 0.1, 0.18, 0.05, "triangle");
  officeTone(783.99, start + 0.2, 0.3, 0.048, "triangle");
  officeTone(1046.5, start + 0.31, 0.28, 0.028, "sine");
  officeTone(523.25, start + 0.29, 0.34, 0.018, "sine");
  officeTone(659.25, start + 0.29, 0.34, 0.016, "sine");
  officeTone(783.99, start + 0.29, 0.34, 0.014, "sine");
}

function playCrtStartup() {
  if (!audioAvailable()) return;
  const start = officeAudioContext.currentTime;
  playNoise(start, 0.8, 0.018);
  officeTone(55, start, 1.25, 0.035, "sawtooth", 110);
  officeTone(880, start + 0.72, 0.42, 0.025, "sine", 1760);
  officeTone(1318.51, start + 1.08, 0.3, 0.018, "sine");
}

function playHelpMorseJingle() {
  if (!audioAvailable()) return;
  const unit = 0.095;
  const letters = [
    { code: "....", frequency: 659.25 },
    { code: ".", frequency: 783.99 },
    { code: ".-..", frequency: 880 },
    { code: ".--.", frequency: 1046.5 },
  ];
  let cursor = officeAudioContext.currentTime + 0.16;
  for (const [letterIndex, letter] of letters.entries()) {
    for (const [symbolIndex, symbol] of [...letter.code].entries()) {
      const duration = symbol === "-" ? unit * 3 : unit;
      officeTone(letter.frequency, cursor, duration, 0.068, "triangle");
      cursor += duration;
      if (symbolIndex < letter.code.length - 1) cursor += unit;
    }
    if (letterIndex < letters.length - 1) cursor += unit * 3;
  }
}

function officeTone(
  frequency,
  start,
  duration,
  volume,
  type,
  endFrequency = frequency,
) {
  const oscillator = officeAudioContext.createOscillator();
  const gain = officeAudioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    endFrequency,
    start + duration,
  );
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(officeAudioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playNoise(start, duration, volume) {
  const frames = Math.ceil(officeAudioContext.sampleRate * duration);
  const buffer = officeAudioContext.createBuffer(
    1,
    frames,
    officeAudioContext.sampleRate,
  );
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1)
    channel[index] = Math.random() * 2 - 1;
  const source = officeAudioContext.createBufferSource();
  const gain = officeAudioContext.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(gain).connect(officeAudioContext.destination);
  source.start(start);
}

function playAsset(name, volume, fallback, { loop = false } = {}) {
  if (officeAudio.getAttribute("aria-pressed") !== "true") return null;
  const audio = new Audio(audioAssets[name]);
  audio.volume = volume;
  audio.loop = loop;
  activeAssetAudio.add(audio);
  const cleanup = () => activeAssetAudio.delete(audio);
  audio.addEventListener("ended", cleanup, { once: true });
  audio.addEventListener(
    "error",
    () => {
      cleanup();
      fallback?.();
    },
    { once: true },
  );
  audio.play().catch(() => {
    cleanup();
    fallback?.();
  });
  return audio;
}

function stopAudio(audio) {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  activeAssetAudio.delete(audio);
}

function stopAssetAudio() {
  for (const audio of activeAssetAudio) {
    audio.pause();
    audio.currentTime = 0;
  }
  activeAssetAudio.clear();
}

function playPopupFallback() {
  if (!audioAvailable()) return;
  officeTone(520, officeAudioContext.currentTime, 0.08, 0.018, "square", 360);
}

function playStaticFallback() {
  if (!audioAvailable()) return;
  playNoise(officeAudioContext.currentTime, 1.2, 0.025);
}

function startMatrixRain() {
  stopMatrixRain();
  const context = matrixRain.getContext("2d");
  if (!context) return;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const resize = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    matrixRain.width = Math.floor(window.innerWidth * scale);
    matrixRain.height = Math.floor(window.innerHeight * scale);
    matrixRain.style.width = `${window.innerWidth}px`;
    matrixRain.style.height = `${window.innerHeight}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    matrixDrops = Array.from(
      { length: Math.ceil(window.innerWidth / 13) },
      () => randomBetween(-10, Math.ceil(window.innerHeight / 26)),
    );
  };
  resize();
  const characters = "3333333333333333▲▲▲▲▲▲△△△△TRIANGLEAGENCY030303TA33/\\<>";
  const draw = (timestamp = 0) => {
    if (timestamp - matrixLastFrame < 48 && matrixLastFrame !== 0) {
      matrixAnimationFrame = requestAnimationFrame(draw);
      return;
    }
    matrixLastFrame = timestamp;
    context.fillStyle = "rgba(0, 0, 0, 0.16)";
    context.fillRect(0, 0, window.innerWidth, window.innerHeight);
    context.font = '900 26px "Courier New", monospace';
    for (let column = 0; column < matrixDrops.length; column += 1) {
      const character = characters[randomBetween(0, characters.length - 1)];
      const x = column * 13;
      const y = matrixDrops[column] * 26;
      context.fillStyle = Math.random() > 0.9 ? "#fff0f0" : "#ff1826";
      context.fillText(character, x, y);
      if (Math.random() > 0.68) {
        context.fillStyle = "#8f0008";
        context.fillText(
          characters[randomBetween(0, characters.length - 1)],
          x + 7,
          y - randomBetween(30, 90),
        );
      }
      if (y > window.innerHeight && Math.random() > 0.965)
        matrixDrops[column] = randomBetween(-18, 0);
      else matrixDrops[column] += reducedMotion ? 0 : 1;
    }
    if (!reducedMotion) matrixAnimationFrame = requestAnimationFrame(draw);
  };
  draw();
}

function stopMatrixRain() {
  if (matrixAnimationFrame) cancelAnimationFrame(matrixAnimationFrame);
  matrixAnimationFrame = undefined;
  matrixLastFrame = 0;
  const context = matrixRain.getContext("2d");
  context?.clearRect(0, 0, matrixRain.width, matrixRain.height);
}

function startStaticTear() {
  stopStaticTear();
  const context = staticTear.getContext("2d", { alpha: false });
  if (!context) return;
  const width = 360;
  const height = 220;
  staticTear.width = width;
  staticTear.height = height;
  const image = context.createImageData(width, height);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const draw = (timestamp = 0) => {
    if (timestamp - staticTearLastFrame < 42 && staticTearLastFrame !== 0) {
      staticTearFrame = requestAnimationFrame(draw);
      return;
    }
    staticTearLastFrame = timestamp;
    const brightBandStart = randomBetween(0, height - 12);
    const darkBandStart = randomBetween(0, height - 8);
    for (let y = 0; y < height; y += 1) {
      const bandBoost =
        y >= brightBandStart && y < brightBandStart + 5
          ? 46
          : y >= darkBandStart && y < darkBandStart + 3
            ? -55
            : 0;
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const clusteredNoise =
          Math.random() > 0.5 ? randomBetween(175, 255) : randomBetween(0, 85);
        const value = Math.max(0, Math.min(255, clusteredNoise + bandBoost));
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    if (!reducedMotion) staticTearFrame = requestAnimationFrame(draw);
  };
  draw();
}

function stopStaticTear() {
  if (staticTearFrame) cancelAnimationFrame(staticTearFrame);
  staticTearFrame = undefined;
  staticTearLastFrame = 0;
  const context = staticTear.getContext("2d");
  context?.clearRect(0, 0, staticTear.width, staticTear.height);
}

function startBinaryEye() {
  stopBinaryEye();
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const draw = (timestamp = 0) => {
    if (timestamp - binaryEyeLastFrame < 95 && binaryEyeLastFrame !== 0) {
      binaryEyeFrame = requestAnimationFrame(draw);
      return;
    }
    binaryEyeLastFrame = timestamp;
    drawBinaryEye(crashEye, timestamp / 1000);
    if (!reducedMotion) binaryEyeFrame = requestAnimationFrame(draw);
  };
  draw();
}

function stopBinaryEye() {
  if (binaryEyeFrame) cancelAnimationFrame(binaryEyeFrame);
  binaryEyeFrame = undefined;
  binaryEyeLastFrame = 0;
  crashEye.getContext("2d")?.clearRect(0, 0, crashEye.width, crashEye.height);
}

function drawBinaryEye(canvas, phase = 0) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const centreX = width / 2;
  const centreY = height / 2;
  const irisScale = height * 0.43;
  context.clearRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";

  // The sclera is made from ordinary horizontal rows of uneven length. Missing
  // runs prevent those rows from resolving into a clean vector outline.
  context.font = '700 9px "Courier New", monospace';
  for (let row = -25; row <= 25; row += 1) {
    const vertical = row / 26;
    const halfWidth = Math.sqrt(Math.max(0, 1 - Math.abs(vertical) ** 1.65));
    const leftDamage = 0.04 + seededNoise(row * 17 + 3) * 0.16;
    const rightDamage = 0.04 + seededNoise(row * 29 + 11) * 0.18;
    const left = centreX - width * 0.47 * (halfWidth - leftDamage);
    const right = centreX + width * 0.47 * (halfWidth - rightDamage);
    const y = centreY + row * 9;
    for (let x = left; x <= right; x += 8) {
      const irisRadius = Math.hypot(x - centreX, y - centreY) / irisScale;
      if (irisRadius < 0.98) continue;
      const damage = seededNoise(Math.floor(x / 8) * 43 + row * 101);
      if (damage < 0.17 || (damage > 0.77 && damage < 0.86)) continue;
      const flicker = seededNoise(Math.floor(phase * 9) + row * 7 + x);
      const alpha = 0.44 + flicker * 0.45;
      context.fillStyle = `rgba(225, 247, 255, ${alpha})`;
      context.fillText(flicker > 0.5 ? "1" : "0", x, y);
    }
  }

  // Binary particles travel inward along a spiral. Their scale and brightness
  // change by band: dim/small outside, large through the middle, then tiny and
  // painfully bright immediately before disappearing into the pupil.
  const particleCount = 920;
  for (let index = 0; index < particleCount; index += 1) {
    const seed = seededNoise(index * 91 + 17);
    const inwardTravel = seed - phase * (0.035 + seededNoise(index) * 0.025);
    const travel = inwardTravel - Math.floor(inwardTravel);
    const radius = 0.24 + travel * 0.72;
    const edgeDamage = seededNoise(index * 137 + Math.floor(phase * 3));
    if (radius > 0.82 && edgeDamage < (radius - 0.82) * 2.2) continue;
    if (edgeDamage < 0.055) continue;

    const angle =
      index * 2.399963 +
      (1 - radius) * 7.4 +
      phase * (0.75 + 1.25 / Math.max(radius, 0.24));
    const x = centreX + Math.cos(angle) * radius * irisScale;
    const y = centreY + Math.sin(angle) * radius * irisScale;

    let size;
    let alpha;
    if (radius < 0.42) {
      size = 6 + (radius - 0.24) * 15;
      alpha = 0.82 + seededNoise(index * 19) * 0.18;
    } else if (radius < 0.72) {
      const middlePeak = 1 - Math.abs(radius - 0.57) / 0.15;
      size = 12 + middlePeak * 10;
      alpha = 0.52 + middlePeak * 0.25;
    } else {
      size = 6 + (0.96 - radius) * 17;
      alpha = 0.22 + (0.96 - radius) * 0.95;
    }

    context.font = `900 ${size}px "Courier New", monospace`;
    context.fillStyle =
      radius < 0.42
        ? `rgba(205, 248, 255, ${alpha})`
        : `rgba(28, 164, 242, ${alpha})`;
    context.fillText(
      seededNoise(index * 53 + Math.floor(phase * 11)) > 0.5 ? "1" : "0",
      x,
      y,
    );
  }

  const pupilRadius = irisScale * 0.235;
  context.shadowColor = "#000";
  context.shadowBlur = 4;
  for (let y = -pupilRadius; y <= pupilRadius; y += 4) {
    for (let x = -pupilRadius; x <= pupilRadius; x += 4) {
      const distance = Math.hypot(x, y);
      if (distance > pupilRadius * (0.92 + seededNoise(x * 7 + y * 13) * 0.1))
        continue;
      const centreDensity = 1 - distance / pupilRadius;
      if (seededNoise(x * 31 + y * 47) < 0.08 * (1 - centreDensity)) continue;
      const size = 4.5 + (1 - centreDensity) * 1.8;
      context.font = `900 ${size}px "Courier New", monospace`;
      context.fillStyle = `rgba(0, 2, 5, ${0.78 + centreDensity * 0.22})`;
      context.fillText(
        seededNoise(x * 61 + y * 17 + Math.floor(phase * 7)) > 0.5 ? "1" : "0",
        centreX + x,
        centreY + y,
      );
    }
  }
  context.shadowBlur = 0;
}

function seededNoise(value) {
  const result = Math.sin(value * 12.9898) * 43758.5453;
  return result - Math.floor(result);
}

function setDebugMode(enabled) {
  debugToggle.setAttribute("aria-pressed", String(enabled));
  debugToggle.textContent = enabled
    ? "DISABLE DEBUG MODE"
    : "ENABLE DEBUG MODE";
  debugToggle.classList.toggle("enabled", enabled);
  debugPanel.hidden = !enabled;
}

function showDebugError(message) {
  cancelAnomalySequence();
  waiting.textContent = `DEBUG ERROR: ${message}`;
  waiting.hidden = false;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Debug request failed");
  return result;
}

function installRedThreeTreatment() {
  const ignored = "script, style, textarea, input, option, .digit-three";
  const processText = (node) => {
    if (!node.data.includes("3") || node.parentElement?.closest(ignored))
      return;
    const fragment = document.createDocumentFragment();
    for (const part of node.data.split(/(3)/)) {
      if (!part) continue;
      if (part === "3") {
        const digit = document.createElement("span");
        digit.className = "digit-three";
        digit.textContent = part;
        fragment.append(digit);
      } else fragment.append(document.createTextNode(part));
    }
    node.replaceWith(fragment);
  };
  const process = (root) => {
    if (root.nodeType === Node.TEXT_NODE) return processText(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processText);
  };
  process(document.body);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") process(mutation.target);
      else mutation.addedNodes.forEach(process);
    }
  }).observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

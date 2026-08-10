# Triangle Agency Access Control Terminal

A small local prop application that watches PC/SC-compatible NFC readers, identifies badge UIDs against a local employee file, and displays the matching Triangle Agency employee. Unknown credentials receive a distinct response. It does not authenticate, write badges, store scans, contact external services, or require the browser to remain open.

The primary deployment target is an older Microsoft Surface running Windows 10 or 11. The application is also designed to run on macOS, provided PC/SC and the native `nfc-pcsc` dependency are available.

> [!IMPORTANT]
> This repository does not include the Triangle Agency rulebook PDF or any extracted Playwall text, images, manifests, or generated content catalogue. Those files are copyright-controlled and are ignored by Git. A lawful owner may generate them locally; the application also runs without them.

## Start here

- [Installation and minimum requirements](docs/SETUP.md)
- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Private online access and deployment](docs/DEPLOYMENT.md)
- [Public-release checklist](docs/RELEASE-CHECKLIST.md)

Stage 4 adds persistent campaign state and declarative triggers that can change later interactions, unlock local content, and produce theatrical display effects. This remains a theatrical local prop—not a secure real-world authentication system. NFC badge UIDs can often be copied or emulated and must not be treated as strong credentials.

## What it does

- Detects one or more PC/SC readers and reports connection changes.
- Isolates native PC/SC monitoring from the web server so a stalled driver or stopped service cannot freeze the interface.
- Normalizes a presented badge UID to uppercase hexadecimal.
- Emits each badge once while it remains present, then permits it again after removal.
- Loads and validates known employees from `data/employees.json` at startup.
- Shows known employee details or an unregistered-credential screen at `http://localhost:3000`.
- Plays distinct locally generated browser tones for known and unknown credentials.
- Attempts an isolated ACR122U onboard-buzzer command; browser audio remains the dependable fallback.
- Includes a hardware-free simulated scan path.
- Lets the operator select an Agency resource and returns `ACCESS GRANTED` or `ACCESS DENIED`.
- Records completed access attempts locally in JSON Lines format.

## Hardware assumptions

The intended setup is an ACS ACR122U USB reader with ordinary NFC badges. Other readers exposed through PC/SC may work for UID reading; the code does not identify every PC/SC device as an ACR122U. Some cards do not expose a UID in the way `nfc-pcsc` expects and will produce a recoverable error.

The onboard ACR122U buzzer command has **not been verified on physical hardware**. Browser audio is the dependable confirmation fallback.

## Windows prerequisites

1. Install the current Node.js LTS release from <https://nodejs.org/>. Accept the normal installer defaults. Confirm in PowerShell:

   ```powershell
   node --version
   npm --version
   ```

2. Connect the ACR122U and give Windows Update time to identify it.
3. Open Device Manager. Look under **Smart card readers** for the device. If it appears as an unknown USB device, disconnect it, reconnect it directly or through a known-good adapter, and check Windows Update.
4. Open `services.msc`, locate **Smart Card**, and confirm that the service can run. PowerShell can report its state:

   ```powershell
   Get-Service SCardSvr
   Start-Service SCardSvr
   ```

   Starting a stopped system service may require an administrator PowerShell window; normal application use should not require administrator privileges.

5. If Windows still does not recognize the reader correctly, install only the appropriate driver from the official ACS website. Avoid unofficial driver-download websites.

If `npm install` reports a native compilation error, install a current Python 3 release and Microsoft Visual Studio Build Tools with the **Desktop development with C++** workload, then retry. Both must be visible to `node-gyp`; do this only if installation actually fails. With npm 12, you may also need to approve the required native build explicitly with `npm install-scripts approve @pokusew/pcsclite`, followed by `npm rebuild @pokusew/pcsclite`.

### macOS prerequisites

Install the current Node.js LTS release using the official Node.js installer. macOS includes PC/SC support. If native dependency compilation fails, install Apple's Command Line Tools with `xcode-select --install`. The commands below work in PowerShell; in macOS Terminal the `npm` commands are identical, while environment-variable syntax differs.

## Install and run

Open PowerShell in this project folder:

```powershell
npm install
npm start
```

The terminal prints reader activity and opens `http://localhost:3000/office` in the default browser. If automatic opening fails, enter that address manually. The main identification terminal remains available at `http://localhost:3000`. Closing the browser does not stop the Node process; reopen either address at any time. Stop the process with Ctrl+C.

To use another port in PowerShell:

```powershell
$env:PORT = 3001
npm start
```

In Command Prompt:

```cmd
set PORT=3001
npm start
```

The server binds only to `127.0.0.1`. It needs local access only: do not configure router port forwarding or expose it publicly. If Windows Defender Firewall asks, public-network access is not needed.

For an optional standalone-looking Edge window, start the server and then run:

```powershell
start msedge --app=http://localhost:3000
```

Failure to locate Edge has no effect on the running terminal.

## Employee registry

Stage 2 stores known badges in [`data/employees.json`](data/employees.json). The two supplied Agent Pendleton and Agent Mercer records are **placeholder demonstration data**, not real personnel records. The complete registry stays in Node; the browser receives only the employee associated with the current scan.

Each JSON object key is a badge UID. UIDs may contain spaces, colons, or hyphens but are normalized to uppercase hexadecimal at startup. Each record requires:

- `employeeId`, `name`, `department`, and `status`: non-empty strings. New records created in the Supervisor portal generate their badge UID, payroll number, and `TA` personnel number automatically.
- `clearance`: an integer from 0 through 9

Invalid UIDs, missing fields, invalid clearances, and keys that normalize to the same UID stop startup with an error identifying the UID and field. The file is loaded once at startup; restart the application after editing it. A missing or malformed file also prevents startup rather than silently running with no employees.

To add or edit an employee, stop the application, open `data/employees.json` in a text editor, and add a comma-separated entry using the existing records as a template. Preserve valid JSON syntax. You can review the loaded public fields without starting the terminal:

```powershell
npm run employees
```

### Register a physical badge

1. Start the application.
2. Scan the badge.
3. Copy the UID shown on the unregistered credential screen.
4. Stop the application with Ctrl+C.
5. Add that UID and its employee fields to `data/employees.json`.
6. Restart the application.
7. Scan the badge again.
8. Confirm that the employee is identified.

## Connect and scan

Connect the reader before or after starting the application. When the page says `PRESENT IDENTIFICATION`, place a badge against it. A registered badge displays its employee; an unregistered badge displays its UID so it can be added later. Keep only one badge on each reader. Remove it after the result; after approximately 750 ms the page returns to waiting.

Click **ENABLE AUDIO** once in the browser. Browsers require this user gesture before the Web Audio API can make sound. Later scans create a short local tone without loading an audio file.

## Resources and access decisions

Protected destinations are loaded from [`data/resources.json`](data/resources.json) at startup. Select one from **AUTHORISED DESTINATION** in the browser; the selection stays active across badge removals and browser refreshes, but resets when Node restarts. Both enabled and disabled resources remain selectable so disabled-resource denials can be used in play.

Playwall documents are assigned per employee from the Supervisor page. Red Agency documents remain available through **Personnel Records**. Assigned Blue Anomaly documents reveal an otherwise hidden **Containment Vault** directly on the terminal after that employee badges in. Yellow Reality documents appear as personal messages that can only be read after selecting **Break Room** and presenting the assigned employee's badge. Opening a file marks it as seen, and removing the badge hides employee-specific material again.

The Supervisor page includes an **ADD NEW EMPLOYEE** button. It opens a dedicated intake form for assigning a hexadecimal badge UID and recording identity, ordinary HR details, clearance, demerits, commendations, Anomaly/Competency/Reality types, and special conditions such as non-human or containment-required status. New records are validated, saved atomically to `data/employees.json`, and become available to badge scans immediately. Badge UIDs may be entered with spaces, colons, or hyphens; they are stored as normalized uppercase hexadecimal.

For Yellow messages, add the optional `dependant` and `dependantContact` fields to that employee in `data/employees.json`. If `dependant` is omitted, the note uses “your registered dependant.” The supported contact methods are `telephone`, `came-to-see-you`, `please-call`, `will-call`, `wants-to-see-you`, and `left-package`.

```json
"dependant": "Casey Pendleton",
"dependantContact": {
  "methods": ["telephone", "please-call"],
  "phone": "555-0133",
  "urgent": false
}
```

The Office portal displays the message as a handwritten CSS sticky note, while the access terminal places the extracted Yellow document on a mundane “While You Were Out” slip in the Break Room.

Unread Blue files produce a deliberately unstable notification styled like a damaged classic Macintosh window. The Vault appears as an off-interface intrusion control rather than a normal destination. Confirming a Blue file produces a beep and one-second blackout, then removes that assignment and every player-facing trace of it. The GM may assign the document again later. The visual disturbance is reduced automatically when the browser's reduced-motion preference is enabled.

Each resource ID uses lowercase letters, numbers, and hyphens. Records contain:

```json
{
  "name": "Containment Floor",
  "description": "Restricted containment and observation facilities.",
  "minimumClearance": 3,
  "allowedDepartments": ["Containment", "Operations"],
  "allowedStatuses": ["ACTIVE"],
  "enabled": true
}
```

`minimumClearance` is an integer from 0 through 9. Department and status entries must be unique non-empty strings; `allowedStatuses` cannot be empty. An empty `allowedDepartments` list permits every department. Invalid data stops startup with the resource ID and field in the error.

To add a resource or change its clearance requirement, stop the application, edit `data/resources.json`, preserve valid JSON syntax, and restart. Resource data is not live-reloaded.

### Decision order

The server evaluates access in this exact order:

1. Disabled resource
2. Explicit employee denial
3. Disallowed employment status
4. Insufficient clearance
5. Restricted department
6. Explicit employee allowance
7. All requirements met

An explicit allowance therefore cannot bypass a disabled resource, explicit denial, status, clearance, or department requirement. Status and clearance now affect this theatrical access result; they still do not provide real security.

### Employee permissions

Employee records may optionally add overrides referencing known resource IDs:

```json
"permissions": {
  "allow": ["personnel-records"],
  "deny": ["secure-lift"]
}
```

Both values must be arrays of unique valid resource IDs. A resource cannot appear in both lists, and every reference must exist in `data/resources.json`. Employee permissions are evaluated only on the server and are not included in browser payloads.

## Campaign state and declarative effects

Static definitions and runtime progress are deliberately separate:

| File                  | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `data/employees.json` | Default employees and permissions                              |
| `data/resources.json` | Default resource requirements                                  |
| `data/content.json`   | Messages, documents, images, and audio definitions             |
| `data/triggers.json`  | Conditions and ordered actions                                 |
| `data/state.json`     | Runtime overrides, flags, unlocks, counts, and trigger history |

Edit static JSON only while the application is stopped. `state.json` is created automatically and written atomically through a temporary file and replacement. Runtime state uses schema version `1`; unsupported versions or corrupt JSON stop startup and are never silently overwritten.

Back up `data/state.json` before important sessions. To inspect progress without printing content bodies:

```powershell
npm run state
```

### Effective records

Access evaluation uses the static record merged with persistent runtime overrides. Employee overrides can change clearance, status, allow/deny permissions, display messages, and employee flags. Resource overrides can change enabled state, minimum clearance, department/status eligibility, messages, and supervisor-only status. Static registry files are never rewritten automatically.

Adding a runtime allow removes the same resource from deny, and adding a deny removes it from allow. Explicit permissions still cannot bypass mandatory access checks.

### Content and local assets

`data/content.json` supports:

- `message` and `document`: non-empty `title`, `classification`, and paragraph-array `body`
- `image`: `title`, `classification`, `asset`, and accessible `alt`
- `audio`: `title` and `asset`

Every item has an audience: `PUBLIC`, `SCANNED_EMPLOYEE`, or `SUPERVISOR`. Scanned-employee content is only visually private on the shared terminal screen; it is not confidential. Supervisor content is sent only to the supervisor Socket.IO namespace.

Media files belong beneath `data/assets`. Absolute paths, URLs, network paths, traversal with `..`, missing files, and paths escaping that directory stop startup. Express serves only assets belonging to validated content IDs; it never exposes the complete `data` directory. The included SVG is original placeholder material.

### Playwall personnel records

The public repository contains no rulebook or extracted Playwall content. A lawful owner can generate local assets beneath `data/assets/Playwall` by following [the setup guide](docs/SETUP.md#add-playwall-content-locally). The PDF, generated catalogue, manifest, extracted text, and extracted images are all ignored by Git. Startup does not require them. Generated files use this layout:

```text
Playwall/
├── Agency (Red)/
│   └── images/
├── Anomaly (Blue)/
│   └── images/
├── Reality (Yellow)/
│   └── images/
└── manifest.json
```

Each image uses its printed designation, such as `A1.png`. Multi-page documents with the same designation and color are joined into one image. The manifest records titles, categories, and source PDF pages; extracted text is not retained because the application does not use it.

Agency/Red documents are integrated with the **Personnel Records** destination. They are deliberately unavailable until individually unlocked:

1. Open `http://127.0.0.1:3000/supervisor`.
2. In **Playwall Document Access**, choose an employee.
3. Choose a document by designation and title, then select **Add Document**. Assigned records appear immediately below and each has a **Remove** button.
4. In the main terminal, select **Personnel Records** and present an employee badge that satisfies its access rules.
5. Open any record assigned to that employee from the controlled document index.

Assignments are employee-specific. Adding a record also marks it unlocked in campaign history, but another employee cannot see it unless it is separately assigned to them. Unassigned Playwall image URLs return a not-found response, and the document index is only available in its intended interaction context.

Assigned records remain **NEW** until that employee opens them. Each badge scan announces any unread Personnel Records by designation. Opening a file marks it **VIEWED** for that employee; the supervisor assignment panel displays the same status.

The local extractor requires Python, PyMuPDF, and Pillow. Generate both assets and their optional content catalogue with:

```powershell
python -m pip install pymupdf pillow
python scripts/extract_playwall.py
python scripts/build_playwall_content.py
```

### Triggers

`data/triggers.json` defines enabled, prioritized, optionally once-only triggers. Supported events are:

```text
BADGE_IDENTIFIED
UNKNOWN_BADGE
ACCESS_GRANTED
ACCESS_DENIED
NO_RESOURCE_SELECTED
CONTENT_OPENED
SUPERVISOR_ACTION
```

Conditions may match employee ID, UID, resource, reason code, employee status, minimum/maximum clearance, simulation state, campaign flags, employee flags, previous execution, unlocked content, and minimum/maximum scan count. Every supplied condition must match. There are no executable expressions, scripts, or `eval`.

Supported actions are:

```text
DISPLAY_CONTENT          DISPLAY_MESSAGE
UNLOCK_CONTENT           PLAY_AUDIO
SET_FLAG                 INCREMENT_FLAG
SET_EMPLOYEE_CLEARANCE   SET_EMPLOYEE_STATUS
ADD_EMPLOYEE_PERMISSION  REMOVE_EMPLOYEE_PERMISSION
SET_RESOURCE_ENABLED     SET_RESOURCE_CLEARANCE
DELAY
```

Triggers run by descending priority, then trigger ID alphabetically. Actions run in listed order and state mutations are committed atomically with trigger history. Later triggers see earlier state changes. A successfully completed once-only trigger cannot run again. Failed action transactions are not marked complete and do not crash NFC monitoring.

`DELAY` applies only to later display/media effects. A single delay is limited to 10 seconds and total trigger delay to 20 seconds. It does not block NFC processing. Every scan receives a unique interaction ID; badge removal or a newer scan cancels old browser timers and private content.

### Example persistent story workflow

The supplied placeholder `first-archive-access` trigger demonstrates the full path:

1. Agent Pendleton scans at Evidence Archive.
2. Access is granted at clearance level 2.
3. The once-only trigger unlocks the classified Archive Notice.
4. The terminal displays the notice.
5. `archive-warning-seen` is set.
6. Pendleton’s persistent clearance becomes level 3.
7. A later Containment Floor scan uses level 3 and can be granted.
8. Restarting Node preserves the clearance, unlock, flag, and trigger history.

All supplied campaign content and triggers are obvious placeholders intended to be replaced by the GM.

## Supervisor controls

Open `http://127.0.0.1:3000/supervisor`. This secondary local page can inspect effective records, flags, unlocks, and trigger history; select the active resource; change flags, employee clearance/status/permissions, and resource state/clearance; add or remove spoken employee reminders; unlock content; run supervisor events; export; and reset. The **Spoken Reminders** panel provides an employee dropdown, reminder field, and a removable list of that employee's current reminders.

State-changing operations require `CONFIRM`. Reset requires the exact text `RESET`, creates a timestamped backup first, and resets runtime state only. If backup creation fails, reset stops and keeps the original state. Static registries are untouched.

Exports are written without overwrite to `exports/triangle-state-<timestamp>.json`. Reset backups go to `backups/state-<timestamp>.json`. Both directories are ignored by Git. Supervisor controls have no password: they are protected only by localhost binding and physical control of the Surface.

The equivalent CLI reset is interactive:

```powershell
npm run reset-state
```

For automated development only, `npm run reset-state -- --yes` bypasses the prompt but still creates a backup.

## Office portal

Open `http://127.0.0.1:3000/office` for a simplified buzz-in personnel display. When a known badge is scanned it shows only the employee name and number, role, anomaly designation, clearance, department, demerits, commendations, and the applicable GM message. It clears after badge removal and does not expose campaign controls.

After **ENABLE AUDIO** is selected, the Office portal uses the browser's local speech synthesis and an installed Windows voice to greet the employee by name. Every announcement has low electrical hum and band-limited noise underneath to suggest an old office tannoy. It then speaks supervisor reminders, unread Red-file notices, and the exact Management message shown on screen; this keeps the spoken fallback nicety or strange question synchronized with its display. A glitch-triggering Management message switches to a slower, damaged voice and heavier interference. An unread Blue file instead uses that broken voice for a stretched and stuttering `There is something waiting for you... Don't let them...` before cutting off. Duplicate state events are suppressed so one badge presentation produces one announcement. Speech stays on the local computer and is cancelled when the badge is removed or a newer scan replaces it.

Messages are loaded from `data/GM_message.json` at startup. Employee-number entries under `specific` take priority. Employees without a specific entry receive a weighted random fallback:

- 75% benign workplace message
- 20% subtly anomalous message
- 5% unhinged message

Each fallback category must contain exactly 10 non-empty messages. The weights can be adjusted in the same file:

```json
{
  "specific": {
    "TA-0417": "Agent Pendleton: report to Containment."
  },
  "weights": {
    "benign": 75,
    "strange": 20,
    "unhinged": 5
  },
  "defaults": {
    "benign": ["Good morning.", "...nine more..."],
    "strange": ["Are you still yourself?", "...nine more..."],
    "unhinged": ["They're lying to you....", "...nine more..."]
  }
}
```

The abbreviated arrays above illustrate the shape only; the real file must retain all 10 entries in every category. An unhinged selection displays its message, plays a generated alarm when office audio is enabled, floods the screen with layered intrusion errors, enters a saturated colour-and-blue-eye failure phase, blacks out, then plays a generated CRT startup sound and resets. Badge removal or another scan cancels an obsolete sequence. The reduced-motion media query removes animated movement and colour cycling while preserving the staged warning content.

The office failure sequence uses local audio registered through `data/content.json`: `erro.mp3` accompanies every XP-style error dialog, and `Static.wav` plus `Swoosh.mp3` begin when the blue eye appears. The dialogs assault the display at randomized intervals, sizes, positions, angles, and stacking depths on every run. Generated Web Audio remains the fallback for failed popup playback, and the final CRT recovery remains synthesized.

Restart the application after editing this file. Empty messages or malformed JSON stop startup with a clear error.

The office portal also has an **ENABLE DEBUG MODE** control. It uses the same local simulator as the main terminal: enter a fake UID, choose **PRESENT CARD**, then **REMOVE CARD** to exercise the normal reset. Debug scans use the real employee and GM-message lookup path and are marked simulated in the application logs.

Use `04A7812C966180` to test Pendleton’s specific message. Use `A1B2C3D4` to test the weighted fallback pools; Mercer intentionally has no specific message entry.

### Recovering damaged state

If startup reports corrupt or unsupported campaign state:

1. Stop the application.
2. Copy the damaged `data/state.json` somewhere safe.
3. Inspect or restore it from a known-good file in `backups` or `exports`.
4. Do not edit the schema version unless performing a deliberate migration.
5. If campaign progress may be discarded, rename the damaged file and restart to create a clean version-1 state.

The application never replaces a damaged state file automatically.

## Test without hardware

The browser includes an **ENABLE TEST MODE** control. It exposes a clearly labelled simulated reader panel where you can enter a fake UID, present the card, and remove it. Use `04A7812C966180` for the placeholder known employee and `FFFFFFFF` for an unknown credential. Use **REMOVE CARD** to exercise the same delayed reset behavior as physical badge removal. Test-mode events are marked as simulated and do not access PC/SC hardware.

For a granted attempt, select **Evidence Archive** and present `04A7812C966180`. For a denied attempt, select **Containment Floor** and present the same badge: its placeholder clearance is level 2 while the resource requires level 3. Clear the destination to exercise identification without an access decision.

Keep the application running and open a second PowerShell window:

```powershell
npm run simulate -- 04A7812C966180
```

That command tests the placeholder known employee. To test an unknown credential:

```powershell
npm run simulate -- FFFFFFFF
```

To select a resource and evaluate the simulated scan in one command:

```powershell
npm run simulate -- 04A7812C966180 evidence-archive
```

An unknown resource ID returns a clear error and does not scan the badge.

Simulation uses the complete Stage 4 path: effective records, access evaluation, scan counts, triggers, persistent mutations, content effects, access logging, and campaign-event logging. All resulting records retain `simulated: true`.

Simulated UIDs use the same registry lookup and server-to-browser identification events as physical scans and are labelled `SIMULATED`. They do not test PC/SC, a real badge, physical removal events, or the onboard buzzer.

Run the automated checks with:

```powershell
npm test
npm run lint
```

Format source files with `npm run format`.

## Troubleshooting

### No reader detected / `nfc-pcsc` cannot locate a reader

Check Device Manager's **Smart card readers** category and `Get-Service SCardSvr`. Try another USB port, cable path, or powered hub. Close other smart-card applications that may exclusively hold the device, then restart this application.

### Reader is absent or shown as an unknown USB device

Allow Windows Update time to finish, reconnect the device, and inspect Device Manager properties for its hardware ID and error. Install the matching official ACS driver only if Windows does not recognize it correctly. On a USB-C-only Surface, use a data-capable USB-C adapter rather than a charge-only adapter.

### Badge not detected

Confirm the reader itself is online, try a known-compatible badge, remove other badges from the reader field, and inspect the terminal for a recoverable card error. Unsupported smart cards may not expose a UID.

### Reader disconnects or repeatedly reconnects

Reconnect it; the application continues waiting. In Device Manager, open the USB hub/device **Power Management** tab and disable “Allow the computer to turn off this device to save power” if disconnects correlate with idle power saving. A powered USB hub can help with marginal adapters.

### Browser audio does not play

Click **ENABLE AUDIO**, ensure the tab and Windows audio mixer are not muted, and scan again. Reloading the page requires enabling audio again.

### Native dependency installation fails

Use a current Node.js LTS release. On Windows, install Python 3 and Visual Studio Build Tools with the **Desktop development with C++** workload, then rerun `npm install`. If npm reports a blocked script, run `npm install-scripts approve @pokusew/pcsclite` and `npm rebuild @pokusew/pcsclite`. On macOS, install Command Line Tools. Read the first native build error rather than repeatedly running as Administrator.

### Port 3000 is already in use

Choose another port with `$env:PORT = 3001` before `npm start` (or `set PORT=3001` in Command Prompt), then browse to that port.

### Onboard buzzer unavailable

This is expected on non-ACR122 readers and may occur on different ACR122U firmware or driver combinations. The failure is logged but does not invalidate the scan. Use **ENABLE AUDIO** for the supported browser fallback.

### Windows Defender Firewall prompt

The application listens only on localhost and does not need LAN or public network access. Cancel or deny public-network access; no router changes are required.

## Known limitations and MVP success

Employee matching, state changes, and resource decisions are local theatrical effects, not authentication. Badge UIDs may be cloned, JSON files and state are editable by the local user, supervisor controls are unauthenticated, and there is no tamper protection. Player-private content is only visually private on a shared screen. There is no database, live definition reload, NFC writing, printing, Foundry integration, or remote access. Multiple readers are tracked independently, but the interface displays the most recent badge globally. CLI-simulated badges do not automatically emit removal events; browser test mode provides an explicit removal control.

Completed access attempts are appended to `data/access-log.jsonl`. Each line contains the timestamp, UID, employee ID when known, resource ID, result, reason code, and simulation flag. Names and complete employee records are not logged. The file is excluded from Git, is never loaded into memory, and can be deleted while the application is stopped if the local prop history is no longer needed. Scans made without a selected resource are not access attempts and are not written there.

Meaningful runtime mutations are appended without content bodies to `data/campaign-events.jsonl`. Logging failures warn without interrupting scans; a failed state persistence transaction, however, prevents that trigger from being recorded as successfully complete.

Stage 2 succeeds when installation, tests, and lint pass; valid employee data loads locally; known and unknown simulations take their distinct display and tone paths; the local page reports reader state; a held physical badge triggers once and can trigger again after removal; and reader/buzzer failures remain recoverable. Physical reader compatibility, real employee-badge identification and removal behavior, and the onboard ACR122U buzzer must still be validated on the target hardware.

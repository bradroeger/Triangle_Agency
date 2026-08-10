# Setup and minimum requirements

## Minimum requirements

| Component | Minimum | Notes |
| --- | --- | --- |
| Operating system | Windows 10/11 or a currently supported macOS release | Linux may work with PC/SC configured, but is not a tested target. |
| Node.js | 22 or newer | The version requirement is enforced by `package.json`. Use a current Node.js LTS release when possible. |
| Memory | 2 GB free | The app is small; media-heavy Playwall content needs additional disk space, not much additional RAM. |
| Disk | 250 MB for source and dependencies, plus local media | The copyright-controlled PDF and generated assets can require substantially more space. |
| Browser | Current Edge, Chrome, Firefox, or Safari | Audio playback requires a user interaction after page load. |
| NFC (optional) | PC/SC-compatible reader and badges | An ACS ACR122U is the intended device. The built-in simulator works without hardware. |

Physical NFC use also requires a working PC/SC service and a compatible reader driver. Native dependency compilation may require Python 3 and C++ build tools on Windows, or Xcode Command Line Tools on macOS.

## Install

```powershell
git clone <your-repository-url>
cd Triangle_Agency
npm ci
npm test
npm start
```

Open `http://localhost:3000/office` for the office display, `http://localhost:3000` for the player terminal, and `http://localhost:3000/supervisor` for GM controls. Stop the server with Ctrl+C.

Use `npm run dev` during development. Run `npm run lint` and `npm test` before publishing changes.

## Test without an NFC reader

Start the server, enable test mode in the browser, or run:

```powershell
npm run simulate -- 537220B7960001
```

The demonstration badge records in `data/employees.json` can be replaced with campaign-specific records. Runtime state, logs, backups, and exports are intentionally ignored by Git.

## Add Playwall content locally

Only do this with a copy of the game that you are entitled to use. Do not commit or upload the input or generated output.

1. Create `data/pdf` and place exactly one legally obtained Triangle Agency PDF there.
2. Install the optional extraction dependencies: `python -m pip install pymupdf pillow`.
3. Run `python scripts/extract_playwall.py`.
4. Run `python scripts/build_playwall_content.py`.
5. Restart the app.

This creates `data/assets/Playwall` and `data/playwall-content.json`. All of these paths, including the source `data/pdf` directory, are covered by `.gitignore`. Without them, the app starts normally and simply has no Playwall documents to assign.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local HTTP port. |
| `NO_OPEN` | unset | Set to `1` to prevent automatic browser launch. |

The server deliberately binds to `127.0.0.1`. See [DEPLOYMENT.md](DEPLOYMENT.md) before making it reachable from another device.

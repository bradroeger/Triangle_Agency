# Deployment and private online access

## Recommended model

Run the Node.js app on the computer physically connected to the NFC reader and keep it bound to `127.0.0.1`. If a remote GM needs access, place an authenticated private-network or identity-aware reverse proxy in front of it.

Do not expose port 3000 directly, configure router port forwarding, or deploy this unchanged as a public website. The supervisor UI can edit campaign data and has no application-level authentication. Ordinary serverless/static hosts are also a poor fit: the app needs a long-running Node.js process, WebSockets, writable persistent storage, and—for physical scanning—local PC/SC hardware.

## Same computer

```powershell
npm ci --omit=dev
$env:NODE_ENV = "production"
$env:NO_OPEN = "1"
npm start
```

Browse to `http://localhost:3000`. Use a process manager or an operating-system startup task if the prop must recover after a reboot, and back up the ignored `data/state.json` file between sessions.

## Remote GM access

Choose a private overlay network or a tunnel/reverse proxy that provides all of the following:

- authenticated access before requests reach the Node process;
- HTTPS/TLS;
- WebSocket support for Socket.IO;
- a route to the local origin `http://127.0.0.1:3000`;
- access restricted to the GM/operator accounts.

Keep the player and office displays local. After configuring the private access product, verify `/supervisor`, live Socket.IO updates, and a state mutation from an authorized remote device. Then verify the URL is unavailable when signed out and to an unapproved account.

Because the app remains on localhost, most tunnel agents can connect to it without changing source code. If a conventional reverse proxy runs on the same host, proxy to `127.0.0.1:3000`; do not change the app to listen on every interface unless the host firewall and proxy boundary are deliberately configured.

## Hosted server (no physical NFC)

A VPS or container host can run the simulator-only experience if it supports Node.js 22+, persistent writable volumes, and WebSockets. It will not see a USB reader attached to a player's computer. Before doing this, the application needs an authenticated gateway and a persistent mount for the mutable `data`, `backups`, and `exports` paths. Do not upload the PDF or generated Playwall files to the host unless your licence explicitly permits that distribution and access model.

## Operational checklist

1. Install with `npm ci --omit=dev` and run as an unprivileged operating-system user.
2. Set `NODE_ENV=production` and `NO_OPEN=1`.
3. Put authentication and HTTPS at the proxy/tunnel boundary.
4. Preserve WebSocket upgrade traffic.
5. Restrict filesystem permissions around employee and campaign data.
6. Back up mutable state and test restore before the session.
7. Apply Node.js and dependency security updates between campaigns.
8. Test badge scan/removal, player display, office display, and GM controls after deployment.

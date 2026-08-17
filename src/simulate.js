import process from "node:process";
import { normalizeUid } from "./nfc/uid.js";

try {
  const uid = normalizeUid(process.argv[2]);
  const resourceId = process.argv[3];
  const port = process.env.PORT || "3000";
  const response = await fetch(`http://0.0.0.0:${port}/__simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uid, ...(resourceId && { resourceId }) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  console.log(
    `[SIMULATED] Badge UID sent to local terminal: ${result.uid}${resourceId ? ` for ${resourceId}` : ""}`,
  );
} catch (error) {
  console.error(`Simulation failed: ${error.message}`);
  console.error(
    "Start the terminal first, then run: npm run simulate -- 04A7812C966180",
  );
  process.exitCode = 1;
}

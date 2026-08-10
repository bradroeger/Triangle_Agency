import { EmployeeRegistry } from "./EmployeeRegistry.js";

try {
  const registry = await EmployeeRegistry.load(
    new URL("../../data/employees.json", import.meta.url),
  );
  console.log(`Loaded employees: ${registry.size}\n`);
  for (const { uid, employee } of registry.list()) {
    console.log(`${employee.employeeId} — ${employee.name} — ${uid}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

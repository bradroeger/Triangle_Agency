const decisions = {
  RESOURCE_DISABLED: "The requested resource is not currently available.",
  EXPLICITLY_DENIED: "Employee permissions explicitly exclude this resource.",
  STATUS_RESTRICTED: "Employment status is not eligible for this resource.",
  INSUFFICIENT_CLEARANCE:
    "Employee clearance does not meet resource requirements.",
  DEPARTMENT_RESTRICTED:
    "Employee department is not assigned to this resource.",
  EXPLICITLY_ALLOWED:
    "Employee permission and all mandatory requirements are verified.",
  REQUIREMENTS_MET: "Employee meets all resource requirements.",
  UNKNOWN_EMPLOYEE: "Employee record not found.",
  UNKNOWN_RESOURCE: "Requested resource was not found.",
  NO_RESOURCE_SELECTED: "No authorised destination has been selected.",
};

export const ACCESS_REASON_CODES = new Set(Object.keys(decisions));

export function evaluateAccess(employee, resource) {
  if (!resource) return result(false, "UNKNOWN_RESOURCE");
  if (!employee) return result(false, "UNKNOWN_EMPLOYEE");
  if (!resource.enabled) return result(false, "RESOURCE_DISABLED");

  const denied = employee.permissions?.deny?.includes(resource.id);
  if (denied) return result(false, "EXPLICITLY_DENIED");
  if (!resource.allowedStatuses.includes(employee.status))
    return result(false, "STATUS_RESTRICTED");
  if (employee.clearance < resource.minimumClearance)
    return result(false, "INSUFFICIENT_CLEARANCE");
  if (
    resource.allowedDepartments.length > 0 &&
    !resource.allowedDepartments.includes(employee.department)
  ) {
    return result(false, "DEPARTMENT_RESTRICTED");
  }
  if (employee.permissions?.allow?.includes(resource.id))
    return result(true, "EXPLICITLY_ALLOWED");
  return result(true, "REQUIREMENTS_MET");
}

export function noResourceSelected() {
  return result(false, "NO_RESOURCE_SELECTED");
}

function result(granted, reasonCode) {
  return Object.freeze({ granted, reasonCode, message: decisions[reasonCode] });
}

export function mergeEmployee(staticEmployee, override = {}) {
  if (!staticEmployee) return null;
  const staticPermissions = staticEmployee.permissions ?? {
    allow: [],
    deny: [],
  };
  const overridePermissions = override.permissions;
  return {
    ...staticEmployee,
    ...(override.clearance !== undefined && { clearance: override.clearance }),
    ...(override.status !== undefined && { status: override.status }),
    ...(override.loyalty !== undefined && { loyalty: override.loyalty }),
    ...(override.missionMvp !== undefined && {
      missionMvp: override.missionMvp,
    }),
    ...(override.demerits !== undefined && { demerits: override.demerits }),
    permissions: {
      allow: [...(overridePermissions?.allow ?? staticPermissions.allow)],
      deny: [...(overridePermissions?.deny ?? staticPermissions.deny)],
    },
    ...(override.message !== undefined && { message: override.message }),
    flags: structuredClone(override.flags ?? {}),
  };
}

export function mergeResource(staticResource, override = {}) {
  if (!staticResource) return null;
  return {
    ...staticResource,
    ...(override.enabled !== undefined && { enabled: override.enabled }),
    ...(override.minimumClearance !== undefined && {
      minimumClearance: override.minimumClearance,
    }),
    allowedDepartments: [
      ...(override.allowedDepartments ?? staticResource.allowedDepartments),
    ],
    allowedStatuses: [
      ...(override.allowedStatuses ?? staticResource.allowedStatuses),
    ],
    ...(override.message !== undefined && { message: override.message }),
    ...(override.hiddenStatus !== undefined && {
      hiddenStatus: override.hiddenStatus,
    }),
  };
}

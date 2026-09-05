import { USER_ROLES } from "@/features/auth/permissions";

export function isPermanentDeleteCandidate({
  currentUserId,
  currentUserRole,
  user,
}) {
  return Boolean(
    user &&
    currentUserRole === USER_ROLES.ADMINISTRATOR &&
    user.id !== currentUserId &&
    user.role !== USER_ROLES.ADMINISTRATOR &&
    user.registration_status !== "pending",
  );
}

const RETIREMENT_BLOCKERS = new Set([
  "appointment_history",
  "clinical_history",
  "audit_history",
  "inquiry_history",
  "notification_history",
  "household_dependency",
  "retained_media",
  "protected_resident_lifecycle",
  "protected_dependency",
]);

export function isPermanentRetirementCandidate(user) {
  return Boolean(
    user &&
    !user.permanent_delete_eligible &&
    RETIREMENT_BLOCKERS.has(user.permanent_delete_blocker),
  );
}

export function permanentDeleteRetentionMessage(user) {
  switch (user?.permanent_delete_blocker) {
    case "appointment_history":
      return "This account has appointment history that must be retained. You can permanently remove login access without deleting that history.";
    case "clinical_history":
      return "This account has protected clinical history that must be retained. You can permanently remove login access without deleting that history.";
    case "audit_history":
      return "This account has required audit history that must be retained. You can permanently remove login access without deleting that history.";
    case "inquiry_history":
      return "This account has retained inquiry history. You can permanently remove login access without deleting that history.";
    case "notification_history":
      return "This account has retained notification-delivery history. You can permanently remove login access without deleting that history.";
    case "household_dependency":
      return "This Resident is still referenced by household history. You can permanently remove login access without deleting that history.";
    case "retained_media":
      return "This account has retained profile or Resident media. You can permanently remove login access while retaining the historical identity.";
    default:
      return "This account has protected historical records and must be retained. You can permanently remove login access without deleting that history.";
  }
}

// Helpers for turning raw apiService errors into clean "Type — friendly line"
// strings (or structured pieces) that we can show to the user.
//
// apiService formats backend errors as:
//   "An error occurred while updating the data.\n (401: Current password is incorrect)"
// or:
//   "Something went wrong during the request.\n (400: Password must not be empty)"
//
// parseApiError() pulls the HTTP status + detail out of that string.

export interface ParsedApiError {
  /** HTTP status code as a string (e.g. "400", "409"), or undefined if not parseable. */
  status?: string;
  /** The backend's detail message (e.g. "Password must not be empty"). */
  detail: string;
}

export function parseApiError(err: Error): ParsedApiError {
  // Match "(<status>: <detail>)" at the end of the message. We don't use the
  // /s flag (requires es2018+) — instead, capture any char including newlines
  // with [\s\S].
  const match = err.message.match(/\((\d{3}):\s*([\s\S]*)\)\s*$/);
  let detail = match?.[2]?.trim() ?? "";
  // Safety net: if the apiService still dumped a ProblemDetail-looking JSON
  // (older builds, or a response shape we didn't recognise), pull the
  // `detail`/`title`/`message` field out so the user doesn't see {"detail":…}.
  if (detail.startsWith("{") && detail.endsWith("}")) {
    try {
      const parsed = JSON.parse(detail);
      detail = parsed.detail ?? parsed.title ?? parsed.message ?? parsed.error ?? detail;
    } catch {
      // leave as-is
    }
  }
  return {
    status: match?.[1],
    detail,
  };
}

/**
 * Convert a raw apiService error into a "<Type> — <friendly line>" string.
 * Keeps the type information (a short human-readable label or the HTTP code
 * as a fallback) so the user knows what kind of error happened, but strips
 * the verbose apiService prefix.
 *
 * Used by the user-profile / password-change UI and the registration form.
 */
export function toFriendlyError(err: Error): string {
  const { status, detail } = parseApiError(err);
  const lowDetail = detail.toLowerCase();

  if (status === "401" && /password/.test(lowDetail)) {
    return "Wrong password — the current password you entered doesn't match. Please try again.";
  }
  if (status === "409" && /different/.test(lowDetail)) {
    return "Same password — the new password must be different from the current one.";
  }
  if (status === "409" && /username/.test(lowDetail)) {
    return "Username taken — please pick a different username.";
  }
  // Spring's generic Bean-Validation rejection (no field name in the message).
  // Happens when @Valid + @NotBlank fails before our service-level checks run.
  if (status === "400" && /invalid request content/.test(lowDetail)) {
    return "Invalid input — please make sure every field is filled in (whitespace doesn't count).";
  }
  if (status === "400" && /password/.test(lowDetail)) {
    return `Invalid password — ${detail}`;
  }
  if (status === "400" && /username/.test(lowDetail)) {
    return `Invalid username — ${detail}`;
  }
  if (status === "400" && /first name/.test(lowDetail)) {
    return `Invalid first name — ${detail}`;
  }
  if (status === "400" && /last name/.test(lowDetail)) {
    return `Invalid last name — ${detail}`;
  }
  if (status === "400") {
    return `Invalid input — ${detail || "please double-check the value you entered."}`;
  }
  if (status === "401") {
    return `Unauthorized — ${detail || "please log in again."}`;
  }
  if (status === "404") {
    return "Not found — the resource doesn't exist.";
  }

  return status
    ? `Error ${status} — ${detail || "something went wrong, please try again."}`
    : "Something went wrong, please try again.";
}

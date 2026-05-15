import { getApiDomain } from "@/utils/domain";

/**
 * Derives the WebSocket base URL from the HTTP API domain.
 * Converts http(s):// → ws(s):// so the client talks to the same host.
 */
export function getWebSocketDomain(): string {
  const apiDomain = getApiDomain();
  return apiDomain.replace(/^http/, "ws");
}

/**
 * Builds the full WebSocket URL for the whiteboard endpoint of a course.
 */
export function getWhiteboardWebSocketUrl(courseId: string | number): string {
  return `${getWebSocketDomain()}/ws/whiteboard/${courseId}`;
}

/**
 * Builds the full WebSocket URL for the session events endpoint.
 * Used by the multi-mode (collaboration-start / collaboration-end) and
 * session-ended event streams broadcast by SessionWebSocketHandler.
 */
export function getSessionWebSocketUrl(sessionId: string | number): string {
  return `${getWebSocketDomain()}/ws/session/${sessionId}`;
}

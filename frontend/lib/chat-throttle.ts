/** Minimum spacing between Agent Chat Coral executions (non-cached) */
const MIN_CHAT_INTERVAL_MS = 4000;

let lastChatExecutionAt = 0;

export function getChatThrottleDelayMs(): number {
  const elapsed = Date.now() - lastChatExecutionAt;
  return Math.max(0, MIN_CHAT_INTERVAL_MS - elapsed);
}

export async function waitForChatThrottle(): Promise<void> {
  const delay = getChatThrottleDelayMs();
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastChatExecutionAt = Date.now();
}

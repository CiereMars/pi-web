import type { AgentMessage } from "./types";

function recordedMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** When a response ended: its request start plus the time pi recorded for it (pi 1.1). */
function responseEnd(message: AgentMessage): number | undefined {
  if (message.role !== "assistant") return undefined;
  const start = recordedMs(message.timestamp);
  const duration = recordedMs(message.durationMs);
  return start !== undefined && duration !== undefined ? start + duration : undefined;
}

/**
 * When a message ended, on pi's clock: a user message or tool result is made at that moment, a
 * response ends when its request started plus the time pi recorded for it.
 */
export function getMessageEndTime(message: AgentMessage): number | undefined {
  if (message.role === "assistant") return responseEnd(message);
  if (message.role === "user" || message.role === "toolResult") return recordedMs(message.timestamp);
  return undefined;
}

/**
 * How long a finished turn took: from its anchor (the user's message, a compaction summary,
 * a subagent completion) until the last response or tool result in `messages[anchorIdx + 1, endIdx)`
 * ended. Undefined when the anchor has no time, or when the turn's last response predates
 * `durationMs`: its timestamp is when it started, so the turn's end is unknown.
 */
export function getTurnDurationMs(messages: AgentMessage[], anchorIdx: number, endIdx: number): number | undefined {
  const start = recordedMs(messages[anchorIdx]?.timestamp);
  if (start === undefined) return undefined;
  let end: number | undefined;
  let lastResponseTimed = false;
  for (let idx = anchorIdx + 1; idx < endIdx; idx++) {
    const message = messages[idx];
    if (message.role === "assistant") {
      const ended = responseEnd(message);
      lastResponseTimed = ended !== undefined;
      if (ended !== undefined) end = Math.max(end ?? ended, ended);
    } else if (message.role === "toolResult") {
      const ended = recordedMs(message.timestamp);
      if (ended !== undefined) end = Math.max(end ?? ended, ended);
    }
  }
  if (!lastResponseTimed || end === undefined) return undefined;
  return Math.max(0, end - start);
}

/**
 * When the running turn started: its anchor's time, or the end of a reply that already
 * finished it, for a run an extension started after the turn was answered.
 */
export function getLiveTurnStart(messages: AgentMessage[], anchorIdx: number): number | undefined {
  let start = recordedMs(messages[anchorIdx]?.timestamp);
  if (start === undefined) return undefined;
  for (let idx = anchorIdx + 1; idx < messages.length; idx++) {
    const message = messages[idx];
    if (message.role !== "assistant" || (message.stopReason !== "stop" && message.stopReason !== "length")) continue;
    const ended = responseEnd(message);
    if (ended !== undefined) start = Math.max(start, ended);
  }
  return start;
}

/** A turn's length as the chat shows it, in whole seconds: 14s, then 3m 5s, then 1h 2m 5s. */
export function formatTurnDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${seconds}s`;
}

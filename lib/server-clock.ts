/**
 * pi stamps messages with the server's clock; the browser's can differ (a phone on the LAN).
 * A turn's length compares the two, so the browser's offset from pi's clock is estimated from
 * the events as they arrive: a message that has just ended says what time it is on pi's clock.
 */

import type { AgentMessage } from "./types";
import { getMessageEndTime } from "./turn-duration";

const SAMPLES = 16;
let offsets: number[] = [];

/** A time on pi's clock that has just happened: a message that just ended. */
export function noteServerTime(serverMs: number, clientMs: number = Date.now()): void {
  if (!Number.isFinite(serverMs) || !Number.isFinite(clientMs)) return;
  offsets.push(clientMs - serverMs);
  if (offsets.length > SAMPLES) offsets.shift();
}

/** A message has just ended: its time on pi's clock says the browser's offset from it. */
export function noteMessageEnd(message: AgentMessage, clientMs: number = Date.now()): void {
  const endedAt = getMessageEndTime(message);
  if (endedAt !== undefined) noteServerTime(endedAt, clientMs);
}

/**
 * The time on pi's clock now: the browser's, less its smallest recent offset. Delay only adds to an
 * offset (an event reaches the browser late, or is replayed after a reconnect), so the smallest is
 * the closest. Without an event yet the browser's clock stands.
 */
export function serverNow(clientMs: number = Date.now()): number {
  return offsets.length === 0 ? clientMs : clientMs - Math.min(...offsets);
}

/** The message a bubble stands for arrived: the bubble stays and takes pi's time for it. */
export function adoptServerTime<T extends { timestamp?: number }>(shown: T, delivered: { timestamp?: number }): T {
  const timestamp = delivered.timestamp;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp === shown.timestamp) return shown;
  return { ...shown, timestamp };
}

export function resetServerClock(): void {
  offsets = [];
}

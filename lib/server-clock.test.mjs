import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { noteServerTime, noteMessageEnd, serverNow, adoptServerTime, resetServerClock } = await jiti.import("./server-clock.ts");
const { getMessageEndTime, getTurnDurationMs, getLiveTurnStart } = await jiti.import("./turn-duration.ts");

beforeEach(() => resetServerClock());

test("without an event the browser's clock stands", () => {
  assert.equal(serverNow(10_000), 10_000);
});

test("a browser ahead of pi, or behind it, is shifted onto pi's clock", () => {
  noteServerTime(1_000, 6_000);
  assert.equal(serverNow(16_000), 11_000);
  resetServerClock();
  noteServerTime(6_000, 1_000);
  assert.equal(serverNow(11_000), 16_000);
});

test("the smallest offset wins: delay only adds to it", () => {
  noteServerTime(1_000, 6_200);
  noteServerTime(2_000, 7_050);
  noteServerTime(3_000, 8_300);
  assert.equal(serverNow(10_000), 4_950);
});

test("an old event replayed after a reconnect does not move the estimate", () => {
  noteServerTime(2_000, 7_050);
  noteServerTime(500, 9_000);
  assert.equal(serverNow(10_000), 4_950);
});

test("a clock that stepped is followed once its old samples are out of the window", () => {
  noteServerTime(0, 100);
  for (let i = 0; i < 16; i++) noteServerTime(i * 1_000, i * 1_000 + 5_000);
  assert.equal(serverNow(10_000), 5_000);
});

test("an ended message is a sample; one without a time on pi's clock is not", () => {
  noteMessageEnd({ role: "assistant", content: [], timestamp: 1_100, durationMs: 900 }, 7_000);
  assert.equal(serverNow(10_000), 5_000);
  noteMessageEnd({ role: "assistant", content: [], timestamp: 1_100 }, 9_999);
  noteMessageEnd({ role: "custom", content: "x", timestamp: 1_100 }, 9_999);
  assert.equal(serverNow(10_000), 5_000);
});

test("a time that is not a number is ignored", () => {
  noteServerTime(Number.NaN, 5_000);
  noteServerTime(1_000, Number.POSITIVE_INFINITY);
  assert.equal(serverNow(10_000), 10_000);
});

test("a bubble takes pi's time for the message and is otherwise left alone", () => {
  const bubble = { role: "user", content: "hi", timestamp: 8_000 };
  assert.deepEqual(adoptServerTime(bubble, { timestamp: 1_010 }), { role: "user", content: "hi", timestamp: 1_010 });
  assert.equal(bubble.timestamp, 8_000);
  assert.equal(adoptServerTime(bubble, { timestamp: 8_000 }), bubble);
  assert.equal(adoptServerTime(bubble, {}), bubble);
  assert.equal(adoptServerTime(bubble, { timestamp: Number.NaN }), bubble);
});

test("a message's end on pi's clock", () => {
  assert.equal(getMessageEndTime({ role: "user", content: "hi", timestamp: 1_000 }), 1_000);
  assert.equal(getMessageEndTime({ role: "toolResult", toolCallId: "c", content: [], timestamp: 2_000 }), 2_000);
  assert.equal(getMessageEndTime({ role: "assistant", content: [], timestamp: 1_100, durationMs: 900 }), 2_000);
  assert.equal(getMessageEndTime({ role: "assistant", content: [], timestamp: 1_100 }), undefined);
  assert.equal(getMessageEndTime({ role: "custom", content: "x", timestamp: 1_100 }), undefined);
});

test("a browser seven seconds ahead measures a turn and its running time on pi's clock", () => {
  const skew = 7_000;
  const browser = (piTime) => piTime + skew;
  // The first message of a freshly loaded page: no event yet, the bubble carries the browser's time.
  const bubble = { role: "user", content: "hi", timestamp: serverNow(browser(1_000)) };
  // pi's copy of it arrives 2 ms later and tells the offset.
  const delivered = { role: "user", content: "hi", timestamp: 1_010 };
  noteMessageEnd(delivered, browser(1_012));
  const user = adoptServerTime(bubble, delivered);
  // The running turn: 2 s after pi made the message, the chat shows 2 s (2 ms of delay).
  const start = getLiveTurnStart([user], 0);
  assert.equal(start, 1_010);
  assert.equal(serverNow(browser(3_010)) - start, 1_998);
  // The finished turn: its response ended at 6 000 on pi's clock.
  const reply = { role: "assistant", content: [], timestamp: 1_100, durationMs: 4_900, stopReason: "stop" };
  assert.equal(getTurnDurationMs([user, reply], 0, 2), 4_990);
});

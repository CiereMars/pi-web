import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { getTurnDurationMs, getLiveTurnStart, formatTurnDuration } = await jiti.import("./turn-duration.ts");

const user = (timestamp) => ({ role: "user", content: "hi", timestamp });
const reply = (timestamp, durationMs, stopReason = "toolUse") => ({ role: "assistant", content: [], model: "m", provider: "p", timestamp, durationMs, stopReason });
const result = (timestamp) => ({ role: "toolResult", toolCallId: "c", content: [], timestamp });

test("a turn runs from the user's message until its last response ended", () => {
  const messages = [user(1_000), reply(1_200, 3_000), result(4_500), reply(4_600, 2_400, "stop")];
  assert.equal(getTurnDurationMs(messages, 0, messages.length), 6_000);
});

test("only the messages before the next anchor belong to the turn", () => {
  const messages = [user(1_000), reply(1_100, 900, "stop"), user(10_000), reply(10_100, 5_000, "stop")];
  assert.equal(getTurnDurationMs(messages, 0, 2), 1_000);
  assert.equal(getTurnDurationMs(messages, 2, 4), 5_100);
});

test("a tool result after the last response, as in an aborted turn, ends the turn", () => {
  const messages = [user(1_000), reply(1_100, 900), result(8_000)];
  assert.equal(getTurnDurationMs(messages, 0, messages.length), 7_000);
});

test("no duration without the anchor's time or the last response's recorded length", () => {
  assert.equal(getTurnDurationMs([user(undefined), reply(1_100, 900, "stop")], 0, 2), undefined);
  assert.equal(getTurnDurationMs([user(1_000), reply(1_100, 900), result(2_100), reply(2_200, undefined, "stop")], 0, 4), undefined);
  assert.equal(getTurnDurationMs([user(1_000)], 0, 1), undefined);
});

test("a running turn starts at its anchor", () => {
  assert.equal(getLiveTurnStart([user(1_000), reply(1_100, 900)], 0), 1_000);
  assert.equal(getLiveTurnStart([user(undefined)], 0), undefined);
  assert.equal(getLiveTurnStart([], -1), undefined);
});

test("a run started after the turn was answered starts where the answer ended", () => {
  const messages = [user(1_000), reply(1_100, 900, "stop"), reply(60_000, 1_000)];
  assert.equal(getLiveTurnStart(messages, 0), 2_000);
});

test("durations read in whole seconds, then minutes and hours", () => {
  assert.equal(formatTurnDuration(0), "0s");
  assert.equal(formatTurnDuration(14_900), "14s");
  assert.equal(formatTurnDuration(185_000), "3m 5s");
  assert.equal(formatTurnDuration(3_725_000), "1h 2m 5s");
  assert.equal(formatTurnDuration(-50), "0s");
});

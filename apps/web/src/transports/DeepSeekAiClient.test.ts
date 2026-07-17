import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame, getLegalActions, startHand, type RandomSource } from "@river-noir/poker-engine";
import type { AiDecision } from "@river-noir/poker-ai";
import { decideDeepSeekAction } from "./DeepSeekAiClient.js";

class FixedRandom implements RandomSource {
  next(): number {
    return 0.42;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("DeepSeekAiClient", () => {
  it("sends only visible poker context and accepts a legal action", async () => {
    const state = startHand(createGame({
      tableId: "deepseek-test",
      config: { maxSeats: 3, smallBlind: 5, bigBlind: 10, initialStack: 1_000 },
      players: [
        { id: "deepseek", name: "DeepSeek", seat: 0 },
        { id: "opponent-1", name: "Mira", seat: 1 },
        { id: "opponent-2", name: "Orson", seat: 2 },
      ],
    }), new FixedRandom());
    const playerId = state.players.find((player) => player.seat === state.actingSeat)?.id;
    if (!playerId) throw new Error("The test hand has no acting player.");
    const legalAction = getLegalActions(state, playerId).find((action) => action.type === "call");
    if (!legalAction) throw new Error("The test hand does not allow calling.");
    const fallback: AiDecision = {
      action: { playerId, type: "call" },
      equity: 0.48,
      potOdds: 0.25,
      confidence: 0.23,
      reason: "potOdds",
    };
    let requestBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "call" }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const action = await decideDeepSeekAction({ state, playerId, fallback, model: "deepseek-v4-flash" });

    expect(action).toEqual({ playerId, type: "call" });
    const apiRequest = JSON.parse(requestBody) as { messages: { role: string; content: string }[] };
    const userMessage = apiRequest.messages.find((message) => message.role === "user")?.content;
    const visibleState = JSON.parse(userMessage?.replace(/^Poker state JSON:\n/, "") ?? "{}") as {
      holeCards?: unknown[];
      opponents?: Record<string, unknown>[];
    };
    expect(visibleState.holeCards).toHaveLength(2);
    expect(visibleState.opponents).toHaveLength(2);
    expect(visibleState.opponents?.every((opponent) => !("holeCards" in opponent))).toBe(true);
  });
});

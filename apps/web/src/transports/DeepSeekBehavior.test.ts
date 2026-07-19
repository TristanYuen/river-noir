import { describe, expect, it } from "vitest";
import type { RandomSource } from "@river-noir/poker-engine";
import {
  behaviorForDecision,
  createDeepSeekBehavior,
  recordDeepSeekAction,
  settleDeepSeekHand,
} from "./DeepSeekBehavior.js";

const random: RandomSource = { next: () => 0.75 };

describe("DeepSeekBehavior", () => {
  it("moves toward chasing and tilt after a meaningful loss", () => {
    const initial = createDeepSeekBehavior(10_000, random);
    const settled = settleDeepSeekHand(initial, 7_000, 100, random);
    const decision = behaviorForDecision(settled, { stack: 7_000, bigBlind: 100, pot: 1_500 }, random);

    expect(settled.lastResult).toBe("loss");
    expect(settled.tilt).toBeGreaterThan(initial.tilt);
    expect(settled.lossChasing).toBeGreaterThan(0);
    expect(decision.behavior.riskTolerance).toBeGreaterThan(0.4);
  });

  it("builds impatience after repeated folds and resets it after aggression", () => {
    let state = createDeepSeekBehavior(10_000, random);
    state = recordDeepSeekAction(state, "fold");
    state = recordDeepSeekAction(state, "fold");
    state = recordDeepSeekAction(state, "fold");
    expect(behaviorForDecision(state, { stack: 10_000, bigBlind: 100, pot: 300 }, random).behavior.mood).toBe("impatient");

    state = recordDeepSeekAction(state, "raise");
    expect(state.foldStreak).toBe(0);
  });
});

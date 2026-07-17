import { describe, expect, it } from "vitest";
import { evaluateBestHand, evaluateFive, compareHands } from "./evaluator.js";
import { parseCards } from "./cards.js";

describe("hand evaluator", () => {
  it.each([
    ["As Ks Qs Js Ts", "straightFlush", "Royal flush"],
    ["9s 9h 9d 9c As", "fourOfAKind", "Four 9s"],
    ["Kh Kd Kc 2s 2h", "fullHouse", "Ks full of 2s"],
    ["As Js 8s 4s 2s", "flush", "A-high flush"],
    ["9s 8h 7d 6c 5s", "straight", "9-high straight"],
    ["Ac 2d 3h 4s 5c", "straight", "5-high straight"],
    ["Qs Qh Qd 8c 2s", "threeOfAKind", "Three Qs"],
    ["As Ah 8d 8c 2s", "twoPair", "As and 8s"],
    ["Js Jh 9d 6c 2s", "pair", "Pair of Js"],
    ["As Jh 9d 6c 2s", "highCard", "A high"],
  ])("evaluates %s", (codes, category, description) => {
    const result = evaluateFive(parseCards(codes));
    expect(result.category).toBe(category);
    expect(result.description).toBe(description);
  });

  it("chooses the best five cards from seven", () => {
    const result = evaluateBestHand(parseCards("As Ks Qs Js Ts 2d 3c"));
    expect(result.category).toBe("straightFlush");
    expect(result.cards).toHaveLength(5);
  });

  it("compares kickers after a shared pair", () => {
    const aceKicker = evaluateFive(parseCards("9s 9h As Kd 2c"));
    const queenKicker = evaluateFive(parseCards("9d 9c Qs Jh 8c"));
    expect(compareHands(aceKicker, queenKicker)).toBe(1);
  });

  it("rejects duplicate cards", () => {
    expect(() => evaluateFive(parseCards("As As Qs Js Ts"))).toThrow("Duplicate cards");
  });
});

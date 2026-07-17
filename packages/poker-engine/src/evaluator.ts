import { cardCode, assertUniqueCards } from "./cards.js";
import type { Card, Rank } from "./types.js";

export const HAND_CATEGORIES = [
  "highCard",
  "pair",
  "twoPair",
  "threeOfAKind",
  "straight",
  "flush",
  "fullHouse",
  "fourOfAKind",
  "straightFlush",
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];

export interface EvaluatedHand {
  readonly category: HandCategory;
  readonly categoryRank: number;
  readonly tiebreakers: readonly number[];
  readonly cards: readonly Card[];
  readonly description: string;
  readonly score: readonly number[];
}

const CATEGORY_RANK: Record<HandCategory, number> = Object.fromEntries(
  HAND_CATEGORIES.map((category, index) => [category, index]),
) as Record<HandCategory, number>;

function rankGroups(cards: readonly Card[]): Array<{ rank: Rank; count: number }> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((left, right) => right.count - left.count || right.rank - left.rank);
}

function straightHigh(cards: readonly Card[]): number | null {
  const ranks: number[] = [...new Set(cards.map((card) => card.rank))].sort((a, b) => b - a);
  if (ranks.includes(14)) ranks.push(1);
  let run = 1;
  for (let index = 1; index < ranks.length; index += 1) {
    if ((ranks[index - 1] ?? 0) - (ranks[index] ?? 0) === 1) {
      run += 1;
      if (run >= 5) return ranks[index - 4] ?? null;
    } else {
      run = 1;
    }
  }
  return null;
}

function makeHand(category: HandCategory, tiebreakers: readonly number[], cards: readonly Card[]): EvaluatedHand {
  const categoryRank = CATEGORY_RANK[category];
  return {
    category,
    categoryRank,
    tiebreakers,
    cards: [...cards],
    description: describeHand(category, tiebreakers),
    score: [categoryRank, ...tiebreakers],
  };
}

function describeHand(category: HandCategory, tiebreakers: readonly number[]): string {
  const faceNames: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J" };
  const rankName = (rank: number): string => faceNames[rank] ?? String(rank);
  const first = rankName(tiebreakers[0] ?? 0);
  const second = rankName(tiebreakers[1] ?? 0);
  switch (category) {
    case "straightFlush":
      return tiebreakers[0] === 14 ? "Royal flush" : `${first}-high straight flush`;
    case "fourOfAKind":
      return `Four ${first}s`;
    case "fullHouse":
      return `${first}s full of ${second}s`;
    case "flush":
      return `${first}-high flush`;
    case "straight":
      return `${first}-high straight`;
    case "threeOfAKind":
      return `Three ${first}s`;
    case "twoPair":
      return `${first}s and ${second}s`;
    case "pair":
      return `Pair of ${first}s`;
    case "highCard":
      return `${first} high`;
  }
}

export function evaluateFive(cards: readonly Card[]): EvaluatedHand {
  if (cards.length !== 5) throw new Error("Exactly five cards are required.");
  assertUniqueCards(cards);

  const groups = rankGroups(cards);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const highStraight = straightHigh(cards);

  if (flush && highStraight !== null) return makeHand("straightFlush", [highStraight], cards);

  const four = groups.find((group) => group.count === 4);
  if (four) {
    const kicker = groups.find((group) => group.count === 1)?.rank ?? 0;
    return makeHand("fourOfAKind", [four.rank, kicker], cards);
  }

  const triple = groups.find((group) => group.count === 3);
  const pair = groups.find((group) => group.count === 2);
  if (triple && pair) return makeHand("fullHouse", [triple.rank, pair.rank], cards);

  const descending = cards.map((card) => card.rank).sort((a, b) => b - a);
  if (flush) return makeHand("flush", descending, cards);
  if (highStraight !== null) return makeHand("straight", [highStraight], cards);

  if (triple) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank);
    return makeHand("threeOfAKind", [triple.rank, ...kickers], cards);
  }

  const pairs = groups.filter((group) => group.count === 2).sort((a, b) => b.rank - a.rank);
  if (pairs.length === 2) {
    const kicker = groups.find((group) => group.count === 1)?.rank ?? 0;
    return makeHand("twoPair", [pairs[0]?.rank ?? 0, pairs[1]?.rank ?? 0, kicker], cards);
  }

  if (pairs.length === 1) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank);
    return makeHand("pair", [pairs[0]?.rank ?? 0, ...kickers], cards);
  }

  return makeHand("highCard", descending, cards);
}

function combinationsOfFive(cards: readonly Card[]): Card[][] {
  const combinations: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            if (combo.every((card): card is Card => card !== undefined)) combinations.push(combo);
          }
        }
      }
    }
  }
  return combinations;
}

export function compareHands(left: EvaluatedHand, right: EvaluatedHand): number {
  const length = Math.max(left.score.length, right.score.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.score[index] ?? 0) - (right.score[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function evaluateBestHand(cards: readonly Card[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) throw new Error("Five to seven cards are required.");
  assertUniqueCards(cards);
  const hands = combinationsOfFive(cards).map(evaluateFive);
  const best = hands.reduce((current, candidate) => (compareHands(candidate, current) > 0 ? candidate : current));
  return { ...best, cards: [...best.cards].sort((a, b) => b.rank - a.rank || cardCode(a).localeCompare(cardCode(b))) };
}

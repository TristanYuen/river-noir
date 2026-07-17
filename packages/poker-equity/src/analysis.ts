import { evaluateBestHand, type Card, type HandCategory, type Rank } from "@river-noir/poker-engine";

export type DrawType = "flushDraw" | "openEndedStraightDraw" | "gutshot" | "overcards" | "backdoorFlush";

export interface HandAnalysis {
  readonly madeHand: HandCategory | "preflop";
  readonly madeHandDescription: string;
  readonly draws: readonly DrawType[];
  readonly estimatedOuts: number;
  readonly strength: "veryWeak" | "weak" | "medium" | "strong" | "premium";
  readonly isNutsCandidate: boolean;
}

function uniqueRanks(cards: readonly Card[]): number[] {
  const ranks: number[] = [...new Set(cards.map((card) => card.rank))];
  if (ranks.includes(14)) ranks.push(1);
  return ranks.sort((a, b) => a - b);
}

function straightDraw(cards: readonly Card[]): { type?: DrawType; outs: number } {
  const ranks = uniqueRanks(cards);
  let gutshots = 0;
  let openEnded = false;
  for (let start = 1; start <= 10; start += 1) {
    const target = [start, start + 1, start + 2, start + 3, start + 4];
    const missing = target.filter((rank) => !ranks.includes(rank));
    if (missing.length === 1) {
      if (missing[0] === start || missing[0] === start + 4) openEnded = true;
      else gutshots += 1;
    }
  }
  if (openEnded) return { type: "openEndedStraightDraw", outs: 8 };
  if (gutshots > 0) return { type: "gutshot", outs: Math.min(8, gutshots * 4) };
  return { outs: 0 };
}

export function analyzeHand(heroCards: readonly Card[], communityCards: readonly Card[]): HandAnalysis {
  if (heroCards.length !== 2) throw new Error("Hand analysis requires two hero cards.");
  if (communityCards.length === 0) {
    const paired = heroCards[0]?.rank === heroCards[1]?.rank;
    const high = Math.max(heroCards[0]?.rank ?? 0, heroCards[1]?.rank ?? 0);
    return {
      madeHand: "preflop",
      madeHandDescription: paired ? "Pocket pair" : "Unmade hand",
      draws: [],
      estimatedOuts: 0,
      strength: paired && high >= 10 ? "premium" : high >= 13 ? "strong" : high >= 10 ? "medium" : "weak",
      isNutsCandidate: paired && high === 14,
    };
  }

  const cards = [...heroCards, ...communityCards];
  const evaluated = evaluateBestHand(cards);
  const draws: DrawType[] = [];
  let estimatedOuts = 0;
  if (communityCards.length < 5) {
    const suitCounts = new Map<Card["suit"], number>();
    for (const card of cards) suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    const maxSuitCount = Math.max(...suitCounts.values());
    if (maxSuitCount === 4) {
      draws.push("flushDraw");
      estimatedOuts += 9;
    } else if (maxSuitCount === 3 && communityCards.length === 3) {
      draws.push("backdoorFlush");
    }
    const straight = straightDraw(cards);
    if (straight.type) draws.push(straight.type);
    estimatedOuts += straight.outs;
    const boardHigh = Math.max(...communityCards.map((card) => card.rank));
    const overcards = heroCards.filter((card) => card.rank > boardHigh).length;
    if (evaluated.category === "highCard" && overcards > 0) {
      draws.push("overcards");
      estimatedOuts += overcards * 3;
    }
  }

  const strengthByCategory: Record<HandCategory, HandAnalysis["strength"]> = {
    highCard: draws.length > 0 ? "weak" : "veryWeak",
    pair: "medium",
    twoPair: "strong",
    threeOfAKind: "strong",
    straight: "premium",
    flush: "premium",
    fullHouse: "premium",
    fourOfAKind: "premium",
    straightFlush: "premium",
  };
  const topRank = evaluated.tiebreakers[0] as Rank | undefined;
  return {
    madeHand: evaluated.category,
    madeHandDescription: evaluated.description,
    draws,
    estimatedOuts: Math.min(15, estimatedOuts),
    strength: strengthByCategory[evaluated.category],
    isNutsCandidate: evaluated.category === "straightFlush"
      || evaluated.category === "fourOfAKind"
      || (evaluated.category === "flush" && topRank === 14),
  };
}

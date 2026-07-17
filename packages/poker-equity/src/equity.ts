import {
  assertUniqueCards,
  cardCode,
  compareHands,
  createDeck,
  evaluateBestHand,
  shuffleDeck,
  type Card,
  type RandomSource,
} from "@river-noir/poker-engine";
import { SeededRandom } from "./random.js";

export interface EquityRequest {
  readonly heroCards: readonly Card[];
  readonly communityCards: readonly Card[];
  readonly opponentCount: number;
  readonly knownOpponentCards?: readonly (readonly Card[])[];
  readonly iterations?: number;
  readonly random?: RandomSource;
}

export interface EquityResult {
  readonly wins: number;
  readonly ties: number;
  readonly losses: number;
  readonly winProbability: number;
  readonly tieProbability: number;
  readonly equity: number;
  readonly iterations: number;
}

function validateRequest(request: EquityRequest): void {
  if (request.heroCards.length !== 2) throw new Error("Equity calculation requires two hero cards.");
  if (request.communityCards.length > 5) throw new Error("At most five community cards are allowed.");
  if (!Number.isInteger(request.opponentCount) || request.opponentCount < 1 || request.opponentCount > 9) {
    throw new Error("opponentCount must be between 1 and 9.");
  }
  if ((request.knownOpponentCards?.length ?? 0) > request.opponentCount) {
    throw new Error("There are more known hands than opponents.");
  }
  for (const hand of request.knownOpponentCards ?? []) {
    if (hand.length !== 2) throw new Error("Each known opponent hand must contain two cards.");
  }
  assertUniqueCards([
    ...request.heroCards,
    ...request.communityCards,
    ...(request.knownOpponentCards ?? []).flat(),
  ]);
}

export function calculateEquity(request: EquityRequest): EquityResult {
  validateRequest(request);
  const iterations = Math.max(1, Math.floor(request.iterations ?? 5_000));
  const random = request.random ?? new SeededRandom(Date.now());
  const knownOpponentCards = request.knownOpponentCards ?? [];
  const excluded = new Set([
    ...request.heroCards,
    ...request.communityCards,
    ...knownOpponentCards.flat(),
  ].map(cardCode));
  const availableDeck = createDeck().filter((card) => !excluded.has(cardCode(card)));
  const boardCardsNeeded = 5 - request.communityCards.length;
  const unknownOpponentCount = request.opponentCount - knownOpponentCards.length;
  const cardsNeeded = boardCardsNeeded + unknownOpponentCount * 2;
  if (cardsNeeded > availableDeck.length) throw new Error("There are not enough remaining cards.");

  let wins = 0;
  let ties = 0;
  let losses = 0;
  let equityShare = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffled = shuffleDeck(availableDeck, random);
    let cursor = 0;
    const opponentHands: Card[][] = knownOpponentCards.map((hand) => [...hand]);
    for (let opponent = 0; opponent < unknownOpponentCount; opponent += 1) {
      const first = shuffled[cursor];
      const second = shuffled[cursor + 1];
      if (!first || !second) throw new Error("Simulation ran out of cards for an opponent.");
      opponentHands.push([first, second]);
      cursor += 2;
    }
    const board = [...request.communityCards, ...shuffled.slice(cursor, cursor + boardCardsNeeded)];
    const heroHand = evaluateBestHand([...request.heroCards, ...board]);
    const opponentResults = opponentHands.map((cards) => evaluateBestHand([...cards, ...board]));
    const betterCount = opponentResults.filter((hand) => compareHands(hand, heroHand) > 0).length;
    if (betterCount > 0) {
      losses += 1;
      continue;
    }
    const tiedOpponents = opponentResults.filter((hand) => compareHands(hand, heroHand) === 0).length;
    if (tiedOpponents > 0) {
      ties += 1;
      equityShare += 1 / (tiedOpponents + 1);
    } else {
      wins += 1;
      equityShare += 1;
    }
  }

  return {
    wins,
    ties,
    losses,
    winProbability: wins / iterations,
    tieProbability: ties / iterations,
    equity: equityShare / iterations,
    iterations,
  };
}

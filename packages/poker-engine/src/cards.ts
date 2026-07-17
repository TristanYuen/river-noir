import { RANKS, SUITS, type Card, type RandomSource } from "./types.js";

const SUIT_CODES = {
  clubs: "c",
  diamonds: "d",
  hearts: "h",
  spades: "s",
} as const;

const CODE_SUITS = {
  c: "clubs",
  d: "diamonds",
  h: "hearts",
  s: "spades",
} as const;

const RANK_CODES: Record<number, string> = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "T",
};

const CODE_RANKS: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
};

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function cardCode(card: Card): string {
  return `${RANK_CODES[card.rank] ?? String(card.rank)}${SUIT_CODES[card.suit]}`;
}

export function parseCard(code: string): Card {
  const normalized = code.trim();
  if (normalized.length !== 2) {
    throw new Error(`Invalid card code: ${code}`);
  }

  const rankCode = normalized[0]?.toUpperCase() ?? "";
  const suitCode = normalized[1]?.toLowerCase() as keyof typeof CODE_SUITS;
  const rank = CODE_RANKS[rankCode] ?? Number(rankCode);
  const suit = CODE_SUITS[suitCode];

  if (!RANKS.includes(rank as (typeof RANKS)[number]) || !suit) {
    throw new Error(`Invalid card code: ${code}`);
  }

  return { rank: rank as Card["rank"], suit };
}

export function parseCards(codes: string): Card[] {
  return codes
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCard);
}

export function shuffleDeck(deck: readonly Card[], random: RandomSource): Card[] {
  const result = [...deck];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random.next() * (index + 1));
    const current = result[index];
    const swapped = result[swapIndex];
    if (!current || !swapped) {
      throw new Error("Deck shuffle reached an invalid index.");
    }
    result[index] = swapped;
    result[swapIndex] = current;
  }
  return result;
}

export function assertUniqueCards(cards: readonly Card[]): void {
  const codes = cards.map(cardCode);
  if (new Set(codes).size !== codes.length) {
    throw new Error("Duplicate cards detected.");
  }
}

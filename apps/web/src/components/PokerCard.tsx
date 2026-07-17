import type { Card } from "@river-noir/poker-engine";

const SUIT_SYMBOL = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
} as const;

const RANK_LABEL: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J" };

interface PokerCardProps {
  readonly card?: Card | undefined;
  readonly hidden?: boolean;
  readonly compact?: boolean;
  readonly placeholder?: boolean;
}

export function PokerCard({ card, hidden = false, compact = false, placeholder = false }: PokerCardProps) {
  if (placeholder) return <div className={`poker-card poker-card--placeholder${compact ? " poker-card--compact" : ""}`} aria-hidden="true" />;
  if (hidden || !card) {
    return (
      <div className={`poker-card poker-card--back${compact ? " poker-card--compact" : ""}`} aria-label="Hidden card">
        <div className="poker-card__back-mark">RN</div>
      </div>
    );
  }
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div className={`poker-card${compact ? " poker-card--compact" : ""}${red ? " poker-card--red" : ""}`} aria-label={`${RANK_LABEL[card.rank] ?? card.rank} ${card.suit}`}>
      <span className="poker-card__rank">{RANK_LABEL[card.rank] ?? card.rank}</span>
      <span className="poker-card__suit">{SUIT_SYMBOL[card.suit]}</span>
      <span className="poker-card__center-suit">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}

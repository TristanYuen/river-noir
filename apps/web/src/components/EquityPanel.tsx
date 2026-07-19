import { Activity, BookOpen, Info, Pin, Power, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { Locale, PlayerGameView } from "@river-noir/protocol";
import type { HandCategory } from "@river-noir/poker-engine";
import type { DrawType } from "@river-noir/poker-equity";
import type { EquityAnalysisState } from "../hooks/useEquityAnalysis.js";
import { translate, type MessageKey } from "../i18n.js";

interface EquityPanelProps {
  readonly view: PlayerGameView;
  readonly locale: Locale;
  readonly state: EquityAnalysisState;
  readonly enabled: boolean;
  readonly open: boolean;
  readonly pinned: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPinnedChange: (pinned: boolean) => void;
}

const categoryKey: Record<HandCategory, MessageKey> = {
  highCard: "highCard",
  pair: "pair",
  twoPair: "twoPair",
  threeOfAKind: "threeOfAKind",
  straight: "straight",
  flush: "flush",
  fullHouse: "fullHouse",
  fourOfAKind: "fourOfAKind",
  straightFlush: "straightFlush",
};

const drawKey: Record<DrawType, MessageKey> = {
  flushDraw: "flushDraw",
  openEndedStraightDraw: "openEndedStraightDraw",
  gutshot: "gutshot",
  overcards: "overcards",
  backdoorFlush: "backdoorFlush",
};

type GuideSuit = "clubs" | "diamonds" | "hearts" | "spades";

interface GuideCard {
  readonly rank: string;
  readonly suit: GuideSuit;
}

interface GuideHand {
  readonly nameKey: MessageKey;
  readonly cards: readonly GuideCard[];
}

const SUIT_SYMBOL: Record<GuideSuit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const HAND_GUIDE: readonly GuideHand[] = [
  { nameKey: "royalFlush", cards: [{ rank: "A", suit: "spades" }, { rank: "K", suit: "spades" }, { rank: "Q", suit: "spades" }, { rank: "J", suit: "spades" }, { rank: "10", suit: "spades" }] },
  { nameKey: "straightFlush", cards: [{ rank: "9", suit: "hearts" }, { rank: "8", suit: "hearts" }, { rank: "7", suit: "hearts" }, { rank: "6", suit: "hearts" }, { rank: "5", suit: "hearts" }] },
  { nameKey: "fourOfAKind", cards: [{ rank: "Q", suit: "spades" }, { rank: "Q", suit: "hearts" }, { rank: "Q", suit: "diamonds" }, { rank: "Q", suit: "clubs" }, { rank: "2", suit: "spades" }] },
  { nameKey: "fullHouse", cards: [{ rank: "J", suit: "spades" }, { rank: "J", suit: "hearts" }, { rank: "J", suit: "diamonds" }, { rank: "8", suit: "clubs" }, { rank: "8", suit: "diamonds" }] },
  { nameKey: "flush", cards: [{ rank: "A", suit: "diamonds" }, { rank: "J", suit: "diamonds" }, { rank: "8", suit: "diamonds" }, { rank: "5", suit: "diamonds" }, { rank: "2", suit: "diamonds" }] },
  { nameKey: "straight", cards: [{ rank: "10", suit: "clubs" }, { rank: "9", suit: "diamonds" }, { rank: "8", suit: "spades" }, { rank: "7", suit: "hearts" }, { rank: "6", suit: "clubs" }] },
  { nameKey: "threeOfAKind", cards: [{ rank: "7", suit: "spades" }, { rank: "7", suit: "hearts" }, { rank: "7", suit: "diamonds" }, { rank: "K", suit: "clubs" }, { rank: "3", suit: "diamonds" }] },
  { nameKey: "twoPair", cards: [{ rank: "A", suit: "spades" }, { rank: "A", suit: "hearts" }, { rank: "9", suit: "diamonds" }, { rank: "9", suit: "clubs" }, { rank: "4", suit: "spades" }] },
  { nameKey: "pair", cards: [{ rank: "K", suit: "spades" }, { rank: "K", suit: "hearts" }, { rank: "10", suit: "diamonds" }, { rank: "6", suit: "clubs" }, { rank: "3", suit: "spades" }] },
  { nameKey: "highCard", cards: [{ rank: "A", suit: "spades" }, { rank: "J", suit: "hearts" }, { rank: "8", suit: "diamonds" }, { rank: "5", suit: "clubs" }, { rank: "2", suit: "spades" }] },
];

export function EquityPanel(props: EquityPanelProps) {
  const { view, locale, state, enabled, open, pinned, onEnabledChange, onOpenChange, onPinnedChange } = props;
  const [tab, setTab] = useState<"live" | "guide">("live");
  const t = (key: MessageKey) => translate(locale, key);
  const percentage = (value: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
  const madeHand = state.analysis?.madeHand === "preflop"
    ? (state.analysis.madeHandDescription === "Pocket pair" ? t("pocketPair") : t("unmadeHand"))
    : state.analysis ? t(categoryKey[state.analysis.madeHand] ?? "highCard") : "—";

  return (
    <div
      className="equity-control"
      onMouseEnter={() => onOpenChange(true)}
      onMouseLeave={() => { if (!pinned) onOpenChange(false); }}
    >
      {open && (
        <section className="equity-panel glass-panel" role="dialog" aria-label={t("analysis")}>
          <header>
            <div><Activity size={17} /><span>{t("analysis")}</span></div>
            <div>
              <button
                type="button"
                className={enabled ? "is-active" : ""}
                onClick={() => onEnabledChange(!enabled)}
                aria-pressed={enabled}
                aria-label={t(enabled ? "pauseAnalysis" : "resumeAnalysis")}
                title={t(enabled ? "pauseAnalysis" : "resumeAnalysis")}
              >
                <Power size={14} />
              </button>
              <button type="button" className={pinned ? "is-active" : ""} onClick={() => onPinnedChange(!pinned)} aria-label={t("pinPanel")}><Pin size={14} /></button>
              <button type="button" onClick={() => { onPinnedChange(false); onOpenChange(false); }} aria-label={t("closePanel")}><X size={15} /></button>
            </div>
          </header>

          <div className="equity-panel__tabs" role="tablist" aria-label={t("analysisViews")}>
            <button type="button" role="tab" aria-selected={tab === "live"} className={tab === "live" ? "is-active" : ""} onClick={() => setTab("live")}><Activity size={14} />{t("liveAnalysis")}</button>
            <button type="button" role="tab" aria-selected={tab === "guide"} className={tab === "guide" ? "is-active" : ""} onClick={() => setTab("guide")}><BookOpen size={14} />{t("handGuide")}</button>
          </div>

          {tab === "guide" ? (
            <div className="hand-guide">
              <p className="hand-guide__intro">{t("handGuideHint")}</p>
              <div className="hand-guide__list">
                {HAND_GUIDE.map((hand, index) => (
                  <div className="hand-guide__item" key={hand.nameKey}>
                    <div className="hand-guide__rank"><span>{index + 1}</span><strong>{t(hand.nameKey)}</strong></div>
                    <div className="hand-guide__cards" aria-label={t(hand.nameKey)}>
                      {hand.cards.map((card, cardIndex) => (
                        <span className={card.suit === "hearts" || card.suit === "diamonds" ? "is-red" : ""} key={`${card.rank}-${card.suit}-${cardIndex}`}>
                          <b>{card.rank}</b><i>{SUIT_SYMBOL[card.suit]}</i>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !enabled ? (
            <div className="analysis-paused">
              <Power size={22} />
              <strong>{t("analysisPaused")}</strong>
              <p>{t("analysisPausedHint")}</p>
              <button type="button" onClick={() => onEnabledChange(true)}>{t("resumeAnalysis")}</button>
            </div>
          ) : state.loading ? (
            <div className="equity-loading"><span /><p>{t("calculating")}</p></div>
          ) : state.error ? (
            <div className="equity-loading"><p>{state.error}</p></div>
          ) : (
            <div className="equity-panel__body">
              <div className="equity-hero-stat">
                <div className="equity-ring" style={{ "--equity": `${(state.equity?.equity ?? 0) * 360}deg` } as CSSProperties}>
                  <div><strong>{percentage(state.equity?.equity ?? 0)}</strong><span>{t("equity")}</span></div>
                </div>
                <div className="equity-minor-stats">
                  <div><span>{t("tie")}</span><strong>{percentage(state.equity?.tieProbability ?? 0)}</strong></div>
                  <div><span>{t("simulations")}</span><strong>{state.equity?.iterations.toLocaleString(locale) ?? "—"}</strong></div>
                </div>
              </div>
              <div className="analysis-row"><span>{t("handStrength")}</span><strong>{madeHand}</strong></div>
              <div className="analysis-row"><span>{t("draws")}</span><strong>{state.analysis?.draws.length ? state.analysis.draws.map((draw) => t(drawKey[draw])).join(" · ") : t("noDraw")}</strong></div>
              <div className="analysis-row"><span>{t("outs")}</span><strong>{state.analysis?.estimatedOuts ?? 0}</strong></div>
              <div className="range-hint">
                <Info size={15} />
                <div><strong>{t("rangeHint")}</strong><p>{view.players.filter((player) => player.status === "active" || player.status === "allIn").length > 3 ? t("rangeWide") : t("rangeNarrow")}</p></div>
              </div>
              <p className="analysis-disclaimer">{t("infoShort")}</p>
            </div>
          )}
        </section>
      )}
      <button
        className={`equity-trigger${enabled ? "" : " equity-trigger--paused"}`}
        type="button"
        aria-label={t("analysis")}
        aria-expanded={open}
        onClick={() => { onOpenChange(!open); onPinnedChange(!open); }}
      >
        <Activity size={19} /><i />
      </button>
    </div>
  );
}

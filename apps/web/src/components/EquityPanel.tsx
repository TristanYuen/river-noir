import { Activity, Info, Pin, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { Locale, PlayerGameView } from "@river-noir/protocol";
import type { HandCategory } from "@river-noir/poker-engine";
import type { DrawType } from "@river-noir/poker-equity";
import type { EquityAnalysisState } from "../hooks/useEquityAnalysis.js";
import { translate, type MessageKey } from "../i18n.js";

interface EquityPanelProps {
  readonly view: PlayerGameView;
  readonly locale: Locale;
  readonly state: EquityAnalysisState;
  readonly open: boolean;
  readonly pinned: boolean;
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

export function EquityPanel(props: EquityPanelProps) {
  const { view, locale, state, open, pinned, onOpenChange, onPinnedChange } = props;
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
              <button type="button" className={pinned ? "is-active" : ""} onClick={() => onPinnedChange(!pinned)} aria-label="Pin"><Pin size={14} /></button>
              <button type="button" onClick={() => { onPinnedChange(false); onOpenChange(false); }} aria-label="Close"><X size={15} /></button>
            </div>
          </header>
          {state.loading ? (
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
      <button className="equity-trigger" type="button" aria-label={t("analysis")} onClick={() => { onOpenChange(!open); onPinnedChange(!open); }}>
        <span>!</span><i />
      </button>
    </div>
  );
}

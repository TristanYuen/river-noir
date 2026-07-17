import type { Locale, PlayerGameView } from "@river-noir/protocol";
import { translate, type MessageKey } from "../i18n.js";

const headlineKey: Record<PlayerGameView["street"], MessageKey> = {
  preflop: "dealerPreflop",
  flop: "dealerFlop",
  turn: "dealerTurn",
  river: "dealerRiver",
  showdown: "dealerShowdown",
};

const guideKey: Record<PlayerGameView["street"], MessageKey> = {
  preflop: "guidePreflop",
  flop: "guideFlop",
  turn: "guideTurn",
  river: "guideRiver",
  showdown: "guideShowdown",
};

export function DealerAnnouncement({ view, locale }: {
  readonly view: PlayerGameView;
  readonly locale: Locale;
}) {
  const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);
  const viewer = view.players.find((player) => player.id === view.viewerPlayerId);
  const acting = view.players.find((player) => player.id === view.actingPlayerId);
  let turnText = t("handSettled");
  let turnState = "settled";

  if (view.phase === "waiting") {
    turnText = t("waitingPlayers");
    turnState = "waiting";
  } else if (viewer?.status === "busted") {
    turnText = t("youAreEliminated");
    turnState = "eliminated";
  } else if (view.phase === "betting" && view.actingPlayerId === view.viewerPlayerId) {
    turnText = t("yourTurn");
    turnState = "your-turn";
  } else if (view.phase === "betting" && acting) {
    turnText = t("waitingForAction", { name: acting.name });
    turnState = "waiting";
  }

  return (
    <div
      key={`${view.handNumber}-${view.street}-${view.phase}`}
      className={`dealer-announcement dealer-announcement--${turnState}`}
      role="status"
      aria-live="polite"
    >
      <div className="dealer-announcement__mark"><span>D</span></div>
      <div className="dealer-announcement__copy">
        <span>{t("dealerAnnounces")} · {t(view.street as MessageKey)}</span>
        <strong>{t(headlineKey[view.street])}</strong>
        <p>{t(guideKey[view.street])}</p>
      </div>
      <div className="dealer-announcement__turn"><i />{turnText}</div>
    </div>
  );
}

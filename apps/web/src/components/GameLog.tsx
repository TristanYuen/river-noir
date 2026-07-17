import type { GameEvent, PlayerActionType } from "@river-noir/poker-engine";
import type { Locale, PlayerGameView } from "@river-noir/protocol";
import { formatChips, translate, type MessageKey } from "../i18n.js";

function eventText(event: GameEvent, view: PlayerGameView, locale: Locale): string {
  const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);
  const playerName = (id: string) => view.players.find((player) => player.id === id)?.name ?? id;
  if (event.type === "handStarted") return t("handStarted");
  if (event.type === "cardsDealt") return t("cardsDealt");
  if (event.type === "streetChanged") return t("streetChanged", { value: t(event.street as MessageKey) });
  if (event.type === "handCompleted") return t("handComplete");
  if (event.type === "blindPosted") {
    return `${playerName(event.playerId)} ${t(event.blind === "small" ? "smallBlind" : "bigBlind", { value: formatChips(locale, event.amount) })}`;
  }
  const actionKeys: Record<PlayerActionType, MessageKey> = {
    fold: "playerFolded",
    check: "playerChecked",
    call: "playerCalled",
    bet: "playerBet",
    raise: "playerRaised",
    allIn: "playerAllIn",
  };
  return t(actionKeys[event.action], { name: playerName(event.playerId), value: formatChips(locale, event.amount) });
}

export function GameLog({ view, locale }: { readonly view: PlayerGameView; readonly locale: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  return (
    <aside className="game-log glass-panel">
      <div className="panel-heading"><span>{t("gameLog")}</span><i>{view.recentEvents.length}</i></div>
      <div className="game-log__list">
        {view.recentEvents.length === 0 && <p>{t("emptyLog")}</p>}
        {[...view.recentEvents].reverse().map((event, index) => (
          <div className={`log-entry log-entry--${event.type}`} key={`${event.type}-${index}`}>
            <span />
            <p>{eventText(event, view, locale)}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

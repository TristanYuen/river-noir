import type { Locale, PlayerGameView } from "@river-noir/protocol";
import { PokerCard } from "./PokerCard.js";
import { PlayerSeat } from "./PlayerSeat.js";
import { formatChips, translate } from "../i18n.js";

export function PokerTable({ view, locale }: { readonly view: PlayerGameView; readonly locale: Locale }) {
  const ordered = [...view.players].sort((left, right) => left.seat - right.seat);
  const heroIndex = ordered.findIndex((player) => player.id === view.viewerPlayerId);
  const players = heroIndex >= 0 ? [...ordered.slice(heroIndex), ...ordered.slice(0, heroIndex)] : ordered;
  const wonByPlayer = new Map<string, number>();
  for (const award of view.result?.awards ?? []) wonByPlayer.set(award.playerId, (wonByPlayer.get(award.playerId) ?? 0) + award.amount);
  const positions = players.map((_, index) => {
    const angle = Math.PI / 2 + index * ((Math.PI * 2) / players.length);
    return { x: 50 + Math.cos(angle) * 44, y: 50 + Math.sin(angle) * 37 };
  });

  return (
    <div className={`poker-stage poker-stage--${players.length}`}>
      <div className="table-shadow" />
      <div className="poker-table">
        <div className="poker-table__rail">
          <div className="poker-table__felt">
            <div className="felt-grain" />
            <div className="table-insignia"><span>RIVER</span><i>♠</i><span>NOIR</span></div>
            <div className="board-zone">
              <div className="pot-display">
                <span>{translate(locale, "pot")}</span>
                <strong><i />{formatChips(locale, view.totalPot)}</strong>
              </div>
              <div className="community-cards">
                {Array.from({ length: 5 }, (_, index) => {
                  const card = view.communityCards[index];
                  return <PokerCard key={index} card={card} placeholder={!card} />;
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {players.map((player, index) => (
        <PlayerSeat
          key={player.id}
          player={player}
          locale={locale}
          position={positions[index] ?? { x: 50, y: 50 }}
          isActing={player.id === view.actingPlayerId}
          isViewer={player.id === view.viewerPlayerId}
          wonAmount={wonByPlayer.get(player.id) ?? 0}
        />
      ))}
    </div>
  );
}

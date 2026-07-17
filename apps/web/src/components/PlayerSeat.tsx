import type { CSSProperties } from "react";
import type { Locale, PublicPlayerView } from "@river-noir/protocol";
import { Cpu, WifiOff } from "lucide-react";
import { PokerCard } from "./PokerCard.js";
import { formatChips, translate, type MessageKey } from "../i18n.js";

interface PlayerSeatProps {
  readonly player: PublicPlayerView;
  readonly locale: Locale;
  readonly position: { x: number; y: number };
  readonly isActing: boolean;
  readonly isViewer: boolean;
  readonly isShowdownRevealed: boolean;
  readonly wonAmount: number;
}

const statusKey: Record<PublicPlayerView["status"], MessageKey> = {
  ready: "ready",
  active: "active",
  folded: "folded",
  allIn: "allInStatus",
  sittingOut: "sittingOut",
  busted: "busted",
};

export function PlayerSeat({ player, locale, position, isActing, isViewer, isShowdownRevealed, wonAmount }: PlayerSeatProps) {
  const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);
  const style = { "--seat-x": `${position.x}%`, "--seat-y": `${position.y}%` } as CSSProperties;
  return (
    <div className={`player-seat${isViewer ? " player-seat--viewer" : ""}${isActing ? " player-seat--acting" : ""}${isShowdownRevealed ? " player-seat--showdown-revealed" : ""}${player.status === "folded" ? " player-seat--folded" : ""}${player.status === "busted" ? " player-seat--busted" : ""}${wonAmount > 0 ? " player-seat--winner" : ""}`} style={style}>
      <div className="player-seat__cards">
        {(player.cardsVisible ? player.cards : [undefined, undefined]).map((card, index) => (
          <PokerCard key={index} card={card} hidden={!player.cardsVisible} compact={!isViewer} />
        ))}
      </div>
      {player.committedStreet > 0 && <div className="seat-bet"><i /><span>{formatChips(locale, player.committedStreet)}</span></div>}
      <div className="player-seat__panel">
        {isActing && <div className="turn-ring" />}
        <div className="player-avatar">{player.isAi ? <Cpu size={15} /> : player.name.slice(0, 1).toUpperCase()}</div>
        <div className="player-copy">
          <div><strong>{player.name}</strong>{!player.connected && <WifiOff size={12} />}</div>
          <span>{formatChips(locale, player.stack)}</span>
        </div>
        <div className="seat-status">{t(statusKey[player.status])}</div>
        {player.status === "busted" && <div className="elimination-stamp">{t("eliminated")}</div>}
        <div className="seat-badges">
          {player.isDealer && <b>{t("dealer")}</b>}
          {player.isSmallBlind && <b>SB</b>}
          {player.isBigBlind && <b>BB</b>}
        </div>
      </div>
      {wonAmount > 0 && <div className="winner-chip">{t("wonPot", { value: formatChips(locale, wonAmount) })}</div>}
    </div>
  );
}

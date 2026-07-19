import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Globe2, History, Volume2, VolumeX, Wifi } from "lucide-react";
import { Brand } from "./Brand.js";
import { PokerTable } from "./PokerTable.js";
import { ActionBar } from "./ActionBar.js";
import { GameLog } from "./GameLog.js";
import { EquityPanel } from "./EquityPanel.js";
import { useEquityAnalysis } from "../hooks/useEquityAnalysis.js";
import { useGameSound } from "../hooks/useGameSound.js";
import { formatChips, translate, type MessageKey } from "../i18n.js";
import { useGameStore } from "../store/gameStore.js";

export function TablePage() {
  const locale = useGameStore((state) => state.locale);
  const setLocale = useGameStore((state) => state.setLocale);
  const view = useGameStore((state) => state.view);
  const busy = useGameStore((state) => state.busy);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);
  const performAction = useGameStore((state) => state.performAction);
  const nextHand = useGameStore((state) => state.nextHand);
  const startGame = useGameStore((state) => state.startGame);
  const leaveTable = useGameStore((state) => state.leaveTable);
  const soundEnabled = useGameStore((state) => state.soundEnabled);
  const analysisEnabled = useGameStore((state) => state.analysisEnabled);
  const [localSoundEnabled, setLocalSoundEnabled] = useState(soundEnabled);
  const [localAnalysisEnabled, setLocalAnalysisEnabled] = useState(analysisEnabled);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisPinned, setAnalysisPinned] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const playSound = useGameSound(localSoundEnabled);
  const lastDealKey = useRef<string | null>(null);
  const analysis = useEquityAnalysis(view, localAnalysisEnabled);
  const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);

  useEffect(() => {
    if (!view || view.street === "showdown") return;
    const dealKey = `${view.handNumber}-${view.street}`;
    if (lastDealKey.current && lastDealKey.current !== dealKey) playSound("deal");
    lastDealKey.current = dealKey;
  }, [playSound, view?.handNumber, view?.street]);

  if (!view) {
    return <main className="table-page table-page--loading"><Brand /><div className="table-loader"><span /><p>{t("calculating")}</p></div></main>;
  }

  const onAction = (action: Parameters<typeof performAction>[0], amount?: number) => {
    playSound(action === "fold" ? "fold" : "chip");
    void performAction(action, amount);
  };
  const winnerAwards = view.result?.awards ?? [];
  const winners = [...new Set(winnerAwards.map((award) => award.playerId))]
    .map((id) => view.players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const fundedPlayers = view.players.filter((player) => player.stack > 0);
  const tournamentWinner = view.phase === "complete" && fundedPlayers.length === 1 ? fundedPlayers[0] : null;
  const eliminatedPlayers = view.players.filter((player) => player.status === "busted");
  const viewerEliminated = eliminatedPlayers.some((player) => player.id === view.viewerPlayerId);

  return (
    <main className="table-page">
      <header className="table-header glass-panel">
        <div className="table-header__left">
          <button className="leave-button" type="button" onClick={() => void leaveTable()} aria-label={t("leaveTable")}><ChevronLeft size={18} /><span>{t("leaveTable")}</span></button>
          <Brand compact />
          <span className="header-divider" />
          <div className="table-meta"><strong>{t(view.street as MessageKey)}</strong><span>{t("hand", { value: view.handNumber })}</span></div>
        </div>
        <div className="table-header__center"><span>{view.smallBlind} / {view.bigBlind}</span>{view.roomCode && <><i /><span>{t("roomCode")} · {view.roomCode}</span></>}<i /><span><Wifi size={13} />{t("connected")}</span></div>
        <div className="table-header__actions">
          <button className="icon-button" type="button" onClick={() => setMobileLogOpen(!mobileLogOpen)} aria-label={t("gameLog")}><History size={17} /></button>
          <button className="icon-button" type="button" onClick={() => setLocalSoundEnabled(!localSoundEnabled)} aria-label={t("sound")}>{localSoundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          <button className="language-button language-button--table" type="button" onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}><Globe2 size={15} />{t("language")}</button>
        </div>
      </header>

      <div className="table-layout">
        <section className="table-main">
          <PokerTable view={view} locale={locale} />
          {view.phase === "complete" && (
            <div className={`result-banner glass-panel${tournamentWinner ? " result-banner--champion" : ""}`}>
              <div>
                <span>{t(tournamentWinner ? "tournamentChampion" : "winner")}</span>
                <strong>{tournamentWinner?.name ?? winners.join(" · ")}</strong>
                <small>
                  {tournamentWinner
                    ? t("tournamentWon", { name: tournamentWinner.name })
                    : winnerAwards.length > 0
                      ? t("wonPot", { value: formatChips(locale, winnerAwards.reduce((sum, award) => sum + award.amount, 0)) })
                      : ""}
                </small>
                {!tournamentWinner && eliminatedPlayers.length > 0 && <small className="result-banner__eliminated">{t("eliminatedPlayers", { names: eliminatedPlayers.map((player) => player.name).join("、") })}</small>}
              </div>
              <button type="button" disabled={busy} onClick={() => void (tournamentWinner ? leaveTable() : nextHand())}>
                {t(tournamentWinner ? "returnLobby" : viewerEliminated ? "watchNextHand" : "nextHand")}
              </button>
            </div>
          )}
          {view.phase === "waiting" && (
            <div className="result-banner glass-panel">
              <div><span>{t("online")}</span><strong>{t("waitingPlayers")}</strong>{view.roomCode && <small>{t("roomCode")} · {view.roomCode}</small>}</div>
              {view.canStart && <button type="button" disabled={busy} onClick={() => void startGame()}>{t("startGame")}</button>}
            </div>
          )}
          <ActionBar view={view} locale={locale} busy={busy} onAction={onAction} />
          {analysisEnabled && (
            <EquityPanel
              view={view}
              locale={locale}
              state={analysis}
              enabled={localAnalysisEnabled}
              open={analysisOpen}
              pinned={analysisPinned}
              onEnabledChange={setLocalAnalysisEnabled}
              onOpenChange={setAnalysisOpen}
              onPinnedChange={setAnalysisPinned}
            />
          )}
        </section>
        <div className={`game-log-wrap${mobileLogOpen ? " game-log-wrap--open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) setMobileLogOpen(false); }}>
          <GameLog view={view} locale={locale} />
        </div>
      </div>

      {error && <button className="error-toast" type="button" onClick={clearError}>{error}<span>×</span></button>}
    </main>
  );
}

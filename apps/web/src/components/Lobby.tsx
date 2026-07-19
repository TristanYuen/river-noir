import { useState, type FormEvent } from "react";
import { Activity, ArrowRight, Bot, Globe2, LockKeyhole, Users, Volume2 } from "lucide-react";
import type { AiDifficulty } from "@river-noir/protocol";
import { Brand } from "./Brand.js";
import { formatChips, translate } from "../i18n.js";
import { useGameStore, type LocalSetup } from "../store/gameStore.js";

const STACKS = [5_000, 10_000, 20_000];
const BLINDS = [
  { small: 25, big: 50 },
  { small: 50, big: 100 },
  { small: 100, big: 200 },
];

function Switch({ checked, onChange, label }: { readonly checked: boolean; readonly onChange: (value: boolean) => void; readonly label: string }) {
  return (
    <button className={`switch${checked ? " switch--active" : ""}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Lobby() {
  const locale = useGameStore((state) => state.locale);
  const setLocale = useGameStore((state) => state.setLocale);
  const startLocalGame = useGameStore((state) => state.startLocalGame);
  const startOnlineGame = useGameStore((state) => state.startOnlineGame);
  const [mode, setMode] = useState<"local" | "online">("local");
  const [onlineAction, setOnlineAction] = useState<"create" | "join">("create");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState(() => globalThis.localStorage?.getItem("river-noir-nickname") ?? "");
  const [totalPlayers, setTotalPlayers] = useState(6);
  const [difficulty, setDifficulty] = useState<AiDifficulty>("standard");
  const [deepSeekEnabled, setDeepSeekEnabled] = useState(false);
  const [initialStack, setInitialStack] = useState(10_000);
  const [blindIndex, setBlindIndex] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  const deepSeekAvailable = import.meta.env.VITE_DEEPSEEK_ENABLED === "true";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleanNickname = nickname.trim() || (locale === "zh-CN" ? "旅人" : "Guest");
    globalThis.localStorage?.setItem("river-noir-nickname", cleanNickname);
    const blinds = BLINDS[blindIndex] ?? BLINDS[1];
    if (!blinds) return;
    const setup: LocalSetup = {
      nickname: cleanNickname,
      totalPlayers,
      difficulty,
      deepSeekEnabled: mode === "local" && deepSeekEnabled && deepSeekAvailable,
      initialStack,
      smallBlind: blinds.small,
      bigBlind: blinds.big,
      soundEnabled,
      analysisEnabled,
    };
    if (mode === "local") void startLocalGame(setup);
    else void startOnlineGame(setup, onlineAction === "join" ? roomCode : undefined);
  };

  const onlineEnabled = Boolean(import.meta.env.VITE_WS_URL);

  return (
    <main className="lobby-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <header className="lobby-header">
        <Brand />
        <button className="language-button" type="button" onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}>
          <Globe2 size={16} />
          {t("language")}
        </button>
      </header>

      <section className="lobby-grid">
        <div className="lobby-hero">
          <div className="hero-copy">
            <div className="eyebrow"><span />{t("heroEyebrow")}</div>
            <h1>{t("heroTitle")}</h1>
            <p>{t("heroBody")}</p>
          </div>

          <div className="table-sculpture" aria-hidden="true">
            <div className="table-sculpture__light" />
            <div className="table-sculpture__rail">
              <div className="table-sculpture__felt">
                <div className="table-sculpture__line" />
                <div className="table-sculpture__cards">
                  <span>A<i>♠</i></span><span>K<i>♠</i></span><span>Q<i>♠</i></span>
                </div>
                <div className="table-sculpture__pot"><b /> <b /> <b /></div>
              </div>
            </div>
          </div>

          <div className="trust-note"><LockKeyhole size={15} />{t("rulesNote")}</div>
        </div>

        <form className="setup-card" onSubmit={submit}>
          <div className="mode-tabs">
            <button className={`mode-tab${mode === "local" ? " mode-tab--active" : ""}`} type="button" onClick={() => setMode("local")}><Bot size={17} />{t("training")}</button>
            <button className={`mode-tab${mode === "online" ? " mode-tab--active" : ""}`} type="button" disabled={!onlineEnabled} title={!onlineEnabled ? t("serverUnavailable") : undefined} onClick={() => setMode("online")}><Users size={17} />{t("online")}{!onlineEnabled && <em>{t("comingSoon")}</em>}</button>
          </div>

          <div className="setup-card__body">
            <label className="field">
              <span>{t("nickname")}</span>
              <input value={nickname} maxLength={18} placeholder={t("nicknamePlaceholder")} onChange={(event) => setNickname(event.target.value)} />
            </label>

            {mode === "online" && (
              <div className="online-room-block">
                <div className="segmented-control">
                  <button type="button" className={onlineAction === "create" ? "is-selected" : ""} onClick={() => setOnlineAction("create")}>{t("createRoom")}</button>
                  <button type="button" className={onlineAction === "join" ? "is-selected" : ""} onClick={() => setOnlineAction("join")}>{t("joinRoom")}</button>
                </div>
                {onlineAction === "join" && (
                  <label className="field">
                    <span>{t("roomCode")}</span>
                    <input value={roomCode} maxLength={8} required placeholder={t("roomCodePlaceholder")} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} />
                  </label>
                )}
              </div>
            )}

            <div className="field">
              <div className="field__label-row"><span>{t("players")}</span><strong>{totalPlayers}</strong></div>
              <div className="seat-picker">
                {Array.from({ length: 8 }, (_, index) => index + 3).map((count) => (
                  <button key={count} type="button" className={count === totalPlayers ? "is-selected" : ""} onClick={() => setTotalPlayers(count)}>{count}</button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>{t("aiDifficulty")}</span>
              <div className="segmented-control">
                {(["casual", "standard", "expert"] as const).map((level) => (
                  <button key={level} type="button" className={difficulty === level ? "is-selected" : ""} onClick={() => setDifficulty(level)}>{t(level)}</button>
                ))}
              </div>
            </div>

            {mode === "local" && (
              <div className="field">
                <span>{t("aiEngine")}</span>
                <div className="segmented-control segmented-control--two">
                  <button type="button" className={!deepSeekEnabled ? "is-selected" : ""} onClick={() => setDeepSeekEnabled(false)}>{t("localAi")}</button>
                  <button
                    type="button"
                    className={deepSeekEnabled ? "is-selected" : ""}
                    disabled={!deepSeekAvailable}
                    title={!deepSeekAvailable ? t("deepSeekUnavailable") : undefined}
                    onClick={() => setDeepSeekEnabled(true)}
                  >
                    DeepSeek
                  </button>
                </div>
                {!deepSeekAvailable && <small className="field__hint">{t("deepSeekUnavailable")}</small>}
              </div>
            )}

            <div className="setup-row">
              <div className="field">
                <span>{t("startingStack")}</span>
                <select value={initialStack} onChange={(event) => setInitialStack(Number(event.target.value))}>
                  {STACKS.map((stack) => <option key={stack} value={stack}>{formatChips(locale, stack)}</option>)}
                </select>
              </div>
              <div className="field">
                <span>{t("blinds")}</span>
                <select value={blindIndex} onChange={(event) => setBlindIndex(Number(event.target.value))}>
                  {BLINDS.map((blind, index) => <option key={blind.big} value={index}>{blind.small} / {blind.big}</option>)}
                </select>
              </div>
            </div>

            <div className="preference-row">
              <div><Volume2 size={17} /><span>{t("sound")}</span><Switch checked={soundEnabled} onChange={setSoundEnabled} label={t("sound")} /></div>
              <div><Activity size={17} /><span>{t("autoAnalysis")}</span><Switch checked={analysisEnabled} onChange={setAnalysisEnabled} label={t("autoAnalysis")} /></div>
            </div>

            <button className="primary-button" type="submit">
              <span>{mode === "local" ? t("enterTable") : onlineAction === "create" ? t("createPrivateTable") : t("joinPrivateTable")}</span>
              <ArrowRight size={19} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

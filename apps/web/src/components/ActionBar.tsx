import { useEffect, useMemo, useState } from "react";
import type { PlayerActionType } from "@river-noir/poker-engine";
import type { Locale, PlayerGameView } from "@river-noir/protocol";
import { formatChips, translate } from "../i18n.js";

interface ActionBarProps {
  readonly view: PlayerGameView;
  readonly locale: Locale;
  readonly busy: boolean;
  readonly onAction: (action: PlayerActionType, amount?: number) => void;
}

export function ActionBar({ view, locale, busy, onAction }: ActionBarProps) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  const legal = view.legalActions;
  const aggressive = legal.find((action) => action.type === "bet" || action.type === "raise");
  const call = legal.find((action) => action.type === "call");
  const check = legal.find((action) => action.type === "check");
  const fold = legal.find((action) => action.type === "fold");
  const allIn = legal.find((action) => action.type === "allIn");
  const minimum = aggressive?.minAmount ?? 0;
  const maximum = aggressive?.maxAmount ?? minimum;
  const [amount, setAmount] = useState(minimum);
  useEffect(() => setAmount(minimum), [minimum, maximum, view.version]);
  const quickAmounts = useMemo(() => {
    if (!aggressive) return [];
    const pot = Math.max(view.bigBlind, view.totalPot);
    const values = [0.5, 0.67, 1].map((fraction) => {
      const raw = view.currentBet === 0 ? pot * fraction : view.currentBet + pot * fraction;
      return Math.max(minimum, Math.min(maximum, Math.round(raw)));
    });
    return [...new Set(values)];
  }, [aggressive, maximum, minimum, view.bigBlind, view.currentBet, view.totalPot]);

  if (view.phase !== "betting" || legal.length === 0) return <div className="action-bar action-bar--waiting" />;
  return (
    <div className="action-bar glass-panel">
      {aggressive && (
        <div className="raise-control">
          <div className="raise-control__top">
            <span>{t(aggressive.type === "raise" ? "raiseTo" : "betAmount", { value: formatChips(locale, amount) })}</span>
            <div>{quickAmounts.map((value, index) => <button key={value} type="button" onClick={() => setAmount(value)}>{index === 0 ? "½" : index === 1 ? "⅔" : "1×"}</button>)}</div>
          </div>
          <input type="range" min={minimum} max={maximum} step={Math.max(1, view.bigBlind / 2)} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        </div>
      )}
      <div className="action-buttons">
        {fold && <button className="action-button action-button--quiet" disabled={busy} type="button" onClick={() => onAction("fold")}>{t("fold")}</button>}
        {check && <button className="action-button" disabled={busy} type="button" onClick={() => onAction("check")}>{t("check")}</button>}
        {call && <button className="action-button" disabled={busy} type="button" onClick={() => onAction("call")}>{t("call", { value: formatChips(locale, call.amountToCall ?? 0) })}</button>}
        {aggressive && <button className="action-button action-button--primary" disabled={busy} type="button" onClick={() => onAction(aggressive.type, amount)}>{t(aggressive.type)}</button>}
        {allIn && <button className="action-button action-button--gold" disabled={busy} type="button" onClick={() => onAction("allIn")}>{t("allIn")}</button>}
      </div>
    </div>
  );
}

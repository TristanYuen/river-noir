export function Brand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`}>
      <div className="brand__mark" aria-hidden="true"><span>R</span><i /><span>N</span></div>
      <div>
        <div className="brand__name">RIVER NOIR</div>
        {!compact && <div className="brand__cn">暗河德州</div>}
      </div>
    </div>
  );
}

import type {
  TradeEvaluationResult,
  TradeEvaluationStatus,
} from "./trade-evaluation-types";
import type { WaveScannerTradeEvaluationPresentation } from "../wave-scanner-presentation-types";

export function mapTradeEvaluationPresentation(
  result: TradeEvaluationResult
): WaveScannerTradeEvaluationPresentation {
  return {
    status: result.status,
    passed: result.passed,
    firstFailure: result.firstFailure,
    entry: result.checks.entry,
    stop: result.checks.stop,
    target: result.checks.target,
    rr: result.checks.rr,
  };
}

function tradeEvaluationStatusLine(
  te: WaveScannerTradeEvaluationPresentation
): string {
  if (te.status === "PASSED") {
    return "Trade Evaluation: PASSED";
  }
  if (te.status === "FAILED") {
    const blocker = te.firstFailure ? ` · ${te.firstFailure}` : "";
    return `Trade Evaluation: FAILED${blocker}`;
  }
  const reason = te.firstFailure ?? "INSUFFICIENT_CONTEXT";
  return `Trade Evaluation: INSUFFICIENT_CONTEXT · ${reason}`;
}

function tradeEvaluationStatusClass(status: TradeEvaluationStatus): string {
  if (status === "PASSED") {
    return "trade-eval-passed";
  }
  if (status === "FAILED") {
    return "trade-eval-failed";
  }
  return "trade-eval-insufficient";
}

/** Main table Status column — render only (no domain math). */
export function formatTradeEvaluationStatusColumn(
  displayStatus: string,
  tradeEvaluation: WaveScannerTradeEvaluationPresentation
): string {
  const evalClass = tradeEvaluationStatusClass(tradeEvaluation.status);
  const evalLine = tradeEvaluationStatusLine(tradeEvaluation);
  return `<div class="status-ready-line">${displayStatus}</div><div class="trade-eval-line ${evalClass}">${evalLine}</div>`;
}

function labelCheck(outcome: string): string {
  if (outcome === "VALID") {
    return "VALID";
  }
  if (outcome === "STALE") {
    return "STALE";
  }
  if (outcome === "INVALID") {
    return "INVALID";
  }
  return "INSUFFICIENT_CONTEXT";
}

function setupValidityLabel(
  outcome: TradeEvaluationResult["checks"]["setupValidity"]
): string {
  if (outcome === "VALID") {
    return "VALID";
  }
  if (outcome === "INVALID") {
    return "INVALIDATED";
  }
  return "INSUFFICIENT_CONTEXT";
}

/** Scanner details copy — no trade-evaluation math (domain precomputed). */
export function formatTradeEvaluationDetailsSection(
  result: TradeEvaluationResult | null
): string {
  if (!result) {
    return `
    <section class="detail-section">
      <h3>Trade Evaluation</h3>
      <p class="muted">INSUFFICIENT_CONTEXT</p>
    </section>`;
  }
  const d = result.diagnostics;
  const fmt = (n: number | null) =>
    n !== null && Number.isFinite(n) ? n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }) : "—";
  const dev =
    d.entryDeviationPercent !== null
      ? `${d.entryDeviationPercent.toFixed(2)}%`
      : "—";
  const entryFreshnessLabel = labelCheck(result.checks.entry);
  const setupResultLabel = setupValidityLabel(result.checks.setupValidity);
  const rrLine =
    result.checks.rr === "VALID" && d.rrRatio !== null
      ? `PASS · ${d.rrRatio.toFixed(2)} &gt;= ${d.minimumRr.toFixed(2)}`
      : result.checks.rr === "INVALID" && d.rrRatio !== null
        ? `FAIL · ${d.rrRatio.toFixed(2)} &lt; ${d.minimumRr.toFixed(2)}`
        : labelCheck(result.checks.rr);
  const overall =
    result.status === "PASSED"
      ? "EVALUATION PASSED"
      : result.status === "FAILED"
        ? "EVALUATION FAILED"
        : "INSUFFICIENT_CONTEXT";
  const blocker =
    result.firstFailure !== null
      ? `<p>Blocker: ${result.firstFailure}</p>`
      : "";
  return `
    <section class="detail-section">
      <h3>Trade Evaluation</h3>
      <p>Entry Reference: ${fmt(d.entryReferencePrice)}</p>
      <p>Evaluation Close: ${fmt(result.evaluationPrice)}</p>
      <p>Live Market Price: ${fmt(d.liveMarketPrice)}</p>
      <p>Entry Deviation: ${dev}</p>
      <p>Entry Freshness: ${entryFreshnessLabel}</p>
      <p>Stop geometry: ${labelCheck(result.checks.stop)}</p>
      <p>Target geometry: ${labelCheck(result.checks.target)}</p>
      <p>RR: ${rrLine}</p>
      <p>Minimum RR: ${d.minimumRr.toFixed(2)}</p>
      <p>Structural Invalidation: ${fmt(d.structuralInvalidationReferencePrice)}</p>
      <p>Setup Validity: ${setupResultLabel}</p>
      <p>Result: ${setupResultLabel}</p>
      <p><strong>Result: ${overall}</strong></p>
      ${blocker}
      <p class="muted">Trade evaluation is not a trade signal. READY FOR EVALUATION is unchanged.</p>
    </section>`;
}

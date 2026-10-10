import { classifyHistoricalIndependentTradeSampleSize } from "./historical-independent-trade-analysis";
import { classifyHistoricalMeasurementRrBucketRow } from "./historical-measurement-rr-statistics";
import { HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS } from "./historical-measurement-rr-statistics-types";
import type { RrThresholdTheoreticalRProspectiveBandId } from "./historical-evaluator-rr-threshold-theoretical-r-analysis-types";
import { computeIndependentTradeWinRateDecisive } from "./historical-independent-trade-statistics";
import type { HistoricalPositionPolicyClassification } from "./historical-position-outcome-policy-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "./setup/prospective-setup-outcome-replay-types";
import type { IndependentTradeUnit } from "./independent-trade-unit-lifecycle-types";
import {
  HISTORICAL_ENTRY_PRICE_MOVE_QUALITY_ANALYSIS_SCHEMA_VERSION,
  PRICE_MOVE_REWARD_BUCKET_IDS,
  PRICE_MOVE_REWARD_BUCKET_THRESHOLDS_PERCENT,
  PRICE_MOVE_RISK_BUCKET_IDS,
  PRICE_MOVE_RISK_BUCKET_THRESHOLDS_PERCENT,
  type BuildHistoricalEntryPriceMoveQualityAnalysisInput,
  type HistoricalEntryPriceMoveQualityAnalysisReport,
  type PriceMoveBucketMetrics,
  type PriceMoveFailedWinTradeDetail,
  type PriceMoveGeometryValidity,
  type PriceMovePerTradeRow,
  type PriceMoveResearchQuestionAnswer,
  type PriceMoveRewardBucketId,
  type PriceMoveRiskBucketId,
  type PriceMoveRiskRewardCrossCell,
  type PriceMoveRrRewardCrossCell,
} from "./historical-entry-price-move-quality-analysis-types";

const RR_PARITY_TOLERANCE = 1e-6;

const WARNINGS: readonly string[] = [
  "observational_research_only",
  "no_trading_recommendation",
  "gross_price_move_excludes_fees_slippage_funding_execution",
  "leverage_not_applied_price_move_not_account_return",
  "no_causality",
  "no_pnl",
  "no_execution_simulation",
  "round_trip_cost_not_applied",
  "theoretical_r_from_b12h_frozen",
  "prospective_rr_canonical_from_lifecycle",
  "risk_reward_buckets_descriptive_not_strategy",
];

function isDecisive(c: HistoricalPositionPolicyClassification): boolean {
  return c === "FAVORABLE_RESOLUTION" || c === "ADVERSE_RESOLUTION";
}

function isWin(c: HistoricalPositionPolicyClassification): boolean {
  return c === "FAVORABLE_RESOLUTION";
}

function isLoss(c: HistoricalPositionPolicyClassification): boolean {
  return c === "ADVERSE_RESOLUTION";
}

export function classifyPriceMoveRewardBucket(
  rewardPercentage: number | null
): PriceMoveRewardBucketId {
  if (rewardPercentage === null || !Number.isFinite(rewardPercentage)) {
    return "REWARD_NOT_APPLICABLE";
  }
  const p = rewardPercentage;
  const t = PRICE_MOVE_REWARD_BUCKET_THRESHOLDS_PERCENT;
  if (p < t.lt0_10MaxExclusive) return "REWARD_LT_0_10";
  if (p < t.to0_25MaxExclusive) return "REWARD_0_10_TO_0_25";
  if (p < t.to0_50MaxExclusive) return "REWARD_0_25_TO_0_50";
  if (p < t.to1_00MaxExclusive) return "REWARD_0_50_TO_1_00";
  if (p < t.to2_00MaxExclusive) return "REWARD_1_00_TO_2_00";
  if (p < t.to3_00MaxExclusive) return "REWARD_2_00_TO_3_00";
  return "REWARD_GTE_3_00";
}

export function classifyPriceMoveRiskBucket(
  riskPercentage: number | null
): PriceMoveRiskBucketId {
  if (riskPercentage === null || !Number.isFinite(riskPercentage)) {
    return "RISK_NOT_APPLICABLE";
  }
  const p = riskPercentage;
  const t = PRICE_MOVE_RISK_BUCKET_THRESHOLDS_PERCENT;
  if (p < t.lt0_25MaxExclusive) return "RISK_LT_0_25";
  if (p < t.to0_50MaxExclusive) return "RISK_0_25_TO_0_50";
  if (p < t.to1_00MaxExclusive) return "RISK_0_50_TO_1_00";
  if (p < t.to2_00MaxExclusive) return "RISK_1_00_TO_2_00";
  if (p < t.to3_00MaxExclusive) return "RISK_2_00_TO_3_00";
  return "RISK_GTE_3_00";
}

export function classifyB12pProspectiveBand(
  canonicalRr: number | null
): RrThresholdTheoreticalRProspectiveBandId | null {
  if (canonicalRr === null || !Number.isFinite(canonicalRr)) {
    return null;
  }
  if (canonicalRr < 1.0) return "RR_LT_1_0";
  if (canonicalRr < 1.5) return "RR_1_0_TO_1_5";
  return "RR_GTE_1_5";
}

export function computeGrossPriceMovePercentages(trade: IndependentTradeUnit): {
  geometryValidity: PriceMoveGeometryValidity;
  grossRewardPercentage: number | null;
  grossRiskPercentage: number | null;
} {
  const entry = trade.entryReferencePrice;
  const target = trade.targetReferencePrice;
  const inv = trade.invalidationReferencePrice;
  const dir = trade.direction;

  if (entry === null || !Number.isFinite(entry) || entry <= 0) {
    return {
      geometryValidity: "INVALID_ENTRY",
      grossRewardPercentage: null,
      grossRiskPercentage: null,
    };
  }
  if (target === null || inv === null) {
    return {
      geometryValidity: "MISSING_REFERENCE",
      grossRewardPercentage: null,
      grossRiskPercentage: null,
    };
  }
  if (dir !== "BULLISH" && dir !== "BEARISH") {
    return {
      geometryValidity: "INVALID_DIRECTION",
      grossRewardPercentage: null,
      grossRiskPercentage: null,
    };
  }

  let rewardPct: number | null = null;
  let riskPct: number | null = null;
  let geom: PriceMoveGeometryValidity = "VALID";

  if (dir === "BULLISH") {
    if (target <= entry) {
      geom = "INVALID_TARGET_GEOMETRY";
    } else {
      rewardPct = ((target - entry) / entry) * 100;
    }
    if (inv >= entry) {
      geom =
        geom === "VALID" ? "INVALID_RISK_GEOMETRY" : geom;
      riskPct = null;
    } else {
      riskPct = ((entry - inv) / entry) * 100;
    }
  } else {
    if (target >= entry) {
      geom = "INVALID_TARGET_GEOMETRY";
    } else {
      rewardPct = ((entry - target) / entry) * 100;
    }
    if (inv <= entry) {
      geom =
        geom === "VALID" ? "INVALID_RISK_GEOMETRY" : geom;
      riskPct = null;
    } else {
      riskPct = ((inv - entry) / entry) * 100;
    }
  }

  if (rewardPct !== null && rewardPct < 0) {
    geom = "INVALID_TARGET_GEOMETRY";
    rewardPct = null;
  }
  if (riskPct !== null && riskPct < 0) {
    geom = "INVALID_RISK_GEOMETRY";
    riskPct = null;
  }

  return {
    geometryValidity: geom,
    grossRewardPercentage: rewardPct,
    grossRiskPercentage: riskPct,
  };
}

type Acc = {
  trades: number;
  decisive: number;
  wins: number;
  losses: number;
  rSum: number;
  rCount: number;
  rewardSum: number;
  rewardCount: number;
  riskSum: number;
  riskCount: number;
};

function emptyAcc(): Acc {
  return {
    trades: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    rSum: 0,
    rCount: 0,
    rewardSum: 0,
    rewardCount: 0,
    riskSum: 0,
    riskCount: 0,
  };
}

function accToMetrics(acc: Acc): PriceMoveBucketMetrics {
  const decisive = acc.decisive;
  return {
    trades: acc.trades,
    decisive,
    wins: acc.wins,
    losses: acc.losses,
    winRateDecisive: computeIndependentTradeWinRateDecisive(acc.wins, acc.losses),
    averageTheoreticalR:
      acc.rCount > 0 ? acc.rSum / acc.rCount : null,
    theoreticalRTradeCount: acc.rCount,
    sampleSizeQuality: classifyHistoricalIndependentTradeSampleSize(decisive),
    averageGrossRewardPercentage:
      acc.rewardCount > 0 ? acc.rewardSum / acc.rewardCount : null,
    averageGrossRiskPercentage:
      acc.riskCount > 0 ? acc.riskSum / acc.riskCount : null,
  };
}

function addTradeToAcc(
  acc: Acc,
  row: PriceMovePerTradeRow,
  theoreticalR: number | null
): void {
  acc.trades += 1;
  if (isDecisive(row.policyClassification)) {
    acc.decisive += 1;
    if (isWin(row.policyClassification)) acc.wins += 1;
    if (isLoss(row.policyClassification)) acc.losses += 1;
  }
  if (theoreticalR !== null && Number.isFinite(theoreticalR)) {
    acc.rSum += theoreticalR;
    acc.rCount += 1;
  }
  if (row.gross.grossRewardPercentage !== null) {
    acc.rewardSum += row.gross.grossRewardPercentage;
    acc.rewardCount += 1;
  }
  if (row.gross.grossRiskPercentage !== null) {
    acc.riskSum += row.gross.grossRiskPercentage;
    acc.riskCount += 1;
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function selectTradeExamples(
  rows: PriceMovePerTradeRow[]
): PriceMovePerTradeRow[] {
  const picked = new Set<string>();
  const out: PriceMovePerTradeRow[] = [];

  const tryPick = (row: PriceMovePerTradeRow | undefined) => {
    if (!row || picked.has(row.tradeId)) return;
    picked.add(row.tradeId);
    out.push(row);
  };

  const byReward = (a: PriceMovePerTradeRow, b: PriceMovePerTradeRow) =>
    (a.gross.grossRewardPercentage ?? Infinity) -
    (b.gross.grossRewardPercentage ?? Infinity);

  const validReward = rows.filter(
    (r) => r.gross.grossRewardPercentage !== null
  );
  const validRisk = rows.filter((r) => r.gross.grossRiskPercentage !== null);

  tryPick(validReward[0]);
  tryPick([...validReward].sort(byReward).at(-1));
  tryPick(
    [...validReward].sort(
      (a, b) =>
        Math.abs(a.gross.grossRewardPercentage! - 0.15) -
        Math.abs(b.gross.grossRewardPercentage! - 0.15)
    )[0]
  );

  tryPick(validRisk[0]);
  tryPick(
    [...validRisk].sort(
      (a, b) =>
        (b.gross.grossRiskPercentage ?? 0) - (a.gross.grossRiskPercentage ?? 0)
    )[0]
  );

  const failedWins = rows.filter((r) => r.failedWin);
  tryPick(
    failedWins.find((r) => r.evaluatorFirstFailure === "RR_BELOW_MINIMUM")
  );
  tryPick(failedWins[0]);

  const passedLoss = rows.filter((r) => r.passedLoss);
  tryPick(passedLoss[0]);

  for (const r of rows) {
    if (out.length >= 20) break;
    tryPick(r);
  }

  return out.slice(0, 20);
}

function buildAnalysisQuestions(
  rewardTable: HistoricalEntryPriceMoveQualityAnalysisReport["rewardBuckets"]["byBucket"]
): PriceMoveResearchQuestionAnswer[] {
  const small =
    rewardTable.REWARD_LT_0_10.trades +
    rewardTable.REWARD_0_10_TO_0_25.trades +
    rewardTable.REWARD_0_25_TO_0_50.trades;
  const mid = rewardTable.REWARD_0_50_TO_1_00.trades;
  const large =
    rewardTable.REWARD_1_00_TO_2_00.trades +
    rewardTable.REWARD_2_00_TO_3_00.trades +
    rewardTable.REWARD_GTE_3_00.trades;

  return [
    {
      questionId: "target_distance_typical",
      question: "Şu anda sistem target'a yüzde olarak ne kadar uzaklık koyuyor?",
      observation: `Gözlemsel özet: REWARD_LT_0_10 decisive win rate ${rewardTable.REWARD_LT_0_10.winRateDecisive.value ?? "n/a"}, avg reward ${rewardTable.REWARD_LT_0_10.averageGrossRewardPercentage ?? "n/a"}%; REWARD_0_50_TO_1_00 avg reward ${rewardTable.REWARD_0_50_TO_1_00.averageGrossRewardPercentage ?? "n/a"}%. Küçük/orta/büyük target trade sayıları (yaklaşık): ${small}/${mid}/${large}.`,
      descriptiveOnly: true,
    },
    {
      questionId: "stop_distance_typical",
      question: "Stop'a yüzde olarak ne kadar uzaklık koyuyor?",
      observation:
        "riskBuckets tablosundaki averageGrossRiskPercentage alanları stop mesafesinin yüzde karşılığını verir (canonical invalidation referansı).",
      descriptiveOnly: true,
    },
    {
      questionId: "small_target_win_rate",
      question: "Küçük target'lar gerçekten daha çok WIN oluyor mu?",
      observation: `REWARD_LT_0_10 winRateDecisive=${rewardTable.REWARD_LT_0_10.winRateDecisive.value ?? "n/a"} (decisive=${rewardTable.REWARD_LT_0_10.decisive}); REWARD_GTE_3_00 winRateDecisive=${rewardTable.REWARD_GTE_3_00.winRateDecisive.value ?? "n/a"} (decisive=${rewardTable.REWARD_GTE_3_00.decisive}). Karşılaştırma yalnızca gözlemsel.`,
      descriptiveOnly: true,
    },
    {
      questionId: "small_target_expectancy",
      question:
        "Çok küçük target'lar neden yüksek win rate'e rağmen zarar ettirebilir?",
      observation:
        "averageTheoreticalR ve B-12h frozen theoreticalR, path WIN/LOSS ile birlikte reward bucket tablosunda raporlanır; küçük reward + düşük RR kombinasyonlarında theoreticalR negatif veya düşük olabilir (RR validation ve B-12g geometry).",
      descriptiveOnly: true,
    },
    {
      questionId: "rr_alone",
      question: "RR tek başına yeterli mi?",
      observation:
        "rrRewardCross ve b12pProspectiveBandReference aynı prospective RR bandında farklı reward % gösterir; canonicalRrRatio reward/risk yüzdesi oranıyla uyumlu olsa da mutlak price-move magnitude ayrı boyuttur.",
      descriptiveOnly: true,
    },
    {
      questionId: "fees_small_target",
      question: "Fee neden özellikle küçük target işlemlerde önemli?",
      observation:
        "B-12r grossRewardPercentage fee içermez (roundTripCostPercentage NOT_APPLIED). Küçük gross reward % değerlerinde sabit round-trip maliyetler net reward'ı disproportionately tüketir — bu fazda hesaplanmadı, model tasarım notu.",
      descriptiveOnly: true,
    },
    {
      questionId: "e_close_entry",
      question: "Entry = E close olmasının bu sonuçlarla ilişkisi nedir?",
      observation:
        "entryReferencePrice lifecycle'da E close referansıdır; reward/risk % bu referanstan türetilir. Alternatif entry stratejisi B-12r kapsamında üretilmedi.",
      descriptiveOnly: true,
    },
    {
      questionId: "future_entry_research",
      question:
        "Gerçek entry strategy için bundan sonra hangi veri gerekir?",
      observation:
        "E sonrası fiyat yolları yalnızca outcome için kullanıldı; delayed entry veya fill simülasyonu için ayrı araştırma gerekir (B-12r future bars ile yeni entry üretmez).",
      descriptiveOnly: true,
    },
  ];
}

/**
 * B-12r: gross price-move % research on frozen independent trades (no pipeline re-run).
 */
export function buildHistoricalEntryPriceMoveQualityAnalysis(
  input: BuildHistoricalEntryPriceMoveQualityAnalysisInput
): HistoricalEntryPriceMoveQualityAnalysisReport {
  const { lifecycleReport, eligibilityAuditReport } = input;
  const theoreticalRByTradeId = new Map<string, number | null>();
  for (const row of eligibilityAuditReport.decisiveRows) {
    theoreticalRByTradeId.set(row.tradeId, row.theoreticalR);
  }

  const perTrade: PriceMovePerTradeRow[] = lifecycleReport.trades.map((trade) => {
    const { geometryValidity, grossRewardPercentage, grossRiskPercentage } =
      computeGrossPriceMovePercentages(trade);
    const canonical = trade.canonicalRrRatio;
    let implied: number | null = null;
    let within: boolean | null = null;
    let delta: number | null = null;
    if (
      grossRewardPercentage !== null &&
      grossRiskPercentage !== null &&
      grossRiskPercentage > 0
    ) {
      implied = grossRewardPercentage / grossRiskPercentage;
      if (canonical !== null && Number.isFinite(canonical)) {
        delta = Math.abs(implied - canonical);
        within = delta <= RR_PARITY_TOLERANCE;
      }
    }
    const theoreticalR = theoreticalRByTradeId.get(trade.tradeId) ?? null;
    const failedWin =
      trade.tradeEvaluationStatus === "FAILED" &&
      trade.policyClassification === "FAVORABLE_RESOLUTION";
    const passedLoss =
      trade.tradeEvaluationStatus === "PASSED" &&
      trade.policyClassification === "ADVERSE_RESOLUTION";

    return {
      tradeId: trade.tradeId,
      evaluationBarIndex: trade.evaluationBarIndex,
      evaluationBarTime: trade.evaluationBarTime,
      direction: trade.direction,
      entryReferencePrice: trade.entryReferencePrice,
      targetReferencePrice: trade.targetReferencePrice,
      invalidationReferencePrice: trade.invalidationReferencePrice,
      gross: {
        grossRewardPercentage,
        grossRiskPercentage,
        prospectiveRR: canonical,
        roundTripCostPercentage: null,
        roundTripCostStatus: "NOT_APPLIED",
      },
      geometryValidity,
      rewardBucket: classifyPriceMoveRewardBucket(grossRewardPercentage),
      riskBucket: classifyPriceMoveRiskBucket(grossRiskPercentage),
      prospectiveRrBucket: classifyHistoricalMeasurementRrBucketRow(canonical),
      b12pProspectiveBandId: classifyB12pProspectiveBand(canonical),
      rrValidation: {
        canonicalRrRatio: canonical,
        impliedRrFromPercentages: implied,
        absoluteDelta: delta,
        withinTolerance: within,
        tolerance: RR_PARITY_TOLERANCE,
        note:
          "impliedRr = grossRewardPercentage / grossRiskPercentage (percent units cancel); should match references.rr.ratio frozen at E.",
      },
      tradeEvaluationStatus: trade.tradeEvaluationStatus as PriceMovePerTradeRow["tradeEvaluationStatus"],
      evaluatorFirstFailure: trade.evaluatorFirstFailure,
      pathOutcome: trade.pathOutcome,
      policyClassification: trade.policyClassification,
      lifecycleDurationBars: trade.lifecycleDurationBars,
      theoreticalR,
      failedWin,
      passedLoss,
    };
  });

  const rewardAcc = Object.fromEntries(
    PRICE_MOVE_REWARD_BUCKET_IDS.map((id) => [id, emptyAcc()])
  ) as Record<PriceMoveRewardBucketId, Acc>;
  const riskAcc = Object.fromEntries(
    PRICE_MOVE_RISK_BUCKET_IDS.map((id) => [id, emptyAcc()])
  ) as Record<PriceMoveRiskBucketId, Acc>;
  const crossMap = new Map<string, Acc>();
  const rrRewardMap = new Map<string, Acc>();
  const pathAcc = new Map<ProspectiveSetupOutcomeReplayStatus, Acc>();

  let rrBoth = 0;
  let rrMatch = 0;

  for (const row of perTrade) {
    const r = theoreticalRByTradeId.get(row.tradeId) ?? null;
    addTradeToAcc(rewardAcc[row.rewardBucket], row, r);
    addTradeToAcc(riskAcc[row.riskBucket], row, r);

    const crossKey = `${row.riskBucket}|${row.rewardBucket}`;
    if (!crossMap.has(crossKey)) crossMap.set(crossKey, emptyAcc());
    addTradeToAcc(crossMap.get(crossKey)!, row, r);

    const rrKey = `${row.prospectiveRrBucket}|${row.rewardBucket}`;
    if (!rrRewardMap.has(rrKey)) rrRewardMap.set(rrKey, emptyAcc());
    addTradeToAcc(rrRewardMap.get(rrKey)!, row, r);

    if (!pathAcc.has(row.pathOutcome)) pathAcc.set(row.pathOutcome, emptyAcc());
    addTradeToAcc(pathAcc.get(row.pathOutcome)!, row, r);

    if (
      row.gross.grossRewardPercentage !== null &&
      row.gross.grossRiskPercentage !== null &&
      row.gross.grossRiskPercentage > 0
    ) {
      rrBoth += 1;
      if (row.rrValidation.withinTolerance === true) rrMatch += 1;
    }
  }

  const rewardByBucket = Object.fromEntries(
    PRICE_MOVE_REWARD_BUCKET_IDS.map((id) => [id, accToMetrics(rewardAcc[id])])
  ) as HistoricalEntryPriceMoveQualityAnalysisReport["rewardBuckets"]["byBucket"];

  const riskByBucket = Object.fromEntries(
    PRICE_MOVE_RISK_BUCKET_IDS.map((id) => [id, accToMetrics(riskAcc[id])])
  ) as HistoricalEntryPriceMoveQualityAnalysisReport["riskBuckets"]["byBucket"];

  const riskRewardCross: PriceMoveRiskRewardCrossCell[] = [];
  for (const [key, acc] of crossMap) {
    const [riskBucket, rewardBucket] = key.split("|") as [
      PriceMoveRiskBucketId,
      PriceMoveRewardBucketId,
    ];
    riskRewardCross.push({
      riskBucket,
      rewardBucket,
      ...accToMetrics(acc),
    });
  }
  riskRewardCross.sort(
    (a, b) => a.riskBucket.localeCompare(b.riskBucket) || a.rewardBucket.localeCompare(b.rewardBucket)
  );

  const rrRewardCross: PriceMoveRrRewardCrossCell[] = [];
  for (const [key, acc] of rrRewardMap) {
    const [rrBucket, rewardBucket] = key.split("|") as [
      (typeof HISTORICAL_MEASUREMENT_RR_BUCKET_ROWS)[number],
      PriceMoveRewardBucketId,
    ];
    rrRewardCross.push({
      prospectiveRrBucket: rrBucket,
      rewardBucket,
      ...accToMetrics(acc),
    });
  }
  rrRewardCross.sort((a, b) =>
    a.prospectiveRrBucket.localeCompare(b.prospectiveRrBucket)
  );

  const pathOutcomeSlices = [...pathAcc.entries()].map(([pathOutcome, acc]) => ({
    pathOutcome,
    ...accToMetrics(acc),
  }));

  const b12p = input.rrThresholdTheoreticalRAnalysisReport;
  const bandIds: RrThresholdTheoreticalRProspectiveBandId[] = [
    "RR_LT_1_0",
    "RR_1_0_TO_1_5",
    "RR_GTE_1_5",
  ];
  const enrichments = bandIds.map((bandId) => {
    const rows = perTrade.filter((r) => r.b12pProspectiveBandId === bandId);
    const rewards = rows
      .map((r) => r.gross.grossRewardPercentage)
      .filter((v): v is number => v !== null);
    const risks = rows
      .map((r) => r.gross.grossRiskPercentage)
      .filter((v): v is number => v !== null);
    const b12pRow =
      b12p?.prospectiveBandComparison.find((x) => x.bandId === bandId) ?? null;
    return {
      bandId,
      b12pMetrics: b12pRow,
      averageGrossRewardPercentage:
        rewards.length ? rewards.reduce((a, b) => a + b, 0) / rewards.length : null,
      averageGrossRiskPercentage:
        risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : null,
      medianGrossRewardPercentage: median(rewards),
    };
  });

  const failedWinRows = perTrade.filter((r) => r.failedWin);
  const failReasons: Record<string, number> = {};
  for (const r of failedWinRows) {
    const k = r.evaluatorFirstFailure ?? "NONE";
    failReasons[k] = (failReasons[k] ?? 0) + 1;
  }
  const failedWinDetails: PriceMoveFailedWinTradeDetail[] = failedWinRows.map(
    (r) => ({
      tradeId: r.tradeId,
      evaluationBarIndex: r.evaluationBarIndex,
      direction: r.direction,
      grossRewardPercentage: r.gross.grossRewardPercentage,
      grossRiskPercentage: r.gross.grossRiskPercentage,
      canonicalRrRatio: r.gross.prospectiveRR,
      lifecycleDurationBars: r.lifecycleDurationBars,
      evaluatorFirstFailure: r.evaluatorFirstFailure,
      pathOutcome: r.pathOutcome,
      policyClassification: r.policyClassification,
      theoreticalR: r.theoreticalR,
    })
  );

  const rewardDist: Partial<Record<PriceMoveRewardBucketId, number>> = {};
  const riskDist: Partial<Record<PriceMoveRiskBucketId, number>> = {};
  for (const r of failedWinRows) {
    rewardDist[r.rewardBucket] = (rewardDist[r.rewardBucket] ?? 0) + 1;
    riskDist[r.riskBucket] = (riskDist[r.riskBucket] ?? 0) + 1;
  }

  return {
    schemaVersion: HISTORICAL_ENTRY_PRICE_MOVE_QUALITY_ANALYSIS_SCHEMA_VERSION,
    populationKind: "INDEPENDENT_TRADE_PRICE_MOVE_QUALITY",
    consumedReports: {
      lifecycleSchemaVersion: lifecycleReport.schemaVersion,
      eligibilityAuditSchemaVersion: eligibilityAuditReport.schemaVersion,
      b12pSchemaVersion: b12p?.schemaVersion ?? null,
    },
    metricDefinitions: {
      priceMovePercentage:
        "grossRewardPercentage / grossRiskPercentage from entry/target/invalidation at E (percent units).",
      riskPercentage: "risk distance / entry × 100 (directional).",
      prospectiveRR: "IndependentTradeUnit.canonicalRrRatio (frozen references.rr.ratio).",
      theoreticalR: "B-12h eligibility audit frozen theoreticalR per tradeId.",
      note: "Price move %, risk %, and RR are distinct dimensions.",
    },
    lookaheadAttestation: {
      rewardRiskDerivedFromEvaluationReferencesOnly: true,
      futureBarsUsedForOutcomeOnly: true,
      detail:
        "Percentages computed only from IndependentTradeUnit entry/target/invalidation at E; pathOutcome/theoreticalR consume post-E replay outputs without revising references.",
    },
    rewardBuckets: {
      contractVersion: "1.0",
      thresholdsPercent: PRICE_MOVE_REWARD_BUCKET_THRESHOLDS_PERCENT,
      descriptiveOnlyNote:
        "Descriptive reward % buckets — not trading recommendations.",
      byBucket: rewardByBucket,
    },
    riskBuckets: {
      contractVersion: "1.0",
      thresholdsPercent: PRICE_MOVE_RISK_BUCKET_THRESHOLDS_PERCENT,
      descriptiveOnlyNote:
        "Descriptive risk % buckets — not trading recommendations.",
      byBucket: riskByBucket,
    },
    riskRewardCross,
    rrRewardCross,
    pathOutcomeSlices,
    b12pProspectiveBandReference: {
      sourceField: "prospectiveBandComparison",
      enrichments,
      notRecomputedNote:
        "B-12p expectancyR/profitFactorR taken from consumed report; reward/risk % enrichment computed observationally on same trades.",
    },
    failedWinAnalysis: {
      totalFailedWin: failedWinRows.length,
      byEvaluatorFirstFailure: failReasons,
      trades: failedWinDetails,
      rewardBucketDistribution: rewardDist,
      riskBucketDistribution: riskDist,
    },
    rrValidationSummary: {
      tradesWithBothPercentages: rrBoth,
      withinToleranceCount: rrMatch,
      mismatchCount: rrBoth - rrMatch,
      tolerance: RR_PARITY_TOLERANCE,
    },
    tradeExamples: selectTradeExamples(perTrade),
    analysisQuestions: buildAnalysisQuestions(rewardByBucket),
    warnings: [...WARNINGS],
  };
}

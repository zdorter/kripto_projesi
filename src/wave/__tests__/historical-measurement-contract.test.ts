import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TRADE_EVALUATION_SCHEMA_VERSION } from "../setup/trade-evaluation-contract";
import {
  HISTORICAL_MEASUREMENT_COHORTS,
  HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS,
  HISTORICAL_MEASUREMENT_LOOKAHEAD_CONTRACT,
  HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
  buildHistoricalMeasurementSnapshotId,
  isHistoricalMeasurementCohort,
} from "../setup/historical-measurement-contract";
import { PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS } from "../setup/prospective-setup-outcome-replay-contract";
import { PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION } from "../setup/prospective-setup-outcome-replay-contract";
import type { HistoricalMeasurementRecord } from "../setup/historical-measurement-types";
import type { ProspectiveSetupOutcomeReplayStatus } from "../setup/prospective-setup-outcome-replay-types";

describe("historical measurement contract (B-8a)", () => {
  const prospectiveSetupId =
    "BTCUSDT:1H:prospective:STRUCTURAL_RESUMPTION_CONTEXT:BTCUSDT:1H:impulse-continuation:scn-1";

  it("A–D: deterministic snapshotId", () => {
    const base = {
      symbol: "BTCUSDT",
      timeframe: "1H",
      evaluationBarIndex: 100,
      prospectiveSetupId,
    };
    const id1 = buildHistoricalMeasurementSnapshotId(base);
    const id2 = buildHistoricalMeasurementSnapshotId(base);
    assert.equal(id1, id2);
    assert.equal(
      id1,
      `BTCUSDT:1H:100:${prospectiveSetupId}`
    );

    const otherBar = buildHistoricalMeasurementSnapshotId({
      ...base,
      evaluationBarIndex: 101,
    });
    assert.notEqual(id1, otherBar);

    const otherSetup = buildHistoricalMeasurementSnapshotId({
      ...base,
      prospectiveSetupId: `${prospectiveSetupId}:alt`,
    });
    assert.notEqual(id1, otherSetup);
  });

  it("E: schema version constant", () => {
    assert.equal(HISTORICAL_MEASUREMENT_SCHEMA_VERSION, "1.0");
  });

  it("F: default horizon = 24 from B-6 constant", () => {
    assert.equal(HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS, 24);
    assert.equal(
      HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS,
      PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS
    );
  });

  it("G: cohort validation", () => {
    for (const cohort of HISTORICAL_MEASUREMENT_COHORTS) {
      assert.ok(isHistoricalMeasurementCohort(cohort));
    }
    assert.ok(isHistoricalMeasurementCohort("DISPLAY_PICK"));
    assert.ok(!isHistoricalMeasurementCohort("WINNERS_ONLY"));
    assert.ok(!isHistoricalMeasurementCohort(null));
  });

  it("H–I: evaluation and outcome are separate; tradeEvaluation nested under evaluation", () => {
    const record: HistoricalMeasurementRecord = {
      schemaVersion: HISTORICAL_MEASUREMENT_SCHEMA_VERSION,
      snapshotId: buildHistoricalMeasurementSnapshotId({
        symbol: "BTCUSDT",
        timeframe: "1H",
        evaluationBarIndex: 50,
        prospectiveSetupId,
      }),
      symbol: "BTCUSDT",
      timeframe: "1H",
      evaluationBarIndex: 50,
      evaluationBarTime: 1_700_000_000_000,
      prospectiveSetupId,
      cohort: "ALL_PRODUCTION_CANDIDATES",
      horizonBars: HISTORICAL_MEASUREMENT_DEFAULT_HORIZON_BARS,
      evaluation: {
        historicalSetup: null,
        production: null,
        references: {
          schemaVersion: "1.0",
          prospectiveId: prospectiveSetupId,
          entry: {
            outcome: "INSUFFICIENT_CONTEXT",
            referencePrice: null,
            modelId: "PROSPECTIVE_EVALUATION_CLOSE_REFERENCE",
          },
          stop: {
            outcome: "INSUFFICIENT_CONTEXT",
            referencePrice: null,
            modelId: "PROSPECTIVE_STRUCTURAL_INVALIDATION_REFERENCE",
          },
          target: {
            outcome: "INSUFFICIENT_CONTEXT",
            referencePrice: null,
            modelId: "PROSPECTIVE_OPEN_LEG_STRUCTURAL_PROJECTION",
            policyId: "PROSPECTIVE_OPEN_LEG_DISPLACEMENT_EQUALITY",
          },
          rr: { outcome: "INSUFFICIENT_CONTEXT", ratio: null },
          readyForFurtherEvaluation: false,
          limitations: [],
        },
        tradeEvaluation: {
          schemaVersion: TRADE_EVALUATION_SCHEMA_VERSION,
          status: "FAILED",
          passed: false,
          checks: {
            entry: "INSUFFICIENT_CONTEXT",
            stop: "INSUFFICIENT_CONTEXT",
            target: "INSUFFICIENT_CONTEXT",
            rr: "INSUFFICIENT_CONTEXT",
            setupValidity: "INSUFFICIENT_CONTEXT",
          },
          firstFailure: "ENTRY_INSUFFICIENT_CONTEXT",
          diagnostics: {
            entryReferencePrice: null,
            liveMarketPrice: null,
            entryDeviationRatio: null,
            entryDeviationPercent: null,
            risk: null,
            reward: null,
            rrRatio: null,
            minimumRr: 1.5,
            entryFreshnessTolerance: 0.01,
            direction: null,
            structuralInvalidationReferencePrice: null,
          },
          evaluationBarIndex: 50,
          evaluationPrice: null,
          futureSafe: false,
        },
      },
      outcome: {
        replay: {
          schemaVersion: PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION,
          outcome: "NO_TOUCH",
          evaluationBarIndex: 50,
          resolutionBarIndex: null,
          barsAfterEvaluation: 24,
          targetPrice: 100,
          invalidationPrice: 90,
          direction: "BULLISH",
          horizonBars: 24,
          targetTouched: false,
          invalidationTouched: false,
          prospectiveSetupId,
        },
        futureBarsAvailable: 24,
      },
    };

    assert.equal(record.evaluation.tradeEvaluation.status, "FAILED");
    assert.equal(record.outcome!.replay.outcome, "NO_TOUCH");
    assert.ok(!("tradeEvaluation" in (record.outcome as object)));
    assert.ok(!("entryReferencePrice" in (record.outcome!.replay as object)));
  });

  it("J: outcome status type matches B-6 enum", () => {
    const statuses: ProspectiveSetupOutcomeReplayStatus[] = [
      "NO_FUTURE_DATA",
      "NO_TOUCH",
      "TARGET_TOUCHED",
      "INVALIDATION_TOUCHED",
      "AMBIGUOUS",
      "INSUFFICIENT_CONTEXT",
    ];
    assert.equal(statuses.length, 6);
    assert.ok(HISTORICAL_MEASUREMENT_LOOKAHEAD_CONTRACT.outcomeCandleRange.includes("horizonBars"));
  });
});

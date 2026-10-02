/** Prospective setup outcome replay (Phase B-6) — post-evaluation price path only. */

export const PROSPECTIVE_SETUP_OUTCOME_REPLAY_SCHEMA_VERSION = "1.0" as const;

/** Default forward window after evaluation bar (bars at indices eval+1 … eval+horizon). */
export const PROSPECTIVE_SETUP_OUTCOME_REPLAY_DEFAULT_HORIZON_BARS = 24;

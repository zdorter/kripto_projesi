const FORBIDDEN_KEYS_LOWER = [
  "score",
  "signal",
  "probability",
  "prediction",
  "traderecommendation",
  "entry",
  "sl",
  "tp",
  "expectancy",
  "alpha",
  "pvalue",
  "win",
  "loss",
  "profit",
  "profitability",
  "edge",
  "advantage",
  "accuracy",
  "successrate",
  "hitrate",
] as const;

export function assertNoForbiddenMslHistoricalCohortAnalyticsKeys(
  payload: unknown
): void {
  walk(payload, "");
}

function walk(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyLower = key.toLowerCase();
    if (FORBIDDEN_KEYS_LOWER.includes(keyLower as (typeof FORBIDDEN_KEYS_LOWER)[number])) {
      throw new Error(`forbidden MSL historical cohort analytics key: ${path}.${key}`);
    }
    walk(child, path ? `${path}.${key}` : key);
  }
}

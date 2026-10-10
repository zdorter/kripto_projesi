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
] as const;

export function assertNoForbiddenMslHistoricalEvidenceKeys(payload: unknown): void {
  const seen = new Set<string>();
  walk(payload, "", seen);
}

function walk(value: unknown, path: string, seen: Set<string>): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], `${path}[${i}]`, seen);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyLower = key.toLowerCase();
    if (FORBIDDEN_KEYS_LOWER.includes(keyLower as (typeof FORBIDDEN_KEYS_LOWER)[number])) {
      throw new Error(`forbidden MSL historical evidence key: ${path}.${key}`);
    }
    if (!seen.has(keyLower)) {
      seen.add(keyLower);
    }
    walk(child, path ? `${path}.${key}` : key, seen);
  }
}

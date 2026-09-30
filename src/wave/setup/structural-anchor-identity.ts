import type {
  OpenStructuralLegAnchorCandidate,
  OpenStructuralLegAnchorKind,
  OpenStructuralLegAnchorSource,
} from "./open-structural-leg-types";

/** Same convention as legacy per-kind keys — structural identity is index + price only. */
export function structuralPriceKey(price: number): string {
  return price.toFixed(8);
}

export function structuralAnchorIdentityKey(
  anchorIndex: number,
  anchorPrice: number
): string {
  return `${anchorIndex}:${structuralPriceKey(anchorPrice)}`;
}

export function structuralAnchorPricesEqual(
  a: number,
  b: number
): boolean {
  return structuralPriceKey(a) === structuralPriceKey(b);
}

const KIND_PRECEDENCE: OpenStructuralLegAnchorKind[] = [
  "STRUCTURAL_ENDPOINT",
  "HIGH",
  "LOW",
];

export function resolvePrimaryAnchorKind(
  kinds: OpenStructuralLegAnchorKind[]
): OpenStructuralLegAnchorKind {
  for (const k of KIND_PRECEDENCE) {
    if (kinds.includes(k)) {
      return k;
    }
  }
  return kinds[0] ?? "STRUCTURAL_ENDPOINT";
}

export function mergeAnchorCandidatesByStructuralIdentity(
  raw: OpenStructuralLegAnchorCandidate[]
): OpenStructuralLegAnchorCandidate[] {
  const byIdentity = new Map<string, OpenStructuralLegAnchorCandidate>();
  for (const c of raw) {
    const key = structuralAnchorIdentityKey(c.anchorIndex, c.anchorPrice);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, {
        anchorIndex: c.anchorIndex,
        anchorPrice: c.anchorPrice,
        anchorKind: c.anchorKind,
        sources: [...c.sources],
        futureSafe: c.futureSafe,
      });
      continue;
    }
    const sources = new Set([
      ...existing.sources,
      ...c.sources,
    ]) as Set<OpenStructuralLegAnchorSource>;
    existing.sources = [...sources].sort();
    existing.anchorKind = resolvePrimaryAnchorKind([
      existing.anchorKind,
      c.anchorKind,
    ]);
    existing.futureSafe = existing.futureSafe && c.futureSafe;
  }
  return [...byIdentity.values()].sort((a, b) => a.anchorIndex - b.anchorIndex);
}

export function distinctStructuralAnchorIdentityCount(
  candidates: OpenStructuralLegAnchorCandidate[]
): number {
  const keys = new Set(
    candidates.map((c) =>
      structuralAnchorIdentityKey(c.anchorIndex, c.anchorPrice)
    )
  );
  return keys.size;
}

import type {
  MarketStructureUiScenarioInterpretationPanel,
  MarketStructureUiTier1Presentation,
  MarketStructureUiTier2Presentation,
  MarketStructureUiTimeframeTier1Card,
  MarketStructureUiTimeframeTier2Card,
  MarketStructureUiViewModel,
} from "./market-structure-ui-presenter-types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badge(text: string, className = "badge"): string {
  return `<span class="${className}">${escapeHtml(text)}</span>`;
}

function renderList(items: readonly string[], empty = "—"): string {
  if (!items.length) {
    return `<p class="muted">${empty}</p>`;
  }
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function renderCompactRows(rows: readonly { id: string; summary: string }[], limit = 8): string {
  if (!rows.length) {
    return `<p class="muted">—</p>`;
  }
  const shown = rows.slice(0, limit);
  const rest = rows.length - shown.length;
  let html = `<ul class="compact-list">${shown
    .map((r) => `<li><code>${escapeHtml(r.id)}</code> ${escapeHtml(r.summary)}</li>`)
    .join("")}</ul>`;
  if (rest > 0) {
    html += `<p class="muted">+ ${rest} more</p>`;
  }
  return html;
}

function renderProtectedCandidates(
  label: string,
  rows: MarketStructureUiTimeframeTier1Card["protectedHighs"],
  multiple: boolean
): string {
  const multiTag = multiple ? ` ${badge("MULTIPLE CANDIDATES", "badge-warn")}` : "";
  if (!rows.length) {
    return `<h4>${escapeHtml(label)}${multiTag}</h4><p class="muted">—</p>`;
  }
  const items = rows
    .map(
      (r) =>
        `#${r.index} price ${escapeHtml(r.price)} · pivot ${r.pivotIndex} · ${escapeHtml(r.type)} · ${escapeHtml(r.statusAtE)}`
    )
    .join("</li><li>");
  return `<h4>${escapeHtml(label)}${multiTag}</h4><ul><li>${items}</li></ul>`;
}

function renderNativeHtfResearchBlock(
  native: MarketStructureUiTier1Presentation["nativeHtfResearchPresentation"]
): string {
  return `
<section class="panel native-htf-research">
  <h3>Native HTF · research status</h3>
  <p class="muted">${escapeHtml(native.researchDisclaimer)}</p>
  <ul>
    <li>Field parity: <code>${escapeHtml(native.fieldParityStatus)}</code></li>
    <li>Decimal normalized volume (research tier): <code>${escapeHtml(native.decimalNormalizedVolumeParityStatus)}</code></li>
    <li>Semantic parity (sampled): <code>${escapeHtml(native.semanticParityStatus)}</code></li>
    <li>Native HTF production: <code>${escapeHtml(native.nativeHtfProductionStatus)}</code></li>
    <li>Canonical HTF path: <code>${escapeHtml(native.canonicalHtfSourceTrack)}</code></li>
  </ul>
</section>`;
}

function renderTier1TimeframeCard(card: MarketStructureUiTimeframeTier1Card): string {
  return `
<section class="tf-card panel tier1" data-tf="${escapeHtml(card.timeframeId)}">
  <h3>${escapeHtml(card.timeframeId)} · structure</h3>
  <p>Trend context: <strong>${escapeHtml(card.trendContext)}</strong></p>
  <p>HH sequence: ${escapeHtml(card.highStructure.join(", ") || "—")}</p>
  <p>HL/LH/LL (low side): ${escapeHtml(card.lowStructure.join(", ") || "—")}</p>
  <p>Structure pairs: ${card.structurePairCount}</p>
  <p>BOS: ${card.bosCount} · CHoCH: ${card.chochCount} <span class="muted">(counts only — detail in research tier)</span></p>
  <h4>Protected</h4>
  ${renderProtectedCandidates("Protected High", card.protectedHighs, card.multipleProtectedHighs)}
  ${renderProtectedCandidates("Protected Low", card.protectedLows, card.multipleProtectedLows)}
  <h4>Liquidity foundation</h4>
  <p>BSL: ${card.bslCount} · SSL: ${card.sslCount} · EQH: ${card.eqhCount} · EQL: ${card.eqlCount} · Pools: ${card.poolCount}</p>
</section>`;
}

function renderTier2TimeframeCard(card: MarketStructureUiTimeframeTier2Card): string {
  const se = card.structureEvents;
  return `
<section class="tf-card panel tier2" data-tf="${escapeHtml(card.timeframeId)}">
  <h4>${escapeHtml(card.timeframeId)} · structure detail</h4>
  <p>Zigzag spine: ${card.zigzagSpineCount} · Internal: ${card.internalStructureCount} · External: ${card.externalStructureCount}</p>
  <h4>BOS / CHoCH rows</h4>
  ${renderCompactRows(se.bosRows, 12)}
  ${renderCompactRows(se.chochRows, 12)}
  <h4>Liquidity events</h4>
  <p>Touch: ${card.wickTouchCount} · Sweep: ${card.sweepCount} · Taken: ${card.takenCount} · Reclaim: ${card.reclaimCount}</p>
  <h4>Lifecycle</h4>
  ${renderList(
    Object.entries(card.lifecycleCounts).map(([k, v]) => `${k}: ${v}`),
    "No lifecycle projections"
  )}
  <h4>MSS ${badge("RESEARCH ONLY", "badge-research")}</h4>
  <p class="muted">Not a signal, entry, or direction. ${escapeHtml(card.mssPresentationNote)}</p>
  <p>Events: ${card.mssCount}</p>
  ${renderCompactRows(card.mssEventRows, 12)}
  <h4>Liquidity → Structure (7D) · descriptive only</h4>
  <p class="muted">Not setup sequence or trade confirmation.</p>
  ${renderCompactRows(card.sameTfAssociationRows, 12)}
  <p class="muted eval-line">Eval bar ${card.evaluationBarIndex} · ${escapeHtml(card.evaluationTimestampUtc)}</p>
</section>`;
}

function renderScenarioInterpretation(panel: MarketStructureUiScenarioInterpretationPanel): string {
  const renderCard = (card: NonNullable<MarketStructureUiScenarioInterpretationPanel["primary"]>) => {
    const roleLabel = card.role === "PRIMARY" ? "PRIMARY SCENARIO" : "ALTERNATIVE SCENARIO";
    return `
<section class="panel scenario-card tier1" data-scenario-role="${escapeHtml(card.role)}">
  <h3>${escapeHtml(roleLabel)}</h3>
  <p class="scenario-type"><strong>${escapeHtml(card.scenarioTypeLabel)}</strong></p>
  <p class="scenario-status">${escapeHtml(card.statusLabel)}</p>
  <p>HTF: ${escapeHtml(card.htfTrend ?? "—")} · LTF: ${escapeHtml(card.ltfTrend ?? "—")}</p>
  <h4>Observed evidence</h4>
  ${renderList([...card.observedEvidence])}
  <h4>Required transition</h4>
  ${renderList([...card.requiredTransitions])}
  <h4>Structural invalidation</h4>
  <p><strong>${escapeHtml(card.structuralInvalidationLabel)}</strong></p>
  <p class="muted">${escapeHtml(card.structuralInvalidationNote)}</p>
  <h4>Liquidity context</h4>
  <p>${escapeHtml(card.liquiditySummary)}</p>
  ${
    card.liquidityInteractionFamilies.length
      ? `<p>Observed interaction: ${escapeHtml(card.liquidityInteractionFamilies.join(", "))}</p>`
      : ""
  }
</section>`;
  };

  const parts: string[] = [
    `<section class="panel scenario-interpretation tier1"><h2>Scenario interpretation</h2>`,
    `<p class="disclaimer">${escapeHtml(panel.globalDisclaimer)}</p>`,
    `<p class="badge-row">${badge(panel.researchOnlyBanner, "badge-research")}</p>`,
  ];
  if (panel.primary) {
    parts.push(renderCard(panel.primary));
  }
  parts.push("<hr />");
  if (panel.alternative) {
    parts.push(renderCard(panel.alternative));
  }
  parts.push(
    `<h3>Interpretation</h3><p>${escapeHtml(panel.globalInterpretation)}</p>`,
    `</section>`
  );
  return parts.join("\n");
}

function renderMtfTier1(t1: MarketStructureUiTier1Presentation): string {
  const m = t1.mtfSummary;
  if (!m) {
    return `<section class="panel"><h3>MTF summary</h3><p class="muted">Unavailable.</p></section>`;
  }
  return `
<section class="panel mtf-summary tier1">
  <h3>MTF summary</h3>
  <p>HTF <strong>${escapeHtml(m.htfTimeframeId)}</strong> · LTF <strong>${escapeHtml(m.ltfTimeframeId)}</strong></p>
  <p>Source <code>${escapeHtml(m.htfSourceTrack)}</code> <span class="muted">(canonical research path)</span></p>
  <p>Structure ${m.structureAlignment ? badge(m.structureAlignment) : "—"}</p>
  <p>Liquidity side ${m.liquiditySideAlignment ? badge(m.liquiditySideAlignment) : "—"} · lifecycle ${m.liquidityLifecycleAlignment ? badge(m.liquidityLifecycleAlignment) : "—"}</p>
</section>`;
}

function renderMtfTier2(t2: MarketStructureUiTier2Presentation): string {
  const m = t2.mtfSummary;
  if (!m) {
    return "";
  }
  const replay =
    m.replayRelationRows && m.replayRelationRows.length
      ? `<details><summary>Replay relations (${m.replayRelationRows.length})</summary>${renderCompactRows(m.replayRelationRows, 32)}</details>`
      : "";
  return `
<section class="panel mtf-summary tier2">
  <h4>9C event ordering · temporal only</h4>
  <p class="muted">${escapeHtml(m.orderingPresentationNote)} — before/after/same-time are not causality or trade confirmation.</p>
  <p>${m.evaluationRelationCount} evaluation / ${m.relationCount} total relations</p>
  ${renderCompactRows(m.representativeRelationRows, 16)}
  ${replay}
  <h4>9D HTF Liquidity → LTF Structure · ${m.liquidityToStructureCount}</h4>
  <p class="muted">${escapeHtml(m.associationPresentationNote)}</p>
  ${renderCompactRows(m.liquidityToStructureRows, 12)}
  <h4>9E Structure → LTF MSS · ${m.structureToMssCount}</h4>
  <p class="muted">${escapeHtml(m.associationPresentationNote)}</p>
  ${renderCompactRows(m.structureToMssRows, 12)}
</section>`;
}

function renderTier2ResearchPanel(vm: MarketStructureUiViewModel): string {
  const t2 = vm.tier2;
  if (!t2) {
    return "";
  }
  const tf2Parts: string[] = [];
  if (t2.timeframeCards.fourH) {
    tf2Parts.push(renderTier2TimeframeCard(t2.timeframeCards.fourH));
  }
  if (t2.timeframeCards.oneH) {
    tf2Parts.push(renderTier2TimeframeCard(t2.timeframeCards.oneH));
  }
  return `
<details class="panel" id="research-tier2-panel">
  <summary>Research / debug detail (tier 2)</summary>
  <div class="subsection">
    <h4>Research presentation flags</h4>
    ${renderList([...t2.researchPresentationFlags])}
    <h4>Technical limitations</h4>
    ${renderList([...t2.technicalLimitations])}
    <details>
      <summary>Full flat limitations (${t2.limitations.length})</summary>
      ${renderList([...t2.limitations])}
    </details>
    ${renderMtfTier2(t2)}
    ${tf2Parts.join("")}
    <h4>Known-at / diagnostics</h4>
    <div id="debug-detail">${t2.debugDetailLines.length ? `<ul>${t2.debugDetailLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "<p class=\"muted\">No debug lines.</p>"}</div>
  </div>
</details>`;
}

export function renderMarketStructureUiPage(vm: MarketStructureUiViewModel): void {
  const banner = document.getElementById("research-banner");
  const status = document.getElementById("load-status");
  const evalEl = document.getElementById("evaluation-line");
  const left = document.getElementById("msl-left-column");
  const right = document.getElementById("msl-right-column");
  const debugSection = document.getElementById("debug-section");

  if (!banner || !status || !evalEl || !left || !right) {
    throw new Error("market-structure-ui.html: missing layout elements");
  }

  if (vm.loadStatus === "loading") {
    status.textContent = "Loading…";
    return;
  }

  if (vm.loadStatus === "demo_unavailable") {
    status.textContent = vm.demoUnavailableMessage ?? "DEMO unavailable";
    banner.innerHTML = vm.researchFlags.length
      ? vm.researchFlags.map((f) => badge(f.toUpperCase().replace(/_/g, " "), "badge-research")).join(" ")
      : badge("RESEARCH ONLY", "badge-research");
    left.innerHTML = `<section class="panel"><p>${escapeHtml(vm.demoUnavailableMessage ?? "")}</p></section>`;
    right.innerHTML = `
<section class="panel fifteen-m">
  <h3>15M</h3>
  ${badge("NOT ESTABLISHED")}
  <p class="muted">MSL data is not validated for this timeframe yet.</p>
</section>`;
    evalEl.textContent = "Evaluation: —";
    if (debugSection) {
      debugSection.innerHTML = "";
    }
    return;
  }

  if (vm.loadStatus === "error") {
    status.textContent = vm.errorMessage ?? "Error loading data";
    return;
  }

  const t1 = vm.tier1;
  if (!t1) {
    status.textContent = "Missing tier-1 presentation";
    return;
  }

  status.textContent = `${vm.symbol} · ${vm.dataMode} · schema ready`;

  const flagBadges = vm.researchFlags.map((f) =>
    badge(f.toUpperCase().replace(/_/g, " "), "badge-research")
  );
  banner.innerHTML = flagBadges.join(" ");

  const evalParts = [];
  if (vm.evaluationLtfUtc) {
    evalParts.push(`LTF ${vm.evaluationLtfUtc}`);
  }
  if (vm.evaluationHtfUtc) {
    evalParts.push(`HTF ${vm.evaluationHtfUtc}`);
  }
  evalEl.textContent = evalParts.length
    ? `Evaluation: ${evalParts.join(" · ")}`
    : "Evaluation: —";

  const unresolvedHtml = t1.unresolved.length
    ? `<section class="panel"><h3>Unresolved</h3><ul>${t1.unresolved
        .map(
          (u) =>
            `<li><code>${escapeHtml(u.sourceContext)}</code> ${escapeHtml(u.code)}: ${escapeHtml(u.message)}</li>`
        )
        .join("")}</ul></section>`
    : "";

  const coreLimitationsHtml = t1.coreLimitations.length
    ? `<section class="panel"><h3>Core limitations</h3>${renderList([...t1.coreLimitations])}</section>`
    : "";

  const scenarioHtml = t1.scenarioInterpretation
    ? renderScenarioInterpretation(t1.scenarioInterpretation)
    : "";

  left.innerHTML =
    `<p class="disclaimer">${escapeHtml(t1.coreResearchDisclaimer)}</p>` +
    scenarioHtml +
    renderMtfTier1(t1) +
    renderNativeHtfResearchBlock(t1.nativeHtfResearchPresentation) +
    coreLimitationsHtml +
    unresolvedHtml;

  const cards: string[] = [];
  if (t1.timeframeCards.fourH) {
    cards.push(renderTier1TimeframeCard(t1.timeframeCards.fourH));
  }
  if (t1.timeframeCards.oneH) {
    cards.push(renderTier1TimeframeCard(t1.timeframeCards.oneH));
  }
  cards.push(`
<section class="panel fifteen-m">
  <h3>15M</h3>
  ${badge("NOT ESTABLISHED")}
  <p class="muted">MSL data is not validated for this timeframe yet.</p>
</section>`);
  right.innerHTML = cards.join("");

  const tier2Html = renderTier2ResearchPanel(vm);
  if (debugSection) {
    debugSection.outerHTML = tier2Html || "";
  } else {
    right.innerHTML += tier2Html;
  }
}

export function setMarketStructureUiLoading(message: string): void {
  const status = document.getElementById("load-status");
  if (status) {
    status.textContent = message;
  }
}

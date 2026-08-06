/**
 * app.js — UI layer for GeneCharacterize.
 *
 * Wires together SeqLib (core analysis), SeqTools (primers, alignment, SSRs,
 * digestion), Notebook (record keeping and reports), the tool registry and the
 * database registry.
 *
 * All computation is local. Sequence data leaves the browser only when the user
 * explicitly clicks through to an external service.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'genecharacterize.session.v1';
  /** Above this length a sequence goes to the clipboard rather than the URL. */
  const MAX_URL_SEQUENCE_LENGTH = 1800;

  const state = {
    results: [],
    activeIndex: 0,
    currentStep: 1,
    completedSteps: [],
    theme: 'light',
    pkaSet: 'bjellqvist',
    notebook: null,
    alignment: null,
    primers: null,
    ssrs: null,
    digestResult: null
  };

  const charts = {};

  // ======================================================================
  // Helpers
  // ======================================================================

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children])
      .filter(c => c !== null && c !== undefined && c !== false)
      .forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  const fmt = (n, d = 2) =>
    typeof n === 'number' && isFinite(n)
      ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
      : '—';

  const fmtInt = n => (typeof n === 'number' && isFinite(n) ? n.toLocaleString() : '—');

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  let toastTimer;
  function toast(message, kind = '') {
    const node = $('#toast');
    if (!node) return;
    node.className = 'toast show ' + kind;
    node.querySelector('span').textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast ' + kind; }, 4000);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e2) { return false; }
    }
  }

  function download(filename, content, mime) {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Downloaded ${filename}`, 'success');
    } catch (e) {
      toast('Download failed in this browser.', 'error');
    }
  }

  /**
   * A readout module.
   *
   * @param value   displayed string, e.g. "60.74 kDa" — the leading number is
   *                animated up from zero when the card is revealed
   * @param label   uppercase caption
   * @param note    optional smaller line beneath
   * @param gauge   optional 0..1 fraction drawn as a bar, showing where the
   *                value sits within a sensible range for that measure
   */
  function statCard(value, label, note, gauge) {
    const card = el('div', { class: 'stat' }, [
      el('div', { class: 'value', text: value }),
      el('div', { class: 'label', text: label }),
      note ? el('div', { class: 'note', text: note }) : null,
      typeof gauge === 'number'
        ? el('div', { class: 'gauge' }, [el('i', { 'data-fill': String(clamp01(gauge)) })])
        : null
    ]);
    return card;
  }

  const clamp01 = n => (isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

  const prefersReducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Bring a freshly rendered set of readouts to life: stagger them in, count the
   * numbers up, and fill any gauges. Purely cosmetic — the DOM already holds the
   * final values, so this is safe to skip entirely.
   */
  function animateReadouts(container) {
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.stat'));
    const still = prefersReducedMotion();

    cards.forEach((card, i) => {
      const gauge = card.querySelector('.gauge i');

      if (still) {
        if (gauge) gauge.style.width = (parseFloat(gauge.dataset.fill) * 100) + '%';
        return;
      }

      card.classList.add('reveal');
      card.style.animationDelay = Math.min(i * 45, 400) + 'ms';

      const valueEl = card.querySelector('.value');
      const text = valueEl ? valueEl.textContent : '';
      const match = text.match(/^(-?[\d,]+(?:\.\d+)?)(.*)$/);

      if (match) {
        const target = parseFloat(match[1].replace(/,/g, ''));
        const suffix = match[2];
        const decimals = (match[1].split('.')[1] || '').length;
        const grouped = match[1].includes(',');
        countUp(valueEl, target, decimals, grouped, suffix, 150 + Math.min(i * 45, 400));
      }

      if (gauge) {
        setTimeout(() => { gauge.style.width = (parseFloat(gauge.dataset.fill) * 100) + '%'; },
          260 + Math.min(i * 45, 400));
      }
    });
  }

  function countUp(node, target, decimals, grouped, suffix, delay) {
    const DURATION = 620;
    const fmt = n => (grouped ? n.toLocaleString(undefined, {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }) : n.toFixed(decimals)) + suffix;

    node.textContent = fmt(0);
    setTimeout(() => {
      const start = performance.now();
      const tick = now => {
        const t = Math.min((now - start) / DURATION, 1);
        const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic
        node.textContent = fmt(target * eased);
        if (t < 1) requestAnimationFrame(tick);
        else node.textContent = fmt(target);            // land exactly on the value
      };
      requestAnimationFrame(tick);
    }, delay);
  }

  function emptyState(icon, message, actionLabel, onAction) {
    return el('div', { class: 'empty-state' }, [
      el('i', { class: 'fa-solid ' + icon, 'aria-hidden': 'true' }),
      el('p', { text: message }),
      actionLabel ? el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: onAction }, actionLabel) : null
    ]);
  }

  function tableFrom(headers, rows) {
    return el('div', { class: 'table-wrap' },
      el('table', { class: 'data' }, [
        el('thead', {}, el('tr', {}, headers.map(h => el('th', { text: h })))),
        el('tbody', {}, rows.map(cells => el('tr', {}, cells.map(c =>
          typeof c === 'object' && c !== null && !(c instanceof Node)
            ? el('td', { class: c.cls || '', text: String(c.text) })
            : (c instanceof Node ? el('td', {}, c) : el('td', { text: String(c) }))
        ))))
      ]));
  }

  // ======================================================================
  // Persistence
  // ======================================================================

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        theme: state.theme,
        pkaSet: state.pkaSet,
        sequence: $('#sequence-input') ? $('#sequence-input').value.slice(0, 200000) : ''
      }));
    } catch (e) { /* storage unavailable — the app still works */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      state.currentStep = d.currentStep || 1;
      state.completedSteps = Array.isArray(d.completedSteps) ? d.completedSteps : [];
      state.theme = d.theme === 'dark' ? 'dark' : 'light';
      if (d.pkaSet && SeqLib.PKA_SETS[d.pkaSet]) state.pkaSet = d.pkaSet;
      if (d.sequence && $('#sequence-input')) $('#sequence-input').value = d.sequence;
    } catch (e) { /* corrupt state — start fresh */ }
  }

  function saveNotebook() {
    if (!Notebook.save(state.notebook)) {
      toast('Could not save — browser storage may be full or disabled.', 'error');
    }
  }

  // ======================================================================
  // Navigation
  // ======================================================================

  function switchTab(name) {
    $$('.nav-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'notebook') renderNotebook();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function switchSubTab(group, name) {
    $$(`[data-subtab-group="${group}"]`).forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.subtab === name)));
    $$(`[data-subpanel-group="${group}"]`).forEach(p =>
      p.classList.toggle('active', p.dataset.subpanel === name));
  }

  // ======================================================================
  // External tool hand-off
  // ======================================================================

  const activeRecord = () => state.results[state.activeIndex] || null;
  const activeSequence = () => { const r = activeRecord(); return r ? r.sequence : ''; };

  function activeFasta() {
    const r = activeRecord();
    if (!r) return '';
    return `>${r.id}${r.description ? ' ' + r.description : ''}\n${r.sequence.match(/.{1,60}/g).join('\n')}`;
  }

  function blastParams(record) {
    return record && record.type === 'protein'
      ? { program: 'blastp', database: 'nr' }
      : { program: 'blastn', database: 'nt' };
  }

  /** Open an external tool, handing over the loaded sequence where possible. */
  async function openTool(tool, stepNumber) {
    const record = activeRecord();
    const seq = activeSequence();

    if (stepNumber) {
      Notebook.recordToolUse(state.notebook, stepNumber, tool.name);
      saveNotebook();
    }

    if (!seq || tool.handoff === 'none') {
      window.open(tool.url, '_blank', 'noopener');
      return;
    }

    if (tool.handoff === 'url' && tool.urlTemplate && seq.length <= MAX_URL_SEQUENCE_LENGTH) {
      const { program, database } = blastParams(record);
      const url = tool.urlTemplate
        .replace('{seq}', encodeURIComponent(seq))
        .replace('{program}', program)
        .replace('{database}', database)
        .replace('{query}', encodeURIComponent(record ? record.id : ''));
      window.open(url, '_blank', 'noopener');
      toast(`Opened ${tool.name} with your sequence pre-filled`, 'success');
      return;
    }

    const copied = await copyToClipboard(activeFasta());
    window.open(tool.url, '_blank', 'noopener');
    toast(
      copied ? `Sequence copied — paste it into ${tool.name}`
             : `Opened ${tool.name}. Copy your sequence from the Analyzer tab.`,
      copied ? 'success' : ''
    );
  }

  function handoffBadge(tool) {
    const map = {
      url:       ['badge-auto', 'fa-bolt', 'Auto-fill', 'Your sequence is passed to this tool automatically'],
      clipboard: ['badge-copy', 'fa-clipboard', 'Copy & go', 'Your sequence is copied so you can paste it in'],
      none:      ['badge-open', 'fa-arrow-up-right-from-square', 'Open', 'Reference resource — opens directly']
    };
    const [cls, icon, label, title] = map[tool.handoff] || map.none;
    return el('span', { class: 'badge ' + cls, title }, [
      el('i', { class: 'fa-solid ' + icon, 'aria-hidden': 'true' }), label
    ]);
  }

  function toolCard(tool, stepNumber) {
    const hasSeq = Boolean(activeSequence());
    const label = (tool.handoff === 'none' || !hasSeq) ? 'Open tool' : 'Send sequence';

    return el('article', { class: 'tool-card' + (tool.featured ? ' featured' : '') }, [
      el('div', { class: 'tool-head' }, [
        el('div', {}, [
          el('div', { class: 'tool-name', text: tool.name }),
          el('div', { class: 'tool-cat', text: tool.category })
        ]),
        handoffBadge(tool)
      ]),
      el('p', { class: 'tool-desc', text: tool.description }),
      el('div', { class: 'tool-foot' }, [
        el('a', { class: 'tool-host', href: tool.url, target: '_blank', rel: 'noopener noreferrer' },
          hostOf(tool.url)),
        el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openTool(tool, stepNumber) },
          [el('i', { class: 'fa-solid fa-arrow-up-right-from-square', 'aria-hidden': 'true' }), label])
      ])
    ]);
  }

  // ======================================================================
  // Analyzer
  // ======================================================================

  function destroyCharts() {
    Object.values(charts).forEach(c => { try { c && c.destroy(); } catch (e) {} });
    Object.keys(charts).forEach(k => delete charts[k]);
  }

  function chartColors() {
    const s = getComputedStyle(document.documentElement);
    return {
      grid: s.getPropertyValue('--border').trim(),
      text: s.getPropertyValue('--text-muted').trim(),
      accent: s.getPropertyValue('--accent').trim()
    };
  }

  function runAnalysis(silent) {
    const text = $('#sequence-input').value;
    if (!text.trim()) {
      if (!silent) toast('Paste a sequence first, or load one of the examples.', 'error');
      return false;
    }

    let results;
    try { results = SeqLib.analyzeFasta(text); }
    catch (e) { toast('Could not parse that input. Check it is valid FASTA.', 'error'); return false; }

    if (!results.length) { toast('No sequences found in that input.', 'error'); return false; }

    state.results = results;
    state.activeIndex = 0;
    // Derived results depend on the sequence, so clear them
    state.primers = state.ssrs = state.digestResult = null;

    // A scanline while rendering, but only where there is genuinely enough work
    // to see one. Faking latency on a short sequence would just be theatre.
    const heavy = text.length > 50000 || results.length > 20;
    const resultsEl = $('#results');
    if (heavy && resultsEl && !prefersReducedMotion()) {
      resultsEl.classList.add('scanning');
      setTimeout(() => resultsEl.classList.remove('scanning'), 450);
    }

    renderResults();
    renderToolkit();
    renderToolDirectory($('#tool-search') ? $('#tool-search').value : '');
    renderStepDetail();
    save();

    if (!silent) {
      toast(`Analyzed ${results.length} sequence${results.length > 1 ? 's' : ''}`, 'success');
      $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return true;
  }

  function renderResults() {
    const container = $('#results');
    container.innerHTML = '';
    destroyCharts();

    if (!state.results.length) {
      container.appendChild(emptyState('fa-dna', 'Analysis results will appear here.'));
      return;
    }

    if (state.results.length > 1) {
      container.appendChild(el('div', { class: 'field' }, [
        el('label', { for: 'record-select', text: `Viewing sequence ${state.activeIndex + 1} of ${state.results.length}` }),
        el('select', {
          id: 'record-select', class: 'select',
          onchange: e => { state.activeIndex = Number(e.target.value); state.primers = state.ssrs = state.digestResult = null; renderResults(); renderToolkit(); }
        }, state.results.map((r, i) =>
          el('option', { value: String(i), selected: i === state.activeIndex ? 'selected' : null },
            `${r.id} (${fmtInt(r.length)} ${r.type === 'protein' ? 'aa' : 'bp'})`)))
      ]));
    }

    const r = state.results[state.activeIndex];

    container.appendChild(el('div', { class: 'result-toolbar' }, [
      el('div', {}, [
        el('h3', { text: r.id, style: 'margin:0;' }),
        r.description ? el('p', { class: 'tool-cat', text: r.description, style: 'margin:0;' }) : null
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn-success btn-sm', type: 'button',
          onclick: () => {
            Notebook.saveAnalysis(state.notebook, r);
            saveNotebook();
            toast(`Saved "${r.id}" to your notebook`, 'success');
          }
        }, [el('i', { class: 'fa-solid fa-bookmark', 'aria-hidden': 'true' }), 'Save to notebook']),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: exportCsv },
          [el('i', { class: 'fa-solid fa-file-csv', 'aria-hidden': 'true' }), 'CSV']),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: exportJson },
          [el('i', { class: 'fa-solid fa-file-code', 'aria-hidden': 'true' }), 'JSON'])
      ])
    ]));

    if (r.type === 'protein') renderProteinResults(container, r);
    else if (r.type === 'dna' || r.type === 'rna') renderNucleotideResults(container, r);
    else container.appendChild(el('div', { class: 'callout' },
      el('p', { style: 'margin:0;', text: 'Sequence type could not be determined. Check for unexpected characters.' })));

    animateReadouts(container);
    updateStatusStrip(r);
  }

  /** Reflect the loaded sequence in the header status strip. */
  function updateStatusStrip(r) {
    const slot = $('#status-loaded');
    if (!slot) return;
    slot.textContent = r
      ? `${r.id} · ${fmtInt(r.length)} ${r.type === 'protein' ? 'aa' : 'bp'}`
      : '—';
  }

  function renderNucleotideResults(container, r) {
    const gcNote = r.gcContent > 60 ? 'GC-rich' : r.gcContent < 40 ? 'AT-rich' : 'balanced';

    container.appendChild(el('div', { class: 'grid grid-4', style: 'margin-bottom:1.5rem;' }, [
      statCard(fmtInt(r.length) + ' bp', 'Length'),
      statCard(fmt(r.gcContent, 1) + '%', 'GC content', gcNote, r.gcContent / 100),
      statCard(fmt(r.meltingTemp, 1) + ' °C', 'Melting temp', r.length < 14 ? 'Wallace rule' : 'GC formula', r.meltingTemp / 100),
      statCard(fmt(r.molecularWeight / 1000, 1) + ' kDa', 'MW (ssDNA)'),
      statCard(fmt(r.gcSkew, 3), 'GC skew', '(G−C)/(G+C)', (r.gcSkew + 1) / 2),
      statCard(fmtInt(r.orfCount), 'ORFs found', '≥30 aa, 6 frames'),
      statCard(r.longestOrf ? fmtInt(r.longestOrf.aaLength) + ' aa' : '—', 'Longest ORF'),
      statCard(fmtInt(r.restrictionSites.length), 'Enzymes cutting', 'of 16 screened')
    ]));

    container.appendChild(el('div', { class: 'grid grid-2', style: 'margin-bottom:1.5rem;' }, [
      el('div', { class: 'card' }, [
        el('h4', { text: 'Base composition' }),
        el('div', { class: 'chart-box' }, el('canvas', { id: 'chart-composition' }))
      ]),
      el('div', { class: 'card' }, [
        el('h4', { text: 'GC content along the sequence' }),
        el('div', { class: 'chart-box' }, el('canvas', { id: 'chart-gc' }))
      ])
    ]));

    if (r.orfs.length) {
      container.appendChild(el('div', { class: 'card', style: 'margin-bottom:1.5rem;' }, [
        el('h4', { text: 'Open reading frames' }),
        el('p', { class: 'tool-cat', text: 'ATG to in-frame stop, minimum 30 residues, all six frames' }),
        tableFrom(['Frame', 'Start', 'End', 'nt', 'aa', 'Protein'],
          r.orfs.map(o => [
            (o.strand === '+' ? '+' : '') + o.frame,
            { text: fmtInt(o.start), cls: 'num' },
            { text: fmtInt(o.end), cls: 'num' },
            { text: fmtInt(o.ntLength), cls: 'num' },
            { text: fmtInt(o.aaLength), cls: 'num' },
            { text: o.protein.slice(0, 34) + (o.protein.length > 34 ? '…' : ''), cls: 'mono' }
          ]))
      ]));
    }

    if (r.restrictionSites.length) {
      container.appendChild(el('details', { class: 'collapsible' }, [
        el('summary', { text: `Restriction sites — ${r.restrictionSites.length} enzymes cut this sequence` }),
        el('div', {}, tableFrom(['Enzyme', 'Site', 'Cuts', 'Positions'],
          r.restrictionSites.map(s => [
            s.enzyme, { text: s.site, cls: 'mono' }, { text: String(s.count), cls: 'num' },
            { text: s.positions.slice(0, 12).join(', ') + (s.positions.length > 12 ? '…' : ''), cls: 'mono' }
          ])))
      ]));
    }

    container.appendChild(el('details', { class: 'collapsible' }, [
      el('summary', { text: 'Three-frame translation (forward strand)' }),
      el('div', {}, r.frames.map(f => el('div', { style: 'margin-bottom:1rem;' }, [
        el('div', { class: 'tool-cat', text: 'Frame +' + f.frame }),
        el('div', { class: 'seq-display', style: 'max-height:120px;', text: f.protein || '(none)' })
      ])))
    ]));

    container.appendChild(el('details', { class: 'collapsible' }, [
      el('summary', { text: 'Reverse complement' }),
      el('div', {}, [
        el('div', { class: 'seq-display', text: r.reverseComplement }),
        el('div', { class: 'btn-row', style: 'margin-top:.75rem;' },
          el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onclick: async () => {
              const ok = await copyToClipboard(r.reverseComplement);
              toast(ok ? 'Reverse complement copied' : 'Copy failed', ok ? 'success' : 'error');
            }
          }, [el('i', { class: 'fa-solid fa-copy', 'aria-hidden': 'true' }), 'Copy']))
      ])
    ]));

    if (r.codonUsage.length) {
      container.appendChild(el('details', { class: 'collapsible' }, [
        el('summary', { text: 'Codon usage (top 20)' }),
        el('div', {}, tableFrom(['Codon', 'Amino acid', 'Count', 'Frequency'],
          r.codonUsage.map(c => [
            { text: c.codon, cls: 'mono' },
            c.aa === '*' ? 'Stop' : (SeqLib.AA_NAMES[c.aa] || c.aa),
            { text: String(c.count), cls: 'num' },
            { text: fmt(c.fraction * 100, 1) + '%', cls: 'num' }
          ])))
      ]));
    }

    drawCompositionChart(r);
    drawGcChart(r);
  }

  function renderProteinResults(container, r) {
    const gravyNote = r.gravy > 0 ? 'hydrophobic' : 'hydrophilic';
    const pI = SeqLib.isoelectricPoint(r.sequence, state.pkaSet);
    const charge = SeqLib.netCharge(r.sequence, 7, state.pkaSet);

    container.appendChild(el('div', { class: 'grid grid-4', style: 'margin-bottom:1.5rem;' }, [
      statCard(fmtInt(r.length) + ' aa', 'Length'),
      statCard(fmt(r.molecularWeight / 1000, 2) + ' kDa', 'Molecular weight'),
      statCard(fmt(pI, 2), 'Isoelectric point',
        SeqLib.PKA_SETS[state.pkaSet].label.replace(/ \(.*/, ''), (pI - 3) / 9),
      statCard(fmt(r.gravy, 3), 'GRAVY', gravyNote, (r.gravy + 2) / 4),
      statCard(fmt(charge, 1), 'Net charge at pH 7', null, (charge + 50) / 100),
      statCard(fmt(r.aromaticity * 100, 1) + '%', 'Aromaticity', 'F + W + Y', r.aromaticity * 100 / 20),
      statCard(fmtInt(r.extinctionCoefficient.reduced), 'ε₂₈₀ (M⁻¹cm⁻¹)', 'reduced Cys'),
      statCard(`${r.negativeResidues} / ${r.positiveResidues}`, 'Asp+Glu / Lys+Arg')
    ]));

    // pKa set selector — published pI values depend on which one the authors used
    container.appendChild(el('div', { class: 'callout', style: 'margin-bottom:1.5rem;' }, [
      el('h4', { text: 'Isoelectric point: pKa set' }),
      el('p', { style: 'margin:0 0 .6rem;font-size:.9375rem;color:var(--text-light);' },
        'Different software uses different pKa values, and they disagree by up to ~0.5 pH units on ' +
        'the same sequence. Pick the set matching the tool you are comparing against.'),
      el('div', { class: 'btn-row' }, [
        el('select', {
          class: 'select', style: 'max-width:340px;', 'aria-label': 'pKa set for isoelectric point',
          onchange: e => { state.pkaSet = e.target.value; save(); renderResults(); }
        }, SeqLib.isoelectricPointAllSets(r.sequence).map(o =>
          el('option', { value: o.set, selected: o.set === state.pkaSet ? 'selected' : null },
             `${o.label} — pI ${o.pI.toFixed(2)}`)))
      ]),
      el('div', { class: 'metric-chips', style: 'margin-top:.7rem;' },
        SeqLib.isoelectricPointAllSets(r.sequence).map(o =>
          el('span', { class: 'chip' + (o.set === state.pkaSet ? ' chip-active' : ''),
                       text: `${o.set}: ${o.pI.toFixed(2)}` })))
    ]));

    container.appendChild(el('div', { class: 'grid grid-2', style: 'margin-bottom:1.5rem;' }, [
      el('div', { class: 'card' }, [
        el('h4', { text: 'Amino acid composition' }),
        el('div', { class: 'chart-box' }, el('canvas', { id: 'chart-composition' }))
      ]),
      el('div', { class: 'card' }, [
        el('h4', { text: 'Kyte-Doolittle hydropathy' }),
        el('p', { class: 'tool-cat', text: '9-residue window; peaks above 1.6 suggest membrane spans' }),
        el('div', { class: 'chart-box' }, el('canvas', { id: 'chart-hydropathy' }))
      ])
    ]));

    container.appendChild(el('details', { class: 'collapsible' }, [
      el('summary', { text: 'Sequence' }),
      el('div', {}, el('div', { class: 'seq-display', text: r.sequence.match(/.{1,60}/g).join('\n') }))
    ]));

    drawCompositionChart(r);
    drawHydropathyChart(r);
  }

  function drawCompositionChart(r) {
    const canvas = document.getElementById('chart-composition');
    if (!canvas || typeof Chart === 'undefined') return;
    const c = chartColors();
    const entries = Object.entries(r.composition).filter(([k]) => /[A-Z]/.test(k)).sort((a, b) => b[1] - a[1]);

    charts.composition = new Chart(canvas, {
      type: 'bar',
      data: { labels: entries.map(e => e[0]), datasets: [{ label: 'Count', data: entries.map(e => e[1]), backgroundColor: c.accent, borderRadius: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => {
            const pct = ((ctx.parsed.y / r.length) * 100).toFixed(1);
            const name = SeqLib.AA_NAMES[ctx.label];
            return `${name ? name + ': ' : ''}${ctx.parsed.y} (${pct}%)`;
          } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text } },
          y: { grid: { color: c.grid }, ticks: { color: c.text }, beginAtZero: true }
        }
      }
    });
  }

  function drawGcChart(r) {
    const canvas = document.getElementById('chart-gc');
    if (!canvas || typeof Chart === 'undefined') return;
    const c = chartColors();
    charts.gc = new Chart(canvas, {
      type: 'line',
      data: {
        labels: r.gcWindows.map(w => w.position),
        datasets: [
          { label: 'GC %', data: r.gcWindows.map(w => w.gc), borderColor: c.accent, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: .3 },
          { label: 'Mean', data: r.gcWindows.map(() => r.gcContent), borderColor: c.text, borderDash: [5, 5], borderWidth: 1, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { labels: { color: c.text, boxWidth: 12 } } },
        scales: {
          x: { title: { display: true, text: 'Position (bp)', color: c.text }, grid: { display: false }, ticks: { color: c.text, maxTicksLimit: 10 } },
          y: { title: { display: true, text: 'GC %', color: c.text }, grid: { color: c.grid }, ticks: { color: c.text }, min: 0, max: 100 }
        }
      }
    });
  }

  function drawHydropathyChart(r) {
    const canvas = document.getElementById('chart-hydropathy');
    if (!canvas || typeof Chart === 'undefined') return;
    const c = chartColors();
    charts.hydropathy = new Chart(canvas, {
      type: 'line',
      data: {
        labels: r.hydropathyProfile.map(p => p.position),
        datasets: [
          { label: 'Hydropathy', data: r.hydropathyProfile.map(p => p.score), borderColor: c.accent, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: .25 },
          { label: 'Membrane threshold (1.6)', data: r.hydropathyProfile.map(() => 1.6), borderColor: '#dc2626', borderDash: [5, 5], borderWidth: 1, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { labels: { color: c.text, boxWidth: 12 } } },
        scales: {
          x: { title: { display: true, text: 'Residue', color: c.text }, grid: { display: false }, ticks: { color: c.text, maxTicksLimit: 10 } },
          y: { title: { display: true, text: 'KD score', color: c.text }, grid: { color: c.grid }, ticks: { color: c.text } }
        }
      }
    });
  }

  function exportCsv() {
    if (!state.results.length) return;
    download('genecharacterize_results.csv', SeqLib.resultsToCsv(state.results), 'text/csv');
  }
  function exportJson() {
    if (!state.results.length) return;
    download('genecharacterize_results.json', JSON.stringify(state.results, null, 2), 'application/json');
  }

  // ======================================================================
  // Toolkit — primers, alignment, SSRs, digestion
  // ======================================================================

  function renderToolkit() {
    renderPrimerTool();
    renderSsrTool();
    renderDigestTool();
    renderAlignTool();
  }

  function requireNucleotide(container, what) {
    const r = activeRecord();
    if (!r) {
      container.appendChild(emptyState('fa-inbox',
        `Load a sequence in the Analyzer tab to use ${what}.`,
        'Go to Analyzer', () => switchTab('analyzer')));
      return null;
    }
    if (r.type === 'protein') {
      container.appendChild(el('div', { class: 'callout warn' },
        el('p', { style: 'margin:0;', text: `${what} needs a DNA or RNA sequence. "${r.id}" is a protein.` })));
      return null;
    }
    return r;
  }

  // -------------------------------------------------------- primer design

  function renderPrimerTool() {
    const container = $('#primer-results');
    if (!container) return;
    container.innerHTML = '';

    const r = requireNucleotide(container, 'primer design');
    if (!r) return;

    container.appendChild(el('p', { class: 'tool-cat', style: 'margin-bottom:1rem;',
      text: `Template: ${r.id} — ${fmtInt(r.length)} bp` }));

    if (!state.primers) {
      container.appendChild(emptyState('fa-vials', 'Set your constraints and design primers for this template.'));
      return;
    }

    const { pairs, warnings } = state.primers;

    warnings.forEach(w => container.appendChild(
      el('div', { class: 'callout warn' }, el('p', { style: 'margin:0;', text: w }))));

    if (!pairs.length) {
      container.appendChild(emptyState('fa-triangle-exclamation',
        'No primer pairs met the constraints. Try widening the Tm or GC range, or the product size.'));
      return;
    }

    container.appendChild(el('p', { style: 'margin:1rem 0 .75rem;font-weight:600;',
      text: `${pairs.length} primer pair${pairs.length > 1 ? 's' : ''}, best first` }));

    pairs.forEach((p, i) => {
      container.appendChild(el('div', { class: 'primer-pair' }, [
        el('div', { class: 'primer-pair-head' }, [
          el('strong', { text: `Pair ${i + 1}` }),
          el('span', { class: 'tool-cat', text: `Product ${fmtInt(p.productSize)} bp · ΔTm ${fmt(p.tmDifference, 1)} °C · score ${fmt(p.score, 1)}` })
        ]),
        tableFrom(['', 'Sequence (5\'→3\')', 'Len', 'Tm (°C)', 'GC %', 'Position'], [
          ['Forward', { text: p.forward.sequence, cls: 'mono' }, { text: String(p.forward.length), cls: 'num' },
           { text: fmt(p.forward.tm, 1), cls: 'num' }, { text: fmt(p.forward.gc, 1), cls: 'num' },
           { text: `${p.forward.start}–${p.forward.end}`, cls: 'num' }],
          ['Reverse', { text: p.reverse.sequence, cls: 'mono' }, { text: String(p.reverse.length), cls: 'num' },
           { text: fmt(p.reverse.tm, 1), cls: 'num' }, { text: fmt(p.reverse.gc, 1), cls: 'num' },
           { text: `${p.reverse.start}–${p.reverse.end}`, cls: 'num' }]
        ]),
        el('div', { class: 'btn-row', style: 'margin-top:.6rem;' }, [
          el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onclick: async () => {
              const ok = await copyToClipboard(`Forward: ${p.forward.sequence}\nReverse: ${p.reverse.sequence}`);
              toast(ok ? 'Primer pair copied' : 'Copy failed', ok ? 'success' : 'error');
            }
          }, [el('i', { class: 'fa-solid fa-copy', 'aria-hidden': 'true' }), 'Copy pair']),
          el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onclick: () => {
              Notebook.addFinding(state.notebook, 1,
                `Primer pair ${i + 1} (${p.productSize} bp product)`,
                `F: ${p.forward.sequence} (Tm ${p.forward.tm}) / R: ${p.reverse.sequence} (Tm ${p.reverse.tm})`);
              saveNotebook();
              toast('Primer pair saved to notebook', 'success');
            }
          }, [el('i', { class: 'fa-solid fa-bookmark', 'aria-hidden': 'true' }), 'Save'])
        ])
      ]));
    });

    container.appendChild(el('div', { class: 'btn-row', style: 'margin-top:1rem;' },
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => {
          const rows = ['pair,direction,sequence,length,tm,gc_percent,start,end,product_size'];
          pairs.forEach((p, i) => {
            rows.push(`${i + 1},forward,${p.forward.sequence},${p.forward.length},${p.forward.tm},${p.forward.gc},${p.forward.start},${p.forward.end},${p.productSize}`);
            rows.push(`${i + 1},reverse,${p.reverse.sequence},${p.reverse.length},${p.reverse.tm},${p.reverse.gc},${p.reverse.start},${p.reverse.end},${p.productSize}`);
          });
          download('primers.csv', rows.join('\n'), 'text/csv');
        }
      }, [el('i', { class: 'fa-solid fa-file-csv', 'aria-hidden': 'true' }), 'Export primers as CSV'])));
    animateReadouts(container);
  }

  function runPrimerDesign() {
    const r = activeRecord();
    if (!r || r.type === 'protein') { toast('Load a DNA sequence first.', 'error'); return; }

    const opts = {
      minTm: Number($('#primer-min-tm').value) || 55,
      maxTm: Number($('#primer-max-tm').value) || 65,
      minGc: Number($('#primer-min-gc').value) || 40,
      maxGc: Number($('#primer-max-gc').value) || 60,
      minProduct: Number($('#primer-min-product').value) || 100,
      maxProduct: Number($('#primer-max-product').value) || 1000,
      minLength: Number($('#primer-min-len').value) || 18,
      maxLength: Number($('#primer-max-len').value) || 25
    };

    if (opts.minTm >= opts.maxTm) { toast('Minimum Tm must be below maximum Tm.', 'error'); return; }
    if (opts.minGc >= opts.maxGc) { toast('Minimum GC must be below maximum GC.', 'error'); return; }
    if (opts.minProduct >= opts.maxProduct) { toast('Minimum product size must be below maximum.', 'error'); return; }

    state.primers = SeqTools.designPrimers(r.sequence, opts);
    renderPrimerTool();
    toast(`Found ${state.primers.pairs.length} primer pair${state.primers.pairs.length === 1 ? '' : 's'}`,
      state.primers.pairs.length ? 'success' : '');
  }

  // ------------------------------------------------------------- SSR finder

  function renderSsrTool() {
    const container = $('#ssr-results');
    if (!container) return;
    container.innerHTML = '';

    const r = requireNucleotide(container, 'microsatellite detection');
    if (!r) return;

    container.appendChild(el('p', { class: 'tool-cat', style: 'margin-bottom:1rem;',
      text: `Sequence: ${r.id} — ${fmtInt(r.length)} bp` }));

    if (!state.ssrs) {
      container.appendChild(emptyState('fa-repeat', 'Scan the sequence for simple sequence repeats.'));
      return;
    }

    if (!state.ssrs.length) {
      container.appendChild(emptyState('fa-circle-check',
        'No microsatellites found above the MISA thresholds (mono ≥12, di ≥6, tri ≥5, tetra ≥5, penta ≥4, hexa ≥4 repeats).'));
      return;
    }

    const byType = {};
    state.ssrs.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1; });
    const density = (state.ssrs.length / (r.length / 1000)).toFixed(2);

    container.appendChild(el('div', { class: 'grid grid-4', style: 'margin-bottom:1.25rem;' }, [
      statCard(fmtInt(state.ssrs.length), 'SSRs found'),
      statCard(density, 'SSRs per kb'),
      statCard(String(Object.keys(byType).length), 'Motif classes'),
      statCard(fmtInt(state.ssrs.reduce((n, s) => n + s.length, 0)) + ' bp', 'Total SSR length')
    ]));

    container.appendChild(tableFrom(['Motif', 'Type', 'Repeats', 'Start', 'End', 'Length'],
      state.ssrs.map(s => [
        { text: '(' + s.motif + ')', cls: 'mono' },
        s.type,
        { text: String(s.repeats), cls: 'num' },
        { text: fmtInt(s.start), cls: 'num' },
        { text: fmtInt(s.end), cls: 'num' },
        { text: fmtInt(s.length), cls: 'num' }
      ])));

    container.appendChild(el('div', { class: 'btn-row', style: 'margin-top:1rem;' }, [
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => {
          const rows = ['motif,type,repeats,start,end,length'];
          state.ssrs.forEach(s => rows.push(`${s.motif},${s.type},${s.repeats},${s.start},${s.end},${s.length}`));
          download('microsatellites.csv', rows.join('\n'), 'text/csv');
        }
      }, [el('i', { class: 'fa-solid fa-file-csv', 'aria-hidden': 'true' }), 'Export CSV']),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => {
          Notebook.addFinding(state.notebook, 7, 'Microsatellites detected',
            `${state.ssrs.length} SSRs (${density} per kb) in ${r.id}`);
          saveNotebook();
          toast('SSR summary saved to notebook', 'success');
        }
      }, [el('i', { class: 'fa-solid fa-bookmark', 'aria-hidden': 'true' }), 'Save summary'])
    ]));
    animateReadouts(container);
  }

  function runSsrScan() {
    const r = activeRecord();
    if (!r || r.type === 'protein') { toast('Load a DNA sequence first.', 'error'); return; }
    state.ssrs = SeqTools.findSSRs(r.sequence);
    renderSsrTool();
    toast(`Found ${state.ssrs.length} microsatellite${state.ssrs.length === 1 ? '' : 's'}`,
      state.ssrs.length ? 'success' : '');
  }

  // ------------------------------------------------------- restriction digest

  function renderDigestEnzymePicker() {
    const box = $('#digest-enzymes');
    if (!box || box.children.length) return;
    Object.keys(SeqLib.RESTRICTION_ENZYMES).forEach(name => {
      const id = 'enz-' + name;
      box.appendChild(el('label', { class: 'checkbox', for: id }, [
        el('input', { type: 'checkbox', id, value: name, checked: ['EcoRI', 'BamHI', 'HindIII'].includes(name) ? 'checked' : null }),
        el('span', {}, [name, el('code', { text: SeqLib.RESTRICTION_ENZYMES[name] })])
      ]));
    });
  }

  function renderDigestTool() {
    const container = $('#digest-results');
    if (!container) return;
    container.innerHTML = '';

    const r = requireNucleotide(container, 'restriction digestion');
    if (!r) return;

    container.appendChild(el('p', { class: 'tool-cat', style: 'margin-bottom:1rem;',
      text: `Sequence: ${r.id} — ${fmtInt(r.length)} bp` }));

    if (!state.digestResult) {
      container.appendChild(emptyState('fa-scissors', 'Choose enzymes and run a virtual digest.'));
      return;
    }

    const d = state.digestResult;

    container.appendChild(el('div', { class: 'grid grid-4', style: 'margin-bottom:1.25rem;' }, [
      statCard(fmtInt(d.cuts.length), 'Cut sites'),
      statCard(fmtInt(d.fragments.length), 'Fragments'),
      statCard(fmtInt(Math.max(...d.gelOrder)) + ' bp', 'Largest fragment'),
      statCard(fmtInt(Math.min(...d.gelOrder)) + ' bp', 'Smallest fragment')
    ]));

    // Simple gel visualization — log scale, largest at the top
    const maxSize = Math.max(...d.gelOrder);
    const minSize = Math.min(...d.gelOrder);
    const logMax = Math.log10(Math.max(maxSize, 10));
    const logMin = Math.log10(Math.max(minSize, 1));
    const span = Math.max(logMax - logMin, 0.3);

    container.appendChild(el('div', { class: 'card', style: 'margin-bottom:1.25rem;' }, [
      el('h4', { text: 'Virtual gel' }),
      el('p', { class: 'tool-cat', text: 'Fragments positioned on a log scale, as they would migrate' }),
      el('div', { class: 'gel' }, [
        el('div', { class: 'gel-lane' },
          d.gelOrder.map(size => {
            const pos = ((logMax - Math.log10(Math.max(size, 1))) / span) * 88 + 4;
            return el('div', {
              class: 'gel-band',
              style: `top:${pos}%`,
              title: `${size.toLocaleString()} bp`
            }, el('span', { class: 'gel-label', text: size.toLocaleString() + ' bp' }));
          }))
      ])
    ]));

    if (d.cuts.length) {
      container.appendChild(el('details', { class: 'collapsible', open: 'open' }, [
        el('summary', { text: `Fragments (${d.fragments.length})` }),
        el('div', {}, tableFrom(['#', 'Size (bp)', 'Start', 'End', 'Cut by'],
          d.fragments.map((f, i) => [
            { text: String(i + 1), cls: 'num' },
            { text: fmtInt(f.size), cls: 'num' },
            { text: fmtInt(f.start), cls: 'num' },
            { text: fmtInt(f.end), cls: 'num' },
            `${f.from} → ${f.to}`
          ])))
      ]));

      container.appendChild(el('details', { class: 'collapsible' }, [
        el('summary', { text: `Cut sites (${d.cuts.length})` }),
        el('div', {}, tableFrom(['Enzyme', 'Site starts at', 'Cuts after'],
          d.cuts.map(c => [c.enzyme, { text: fmtInt(c.site), cls: 'num' }, { text: fmtInt(c.position), cls: 'num' }])))
      ]));
    }
    animateReadouts(container);
  }

  function runDigest() {
    const r = activeRecord();
    if (!r || r.type === 'protein') { toast('Load a DNA sequence first.', 'error'); return; }

    const enzymes = $$('#digest-enzymes input:checked').map(i => i.value);
    if (!enzymes.length) { toast('Select at least one enzyme.', 'error'); return; }

    const circular = $('#digest-circular').checked;
    state.digestResult = SeqTools.digest(r.sequence, enzymes, circular);
    renderDigestTool();
    toast(`${state.digestResult.cuts.length} cut sites, ${state.digestResult.fragments.length} fragments`, 'success');
  }

  // --------------------------------------------------------- pairwise align

  function renderAlignTool() {
    const container = $('#align-results');
    if (!container) return;
    container.innerHTML = '';

    if (!state.alignment) {
      container.appendChild(emptyState('fa-align-justify', 'Enter two sequences and align them.'));
      return;
    }

    if (state.alignment.error) {
      container.appendChild(el('div', { class: 'callout warn' },
        el('p', { style: 'margin:0;', text: state.alignment.error })));
      return;
    }

    const a = state.alignment;

    container.appendChild(el('div', { class: 'grid grid-4', style: 'margin-bottom:1.25rem;' }, [
      statCard(fmt(a.identityPercent, 1) + '%', 'Identity', `${a.identities} / ${a.length}`),
      a.type === 'protein' ? statCard(fmt(a.similarityPercent, 1) + '%', 'Similarity', 'BLOSUM62 > 0') : null,
      statCard(fmtInt(a.gaps), 'Gaps', fmt(a.gapPercent, 1) + '%'),
      statCard(fmtInt(a.score), 'Alignment score', a.type === 'protein' ? 'BLOSUM62' : 'match/mismatch'),
      statCard(fmtInt(a.length), 'Alignment length')
    ].filter(Boolean)));

    const blocks = SeqTools.formatAlignment(a, 60);
    const pre = el('pre', { class: 'alignment' });
    blocks.forEach(b => {
      const pad = String(a.length).length;
      pre.appendChild(document.createTextNode(
        `Seq1  ${String(b.start).padStart(pad)}  ${b.a}  ${b.end}\n` +
        `      ${' '.repeat(pad)}  ${b.mid}\n` +
        `Seq2  ${String(b.start).padStart(pad)}  ${b.b}  ${b.end}\n\n`
      ));
    });

    container.appendChild(el('div', { class: 'card' }, [
      el('h4', { text: 'Alignment' }),
      el('p', { class: 'tool-cat', text: a.type === 'protein' ? '| identical · : conservative substitution' : '| identical' }),
      pre
    ]));

    container.appendChild(el('div', { class: 'btn-row', style: 'margin-top:1rem;' }, [
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => download('alignment.txt', pre.textContent, 'text/plain')
      }, [el('i', { class: 'fa-solid fa-download', 'aria-hidden': 'true' }), 'Download alignment']),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => {
          Notebook.addFinding(state.notebook, 4, 'Pairwise alignment',
            `${fmt(a.identityPercent, 1)}% identity over ${a.length} positions, ${a.gaps} gaps`);
          saveNotebook();
          toast('Alignment summary saved to notebook', 'success');
        }
      }, [el('i', { class: 'fa-solid fa-bookmark', 'aria-hidden': 'true' }), 'Save summary'])
    ]));
    animateReadouts(container);
  }

  function runAlignment() {
    const rawA = $('#align-seq-a').value;
    const rawB = $('#align-seq-b').value;
    if (!rawA.trim() || !rawB.trim()) { toast('Enter both sequences.', 'error'); return; }

    // Accept FASTA or raw sequence in either box
    const parse = txt => {
      const recs = SeqLib.parseFasta(txt);
      return recs.length ? recs[0].sequence : txt.replace(/\s/g, '').toUpperCase();
    };

    state.alignment = SeqTools.pairwiseAlign(parse(rawA), parse(rawB));
    renderAlignTool();
    if (!state.alignment.error) {
      toast(`Aligned at ${fmt(state.alignment.identityPercent, 1)}% identity`, 'success');
    }
  }

  // ======================================================================
  // Protocol
  // ======================================================================

  function renderStepList() {
    const list = $('#step-list');
    if (!list) return;
    list.innerHTML = '';
    PROTOCOL_STEPS.forEach(step => {
      const done = state.completedSteps.includes(step.step);
      const entry = Notebook.getStep(state.notebook, step.step);
      const documented = (entry.notes && entry.notes.trim()) || entry.findings.length;

      const btn = el('button', { type: 'button', class: done ? 'done' : '', onclick: () => goToStep(step.step) }, [
        el('span', { class: 'step-num', text: done ? '✓' : String(step.step) }),
        el('span', { class: 'step-name', text: step.short }),
        documented ? el('i', { class: 'fa-solid fa-note-sticky step-flag', title: 'Has notebook entries', 'aria-hidden': 'true' }) : null
      ]);
      if (step.step === state.currentStep) btn.setAttribute('aria-current', 'step');
      list.appendChild(el('li', {}, btn));
    });
  }

  function renderStepDetail() {
    const step = PROTOCOL_STEPS.find(s => s.step === state.currentStep);
    const container = $('#step-detail');
    if (!step || !container) return;
    container.innerHTML = '';

    const record = activeRecord();
    const done = state.completedSteps.includes(step.step);
    const entry = Notebook.getStep(state.notebook, step.step);

    container.appendChild(el('div', { class: 'step-head' }, [
      el('div', { class: 'step-icon' }, el('i', { class: 'fa-solid ' + step.icon, 'aria-hidden': 'true' })),
      el('div', {}, [
        el('div', { class: 'tool-cat', text: `Step ${step.step} of ${PROTOCOL_STEPS.length}` }),
        el('h3', { text: step.title, style: 'margin:0;' })
      ])
    ]));

    container.appendChild(el('p', { class: 'lede', text: step.description }));

    if (step.guidance && step.guidance.length) {
      container.appendChild(el('div', { class: 'callout' }, [
        el('h4', { text: 'Practical notes' }),
        el('ul', {}, step.guidance.map(g => el('li', { text: g })))
      ]));
    }

    container.appendChild(record
      ? el('div', { class: 'callout' }, [
          el('h4', { text: 'Sequence that will be sent' }),
          el('p', { class: 'mono', style: 'margin:0;font-size:.875rem;',
            text: `${record.id} — ${fmtInt(record.length)} ${record.type === 'protein' ? 'residues' : 'bp'} (${record.type.toUpperCase()})` })
        ])
      : el('div', { class: 'callout' }, [
          el('h4', { text: 'No sequence loaded' }),
          el('p', { style: 'margin:0;font-size:.9375rem;' }, [
            'Load a sequence in the ',
            el('a', { href: '#', onclick: e => { e.preventDefault(); switchTab('analyzer'); } }, 'Analyzer'),
            ' tab and the tools below will receive it automatically.'
          ])
        ]));

    // ---- notebook entry for this step
    const findingsList = el('div', { class: 'findings' },
      entry.findings.length
        ? entry.findings.map(f => el('div', { class: 'finding' }, [
            el('div', {}, [
              el('strong', { text: f.label }),
              el('span', { class: 'finding-value', text: f.value || '(not recorded)' })
            ]),
            el('button', {
              class: 'icon-btn-sm', type: 'button', 'aria-label': `Remove finding ${f.label}`,
              onclick: () => {
                Notebook.removeFinding(state.notebook, step.step, f.id);
                saveNotebook(); renderStepDetail(); renderStepList();
              }
            }, el('i', { class: 'fa-solid fa-xmark', 'aria-hidden': 'true' }))
          ]))
        : [el('p', { class: 'hint', style: 'margin:0;', text: 'No findings recorded for this step yet.' })]);

    container.appendChild(el('div', { class: 'notebook-block' }, [
      el('h4', { class: 'block-title' }, [
        el('i', { class: 'fa-solid fa-flask-vial', 'aria-hidden': 'true' }), ' Your record for this step'
      ]),
      findingsList,
      el('div', { class: 'finding-form' }, [
        el('input', { class: 'input', id: 'finding-label', type: 'text', placeholder: 'What did you find? (e.g. Conserved domain)', 'aria-label': 'Finding label' }),
        el('input', { class: 'input', id: 'finding-value', type: 'text', placeholder: 'Value (e.g. PLN03075, E = 1e-179)', 'aria-label': 'Finding value' }),
        el('button', {
          class: 'btn btn-primary btn-sm', type: 'button',
          onclick: () => {
            const label = $('#finding-label').value;
            const value = $('#finding-value').value;
            if (!label.trim()) { toast('Give the finding a label.', 'error'); return; }
            Notebook.addFinding(state.notebook, step.step, label, value);
            saveNotebook();
            renderStepDetail(); renderStepList();
            toast('Finding recorded', 'success');
          }
        }, [el('i', { class: 'fa-solid fa-plus', 'aria-hidden': 'true' }), 'Add'])
      ]),
      el('div', { class: 'field', style: 'margin:1rem 0 0;' }, [
        el('label', { for: 'step-notes', text: 'Notes' }),
        el('textarea', {
          id: 'step-notes', class: 'textarea', style: 'min-height:110px;font-family:var(--font-body);font-size:.9375rem;',
          placeholder: 'Observations, parameters used, anything you want in the final report…',
          oninput: e => { Notebook.setNotes(state.notebook, step.step, e.target.value); },
          onblur: () => { saveNotebook(); renderStepList(); }
        }, entry.notes || '')
      ]),
      entry.toolsUsed.length
        ? el('p', { class: 'hint', style: 'margin:.75rem 0 0;', text: 'Tools opened from this step: ' + entry.toolsUsed.join(', ') })
        : null
    ]));

    // ---- tools
    container.appendChild(el('h4', { class: 'block-title', style: 'margin:1.75rem 0 .75rem;',
      text: `Tools for this step (${step.tools.length})` }));
    container.appendChild(el('div', { class: 'grid grid-2' }, step.tools.map(t => toolCard(t, step.step))));

    // ---- navigation
    container.appendChild(el('div', { class: 'step-nav' }, [
      el('button', {
        class: 'btn btn-ghost', type: 'button',
        disabled: state.currentStep === 1 ? 'disabled' : null,
        onclick: () => goToStep(state.currentStep - 1)
      }, [el('i', { class: 'fa-solid fa-arrow-left', 'aria-hidden': 'true' }), 'Previous']),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: done ? 'btn btn-ghost' : 'btn btn-success', type: 'button',
          onclick: () => toggleComplete(step.step)
        }, [
          el('i', { class: 'fa-solid ' + (done ? 'fa-rotate-left' : 'fa-check'), 'aria-hidden': 'true' }),
          done ? 'Mark incomplete' : 'Mark complete'
        ]),
        el('button', {
          class: 'btn btn-primary', type: 'button',
          disabled: state.currentStep === PROTOCOL_STEPS.length ? 'disabled' : null,
          onclick: () => goToStep(state.currentStep + 1)
        }, ['Next', el('i', { class: 'fa-solid fa-arrow-right', 'aria-hidden': 'true' })])
      ])
    ]));
  }

  function updateProgress() {
    const pct = (state.completedSteps.length / PROTOCOL_STEPS.length) * 100;
    const bar = $('#progress-bar');
    if (!bar) return;
    bar.style.width = pct + '%';
    $('#progress-label').textContent =
      `${state.completedSteps.length} of ${PROTOCOL_STEPS.length} steps complete (${Math.round(pct)}%)`;
    $('#progress-track').setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function goToStep(n) {
    if (n < 1 || n > PROTOCOL_STEPS.length) return;
    state.currentStep = n;
    renderStepList(); renderStepDetail(); updateProgress(); save();
    $('#step-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleComplete(n) {
    const i = state.completedSteps.indexOf(n);
    if (i === -1) state.completedSteps.push(n); else state.completedSteps.splice(i, 1);
    renderStepList(); renderStepDetail(); updateProgress(); save();
  }

  // ======================================================================
  // Tool directory
  // ======================================================================

  function renderToolDirectory(filter = '') {
    const container = $('#tool-directory');
    if (!container) return;
    container.innerHTML = '';
    const q = filter.trim().toLowerCase();

    const tools = allTools().filter(t => !q ||
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q));

    $('#tool-count').textContent =
      `${tools.length} ${tools.length === 1 ? 'resource' : 'resources'}${q ? ` matching "${filter}"` : ''}`;

    if (!tools.length) {
      container.appendChild(emptyState('fa-magnifying-glass', 'No tools match that search.'));
      return;
    }
    tools.sort((a, b) => a.name.localeCompare(b.name)).forEach(t => container.appendChild(toolCard(t)));
  }

  // ======================================================================
  // Databases
  // ======================================================================

  function databaseCard(db) {
    const query = $('#db-query') ? $('#db-query').value.trim() : '';
    const searchUrl = Databases.buildSearchUrl(db, query);

    return el('article', { class: 'tool-card' }, [
      el('div', { class: 'tool-head' }, [
        el('div', {}, [
          el('div', { class: 'tool-name', text: db.name }),
          el('div', { class: 'tool-cat', text: db.organism })
        ]),
        db.searchTemplate
          ? el('span', { class: 'badge badge-auto', title: 'Supports direct search from this page' },
              [el('i', { class: 'fa-solid fa-magnifying-glass', 'aria-hidden': 'true' }), 'Searchable'])
          : el('span', { class: 'badge badge-open' },
              [el('i', { class: 'fa-solid fa-arrow-up-right-from-square', 'aria-hidden': 'true' }), 'Browse'])
      ]),
      el('p', { class: 'tool-desc', text: db.description }),
      el('p', { class: 'tool-holds', text: 'Holds: ' + db.holds }),
      el('div', { class: 'tool-foot' }, [
        el('a', { class: 'tool-host', href: db.url, target: '_blank', rel: 'noopener noreferrer' }, hostOf(db.url)),
        el('button', {
          class: 'btn btn-primary btn-sm', type: 'button',
          onclick: () => {
            window.open(searchUrl || db.url, '_blank', 'noopener');
            if (searchUrl) toast(`Searching ${db.name} for "${query}"`, 'success');
          }
        }, [
          el('i', { class: 'fa-solid ' + (searchUrl ? 'fa-magnifying-glass' : 'fa-arrow-up-right-from-square'), 'aria-hidden': 'true' }),
          searchUrl ? 'Search' : 'Open'
        ])
      ])
    ]);
  }

  function renderDatabases(filter = '') {
    const container = $('#database-list');
    if (!container) return;
    container.innerHTML = '';
    const q = filter.trim().toLowerCase();

    if (q) {
      const hits = Databases.searchDatabases(q);
      $('#db-count').textContent = `${hits.length} database${hits.length === 1 ? '' : 's'} matching "${filter}"`;
      if (!hits.length) { container.appendChild(emptyState('fa-magnifying-glass', 'No databases match that search.')); return; }
      container.appendChild(el('div', { class: 'grid grid-3' }, hits.map(databaseCard)));
      return;
    }

    $('#db-count').textContent = `${Databases.allDatabases().length} databases in ${Databases.DATABASE_CATEGORIES.length} categories`;

    Databases.DATABASE_CATEGORIES.forEach(cat => {
      container.appendChild(el('section', { class: 'db-category' }, [
        el('h3', { class: 'db-category-title' }, [
          el('i', { class: 'fa-solid ' + cat.icon, 'aria-hidden': 'true' }),
          ' ' + cat.name
        ]),
        el('p', { class: 'tool-cat', style: 'margin:0 0 1rem;', text: cat.description }),
        el('div', { class: 'grid grid-3' }, cat.databases.map(databaseCard))
      ]));
    });
  }

  // ======================================================================
  // Notebook tab
  // ======================================================================

  function renderNotebook() {
    const container = $('#notebook-content');
    if (!container) return;
    container.innerHTML = '';

    const nb = state.notebook;
    const s = Notebook.stats(nb, PROTOCOL_STEPS.length);

    // ---- project metadata
    const fields = [
      ['title', 'Report title', 'e.g. NAS gene family in Setaria italica'],
      ['gene', 'Gene', 'e.g. SiNAS3'],
      ['family', 'Gene family', 'e.g. Nicotianamine synthase'],
      ['species', 'Species', 'e.g. Setaria italica'],
      ['accession', 'Accession', 'e.g. XP_004958765.3'],
      ['researcher', 'Researcher', 'Your name']
    ];

    container.appendChild(el('div', { class: 'card', style: 'margin-bottom:1.5rem;' }, [
      el('h3', { text: 'Project details' }),
      el('p', { class: 'tool-cat', style: 'margin-bottom:1rem;', text: 'These appear in the header of your exported report.' }),
      el('div', { class: 'grid grid-3' }, fields.map(([key, label, placeholder]) =>
        el('div', { class: 'field', style: 'margin:0;' }, [
          el('label', { for: 'nb-' + key, text: label }),
          el('input', {
            id: 'nb-' + key, class: 'input', type: 'text', placeholder, value: nb.project[key] || '',
            oninput: e => { nb.project[key] = e.target.value; },
            onblur: () => saveNotebook()
          })
        ])))
    ]));

    // ---- summary
    container.appendChild(el('div', { class: 'grid grid-4', style: 'margin-bottom:1.5rem;' }, [
      statCard(`${s.stepsWithNotes} / ${s.totalSteps}`, 'Steps documented'),
      statCard(fmtInt(s.totalFindings), 'Findings recorded'),
      statCard(fmtInt(s.savedAnalyses), 'Analyses saved'),
      statCard(fmtInt(s.toolsUsed), 'Tools used')
    ]));

    // ---- saved analyses
    container.appendChild(el('div', { class: 'card', style: 'margin-bottom:1.5rem;' }, [
      el('h3', { text: 'Saved analyses' }),
      nb.analyses.length
        ? el('div', {}, nb.analyses.map(a => el('div', { class: 'saved-analysis' }, [
            el('div', {}, [
              el('strong', { text: a.sequenceId }),
              el('span', { class: 'tool-cat', text: ` ${a.type.toUpperCase()} · ${fmtInt(a.length)} ${a.type === 'protein' ? 'aa' : 'bp'} · saved ${Notebook.formatDate(a.recorded)}` }),
              el('div', { class: 'metric-chips' }, Object.entries(a.metrics).map(([k, v]) =>
                el('span', { class: 'chip', text: `${k}: ${v}` })))
            ]),
            el('button', {
              class: 'icon-btn-sm', type: 'button', 'aria-label': `Remove analysis ${a.sequenceId}`,
              onclick: () => { Notebook.removeAnalysis(nb, a.id); saveNotebook(); renderNotebook(); }
            }, el('i', { class: 'fa-solid fa-xmark', 'aria-hidden': 'true' }))
          ])))
        : el('p', { class: 'hint', style: 'margin:0;' }, [
            'No analyses saved yet. Run an analysis and click ',
            el('strong', { text: 'Save to notebook' }), '.'
          ])
    ]));

    // ---- documented steps
    const documented = Notebook.documentedSteps(nb, PROTOCOL_STEPS);
    container.appendChild(el('div', { class: 'card', style: 'margin-bottom:1.5rem;' }, [
      el('h3', { text: 'Protocol record' }),
      documented.length
        ? el('div', {}, documented.map(({ step, entry }) => el('div', { class: 'record-step' }, [
            el('button', {
              class: 'record-step-title', type: 'button',
              onclick: () => { switchTab('protocol'); goToStep(step.step); }
            }, [el('span', { class: 'step-num', text: String(step.step) }), step.title]),
            entry.findings.length
              ? el('ul', { class: 'record-findings' }, entry.findings.map(f =>
                  el('li', {}, [el('strong', { text: f.label + ': ' }), f.value || '(not recorded)'])))
              : null,
            entry.notes && entry.notes.trim()
              ? el('p', { class: 'record-notes', text: entry.notes })
              : null
          ])))
        : el('p', { class: 'hint', style: 'margin:0;', text: 'Nothing documented yet. Add findings and notes as you work through the protocol.' })
    ]));

    // ---- export
    container.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Export' }),
      el('p', { class: 'tool-cat', style: 'margin-bottom:1rem;',
        text: 'Your notebook is stored only in this browser. Export it to keep a copy or move it elsewhere.' }),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: () => {
            const html = Notebook.toHtml(nb, PROTOCOL_STEPS);
            const win = window.open('', '_blank');
            if (win) { win.document.write(html); win.document.close(); }
            else download('report.html', html, 'text/html');
          }
        }, [el('i', { class: 'fa-solid fa-file-lines', 'aria-hidden': 'true' }), 'Open report (printable)']),
        el('button', {
          class: 'btn btn-ghost', type: 'button',
          onclick: () => download('gene_characterization_report.html', Notebook.toHtml(nb, PROTOCOL_STEPS), 'text/html')
        }, [el('i', { class: 'fa-solid fa-download', 'aria-hidden': 'true' }), 'Download HTML']),
        el('button', {
          class: 'btn btn-ghost', type: 'button',
          onclick: () => download('gene_characterization_report.md', Notebook.toMarkdown(nb, PROTOCOL_STEPS), 'text/markdown')
        }, [el('i', { class: 'fa-brands fa-markdown', 'aria-hidden': 'true' }), 'Download Markdown']),
        el('button', {
          class: 'btn btn-ghost', type: 'button',
          onclick: () => download('notebook_backup.json', Notebook.toJson(nb), 'application/json')
        }, [el('i', { class: 'fa-solid fa-file-code', 'aria-hidden': 'true' }), 'Backup JSON']),
        el('label', { class: 'btn btn-ghost', for: 'notebook-import', style: 'margin:0;' },
          [el('i', { class: 'fa-solid fa-upload', 'aria-hidden': 'true' }), 'Restore backup']),
        el('button', {
          class: 'btn btn-ghost', type: 'button', style: 'margin-left:auto;color:var(--error);',
          onclick: () => {
            if (!confirm('Clear the entire notebook? This cannot be undone. Consider downloading a JSON backup first.')) return;
            state.notebook = Notebook.clear();
            renderNotebook(); renderStepList(); renderStepDetail();
            toast('Notebook cleared', 'success');
          }
        }, [el('i', { class: 'fa-solid fa-trash', 'aria-hidden': 'true' }), 'Clear notebook'])
      ])
    ]));
  }

  // ======================================================================
  // Theme
  // ======================================================================

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const btn = $('#theme-toggle');
    if (btn) {
      btn.querySelector('i').className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    if (state.results.length) { renderResults(); renderToolkit(); }
    save();
  }

  // ======================================================================
  // Examples
  // ======================================================================

  const EXAMPLES = {
    dna: `>example_CDS Nicotianamine synthase-like coding sequence (synthetic demonstration sequence)
ATGGCTTGCGAAAACCAGCAAGCTCTTGTTGAGAAGATCGTTGAGAAGATCACCGGTCTT
CACGCTGCTATCACCAAGCTTCCTTCTCTTTCTCCTTCTGCTGAAGTTGACGCTCTTTTC
ACCGAACTTGTTACCGCTTGCGTTCCTTCTTCTGGTATCGACGTTGACAAGCTTTCTGCT
GAAGCTCAAGCTATGCGTGAAGACCTTATCCGTCTTTGCTCTGAAGCTGAAGGTCACCTT
GAAGCTCACTACTCTGACATGCTTGCTGCTCACGACAACCCTCTTGACCACCTTGCTCTT
TTCCCTTACTTCAACAACTACATCCAACTTGGTAAGCTTGAATACGAACTTCTTGCTCGT
TACGTTCCTGGTATCGCTCCTACCGCTGCTTTCATCGGTTCTGGTCCTCTTCCTCTTACC
TCTATCGTTCTTGCTGCTCACCACCTTCCTAACACCACCTTCCACAACTACGACATCGAC
GCTGCTGCTAACCACCGTGCTGCTCAACTTGTTCGTTCTGACCCTAACCTTTCTGCTCGT
ATGACCTTCCACACCTCTGACGTTACCAACGTTACCGCTGACCTTGGTAACTACGACGTT
GTTTTCCTTGCTGCTCTTGTTGGTATGGCTGCTGAAGAAAAGGCTAAGATGATCGCTCAC
CTTGGTAAGCACATGGCTCCTGGTGCTGCTCTTGTTGTTCGTTCTGCTCACGGTGCTCGT
GCTTTCCTTTACCCTATCGTTGACCCTGAAGACCTTCGTCGTGGTGGTTTCGACGTTCTT
GCTGTTCACCACCCTGAAGGTGAAGTTATCAACTCTGTTATCATCGCTCGTAAGTAA`,

    protein: `>example_protein Nicotianamine synthase-like (synthetic demonstration sequence)
MACENQQALVEKIVEKITGLHAAITKLPSLSPSAEVDALFTELVTACVPSSGIDVDKLSA
EAQAMREDLIRLCSEAEGHLEAHYSDMLAAHDNPLDHLALFPYFNNYIQLGKLEYELLAR
YVPGIAPTAAFIGSGPLPLTSIVLAAHHLPNTTFHNYDIDAAANHRAAQLVRSDPNLSAR
MTFHTSDVTNVTADLGNYDVVFLAALVGMAAEEKAKMIAHLGKHMAPGAALVVRSAHGAR
AFLYPIVDPEDLRRGGFDVLAVHHPEGEVINSVIIARK`,

    multi: `>seq1_high_GC
GCGCGCGGCGGCGCCGGCGCGGCCGGCGCGGCGGCCGCGGCGCCGGCGCGGCCGGCGCGG
CGGCCGCGGCGCCGGCGCGGCCGGCGCGGCGGCCGCGGCGCCGGCGCGGCCGGCGCGGCG
>seq2_low_GC
ATATATTAATTAATATTAAATATTAATTAATATTAAATATTAATTAATATTAAATATTAA
TTAATATTAAATATTAATTAATATTAAATATTAATTAATATTAAATATTAATTAATATTA
>seq3_with_microsatellites
CCATGGCTAAGCTTGAAGCTCGTAAGCTTGCTGAAGCTAAGCTTGAAGCTCGTAAGCTTG
ATATATATATATATATATATGGCCTTAAGGCCTTAAGGCTGCTGCTGCTGCTGCTGCTGA
AAAAAAAAAAAAAAGGCCTTAAGGATCCTTAAGGCCTTAAGCTTGAAGCTCGTTAAGGGC`
  };

  function loadExample(kind) {
    $('#sequence-input').value = EXAMPLES[kind];
    save();
    runAnalysis();
  }

  // ======================================================================
  // Init
  // ======================================================================

  function init() {
    state.notebook = Notebook.load();
    restore();
    applyTheme(state.theme);

    // Tabs
    $$('.nav-tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    $$('[data-subtab]').forEach(btn =>
      btn.addEventListener('click', () => switchSubTab(btn.dataset.subtabGroup, btn.dataset.subtab)));

    // Analyzer
    $('#analyze-btn').addEventListener('click', () => runAnalysis());
    $('#clear-btn').addEventListener('click', () => {
      $('#sequence-input').value = '';
      state.results = [];
      state.primers = state.ssrs = state.digestResult = null;
      renderResults(); renderToolkit(); renderStepDetail(); save();
      $('#char-count').textContent = '';
    });
    $$('[data-example]').forEach(b => b.addEventListener('click', () => loadExample(b.dataset.example)));

    $('#file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) { toast('That file is larger than 20 MB.', 'error'); return; }
      const reader = new FileReader();
      reader.onload = ev => { $('#sequence-input').value = ev.target.result; runAnalysis(); };
      reader.onerror = () => toast('Could not read that file.', 'error');
      reader.readAsText(file);
    });

    $('#sequence-input').addEventListener('input', () => {
      const chars = $('#sequence-input').value.split('\n').filter(l => !l.startsWith('>')).join('').replace(/\s/g, '').length;
      $('#char-count').textContent = chars ? `${chars.toLocaleString()} characters` : '';
    });
    $('#sequence-input').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runAnalysis(); }
    });

    // Toolkit
    $('#primer-run').addEventListener('click', runPrimerDesign);
    $('#ssr-run').addEventListener('click', runSsrScan);
    $('#digest-run').addEventListener('click', runDigest);
    $('#align-run').addEventListener('click', runAlignment);
    $('#align-use-loaded').addEventListener('click', () => {
      const r = activeRecord();
      if (!r) { toast('No sequence loaded in the Analyzer.', 'error'); return; }
      $('#align-seq-a').value = r.sequence;
      toast(`Loaded "${r.id}" into sequence 1`, 'success');
    });
    renderDigestEnzymePicker();
    $('#digest-select-all').addEventListener('click', () => {
      const all = $$('#digest-enzymes input');
      const allChecked = all.every(i => i.checked);
      all.forEach(i => { i.checked = !allChecked; });
    });

    // Directories
    $('#tool-search').addEventListener('input', e => renderToolDirectory(e.target.value));
    $('#db-search').addEventListener('input', e => renderDatabases(e.target.value));
    $('#db-query').addEventListener('input', () => renderDatabases($('#db-search').value));

    // Notebook import
    $('#notebook-import').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const { notebook, error } = Notebook.fromJson(ev.target.result);
        if (error) { toast(error, 'error'); return; }
        state.notebook = notebook;
        saveNotebook();
        renderNotebook(); renderStepList(); renderStepDetail();
        toast('Notebook restored', 'success');
      };
      reader.onerror = () => toast('Could not read that file.', 'error');
      reader.readAsText(file);
      e.target.value = '';
    });

    // Theme
    $('#theme-toggle').addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));

    // Hero actions
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));

    // First render
    renderStepList();
    renderStepDetail();
    updateProgress();
    renderToolDirectory();
    renderDatabases();
    renderResults();

    // If a sequence was restored from a previous session, analyze it quietly
    if ($('#sequence-input').value.trim()) {
      runAnalysis(true);
      const chars = $('#sequence-input').value.split('\n').filter(l => !l.startsWith('>')).join('').replace(/\s/g, '').length;
      $('#char-count').textContent = chars ? `${chars.toLocaleString()} characters` : '';
    } else {
      renderToolkit();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

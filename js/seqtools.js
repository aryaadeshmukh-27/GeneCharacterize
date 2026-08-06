/**
 * seqtools.js — Advanced sequence analysis for GeneCharacterize.
 *
 * Builds on seqlib.js with the heavier algorithms: PCR primer design,
 * Needleman-Wunsch global alignment, microsatellite (SSR) detection and
 * virtual restriction digestion.
 *
 * As with seqlib, everything here is a pure function with no DOM access so it
 * can be unit tested in Node.
 *
 * References:
 *   Needleman & Wunsch (1970) J Mol Biol 48:443-453   — global alignment
 *   Henikoff & Henikoff (1992) PNAS 89:10915-10919    — BLOSUM62
 *   Thiel et al. (2003) Theor Appl Genet 106:411-422  — MISA SSR thresholds
 */

(function (root, factory) {
  const lib = factory(
    typeof require === 'function' ? require('./seqlib.js') : root.SeqLib
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof window !== 'undefined') window.SeqTools = lib;
})(typeof self !== 'undefined' ? self : this, function (SeqLib) {
  'use strict';

  // =========================================================================
  // Primer design
  // =========================================================================

  const PRIMER_DEFAULTS = {
    minLength: 18,
    maxLength: 25,
    minTm: 55,
    maxTm: 65,
    maxTmDiff: 3,
    minGc: 40,
    maxGc: 60,
    minProduct: 100,
    maxProduct: 1000,
    maxPairs: 10
  };

  /**
   * Nearest-neighbour melting temperature (SantaLucia 1998 unified parameters).
   * More accurate than the GC formula in seqlib, which matters for primers.
   *
   * @param {string} seq
   * @param {number} primerConc molar concentration (default 0.25 µM)
   * @param {number} saltConc monovalent salt, molar (default 50 mM)
   * @returns {number} Tm in degrees Celsius
   */
  function primerTm(seq, primerConc = 0.25e-6, saltConc = 0.05) {
    const s = seq.toUpperCase().replace(/[^ACGT]/g, '');
    if (s.length < 2) return 0;

    // ΔH (kcal/mol), ΔS (cal/mol·K) for each nearest-neighbour pair
    const NN = {
      AA: [-7.9, -22.2], AT: [-7.2, -20.4], AC: [-8.4, -22.4], AG: [-7.8, -21.0],
      TA: [-7.2, -21.3], TT: [-7.9, -22.2], TC: [-8.2, -22.2], TG: [-8.5, -22.7],
      CA: [-8.5, -22.7], CT: [-7.8, -21.0], CC: [-8.0, -19.9], CG: [-10.6, -27.2],
      GA: [-8.2, -22.2], GT: [-8.4, -22.4], GC: [-9.8, -24.4], GG: [-8.0, -19.9]
    };

    let dH = 0, dS = 0;
    for (let i = 0; i < s.length - 1; i++) {
      const pair = NN[s.slice(i, i + 2)];
      if (pair) { dH += pair[0]; dS += pair[1]; }
    }

    // Helix initiation terms
    const initH = { A: 2.3, T: 2.3, C: 0.1, G: 0.1 };
    const initS = { A: 4.1, T: 4.1, C: -2.8, G: -2.8 };
    dH += (initH[s[0]] || 0) + (initH[s[s.length - 1]] || 0);
    dS += (initS[s[0]] || 0) + (initS[s[s.length - 1]] || 0);

    const R = 1.987;                                   // cal/(mol·K)
    let tm = (dH * 1000) / (dS + R * Math.log(primerConc / 4)) - 273.15;
    // Salt correction (Owczarzy 2004, simplified)
    tm += 16.6 * Math.log10(saltConc);
    return tm;
  }

  /** Longest run of a single repeated base, e.g. "AAAA" scores 4. */
  function longestHomopolymer(seq) {
    let best = 0, run = 0, prev = '';
    for (const ch of seq.toUpperCase()) {
      run = ch === prev ? run + 1 : 1;
      prev = ch;
      if (run > best) best = run;
    }
    return best;
  }

  /**
   * Length of the longest self-complementary stretch — a proxy for hairpin and
   * primer-dimer risk. Lower is better.
   */
  function selfComplementarity(seq) {
    const s = seq.toUpperCase();
    const rc = SeqLib.reverseComplement(s);
    let best = 0;
    for (let offset = -(s.length - 1); offset < s.length; offset++) {
      let run = 0;
      for (let i = 0; i < s.length; i++) {
        const j = i + offset;
        if (j < 0 || j >= rc.length) { run = 0; continue; }
        if (s[i] === rc[j]) { run++; if (run > best) best = run; }
        else run = 0;
      }
    }
    return best;
  }

  /** True when the 3' end has 1-3 G/C in the last 5 bases — aids binding. */
  function hasGcClamp(seq) {
    const tail = seq.toUpperCase().slice(-5);
    const gc = (tail.match(/[GC]/g) || []).length;
    return gc >= 1 && gc <= 3;
  }

  /**
   * Score a candidate primer. Returns null if it violates a hard constraint.
   * Lower scores are better.
   */
  function evaluatePrimer(seq, opts) {
    const tm = primerTm(seq);
    const gc = SeqLib.gcContent(seq);

    if (tm < opts.minTm || tm > opts.maxTm) return null;
    if (gc < opts.minGc || gc > opts.maxGc) return null;
    if (longestHomopolymer(seq) > 4) return null;
    if (!hasGcClamp(seq)) return null;

    const selfComp = selfComplementarity(seq);
    if (selfComp > 8) return null;

    // Penalise distance from the ideal Tm (60 °C) and GC (50%), plus dimer risk
    const score =
      Math.abs(tm - 60) * 2 +
      Math.abs(gc - 50) * 0.5 +
      selfComp * 1.5 +
      (longestHomopolymer(seq) - 1);

    return {
      sequence: seq,
      length: seq.length,
      tm: Math.round(tm * 10) / 10,
      gc: Math.round(gc * 10) / 10,
      selfComplementarity: selfComp,
      homopolymer: longestHomopolymer(seq),
      score: Math.round(score * 100) / 100
    };
  }

  /**
   * Design PCR primer pairs for a template.
   *
   * Candidate forward primers are taken from the 5' region and reverse primers
   * from the 3' region (as reverse complements), then paired by Tm compatibility
   * and product size.
   *
   * @param {string} template
   * @param {Object} options overrides for PRIMER_DEFAULTS
   * @returns {{pairs: Array, warnings: string[]}}
   */
  function designPrimers(template, options = {}) {
    const opts = { ...PRIMER_DEFAULTS, ...options };
    const seq = template.toUpperCase().replace(/[^ACGT]/g, '');
    const warnings = [];

    if (seq.length < opts.minProduct) {
      return {
        pairs: [],
        warnings: [`Template is ${seq.length} bp, shorter than the minimum product size of ${opts.minProduct} bp.`]
      };
    }

    // Search windows: forward primers near the 5' end, reverse near the 3' end
    const windowSize = Math.min(Math.floor(seq.length / 2), Math.max(200, Math.floor(seq.length * 0.3)));

    const forward = [];
    for (let start = 0; start < windowSize; start++) {
      for (let len = opts.minLength; len <= opts.maxLength; len++) {
        if (start + len > seq.length) break;
        const p = evaluatePrimer(seq.slice(start, start + len), opts);
        if (p) forward.push({ ...p, start: start + 1, end: start + len });
      }
    }

    const reverse = [];
    for (let end = seq.length; end > seq.length - windowSize; end--) {
      for (let len = opts.minLength; len <= opts.maxLength; len++) {
        if (end - len < 0) break;
        const region = seq.slice(end - len, end);
        const p = evaluatePrimer(SeqLib.reverseComplement(region), opts);
        if (p) reverse.push({ ...p, start: end - len + 1, end });
      }
    }

    if (!forward.length) warnings.push('No forward primer met the constraints. Try widening the Tm or GC range.');
    if (!reverse.length) warnings.push('No reverse primer met the constraints. Try widening the Tm or GC range.');

    // Pair them up
    const pairs = [];
    for (const f of forward) {
      for (const r of reverse) {
        const product = r.end - f.start + 1;
        if (product < opts.minProduct || product > opts.maxProduct) continue;
        const tmDiff = Math.abs(f.tm - r.tm);
        if (tmDiff > opts.maxTmDiff) continue;

        // Cross-dimer risk between the two primers
        const cross = selfComplementarity(f.sequence + r.sequence);

        pairs.push({
          forward: f,
          reverse: r,
          productSize: product,
          tmDifference: Math.round(tmDiff * 10) / 10,
          crossDimer: cross,
          score: Math.round((f.score + r.score + tmDiff * 3 + cross) * 100) / 100
        });
      }
    }

    pairs.sort((a, b) => a.score - b.score);

    // Keep the best pairs while avoiding near-duplicates of the same primer
    const chosen = [];
    const usedForward = new Set();
    const usedReverse = new Set();
    for (const p of pairs) {
      if (usedForward.has(p.forward.start) || usedReverse.has(p.reverse.end)) continue;
      chosen.push(p);
      usedForward.add(p.forward.start);
      usedReverse.add(p.reverse.end);
      if (chosen.length >= opts.maxPairs) break;
    }

    if (pairs.length && !chosen.length) {
      warnings.push('Primers were found but none could be paired within the product size range.');
    }

    return { pairs: chosen, warnings };
  }

  // =========================================================================
  // Pairwise alignment (Needleman-Wunsch, global)
  // =========================================================================

  /** BLOSUM62 substitution matrix, stored as a flat lookup. */
  const BLOSUM62_ORDER = 'ARNDCQEGHILKMFPSTWYV';
  const BLOSUM62_ROWS = [
    [4,-1,-2,-2,0,-1,-1,0,-2,-1,-1,-1,-1,-2,-1,1,0,-3,-2,0],
    [-1,5,0,-2,-3,1,0,-2,0,-3,-2,2,-1,-3,-2,-1,-1,-3,-2,-3],
    [-2,0,6,1,-3,0,0,0,1,-3,-3,0,-2,-3,-2,1,0,-4,-2,-3],
    [-2,-2,1,6,-3,0,2,-1,-1,-3,-4,-1,-3,-3,-1,0,-1,-4,-3,-3],
    [0,-3,-3,-3,9,-3,-4,-3,-3,-1,-1,-3,-1,-2,-3,-1,-1,-2,-2,-1],
    [-1,1,0,0,-3,5,2,-2,0,-3,-2,1,0,-3,-1,0,-1,-2,-1,-2],
    [-1,0,0,2,-4,2,5,-2,0,-3,-3,1,-2,-3,-1,0,-1,-3,-2,-2],
    [0,-2,0,-1,-3,-2,-2,6,-2,-4,-4,-2,-3,-3,-2,0,-2,-2,-3,-3],
    [-2,0,1,-1,-3,0,0,-2,8,-3,-3,-1,-2,-1,-2,-1,-2,-2,2,-3],
    [-1,-3,-3,-3,-1,-3,-3,-4,-3,4,2,-3,1,0,-3,-2,-1,-3,-1,3],
    [-1,-2,-3,-4,-1,-2,-3,-4,-3,2,4,-2,2,0,-3,-2,-1,-2,-1,1],
    [-1,2,0,-1,-3,1,1,-2,-1,-3,-2,5,-1,-3,-1,0,-1,-3,-2,-2],
    [-1,-1,-2,-3,-1,0,-2,-3,-2,1,2,-1,5,0,-2,-1,-1,-1,-1,1],
    [-2,-3,-3,-3,-2,-3,-3,-3,-1,0,0,-3,0,6,-4,-2,-2,1,3,-1],
    [-1,-2,-2,-1,-3,-1,-1,-2,-2,-3,-3,-1,-2,-4,7,-1,-1,-4,-3,-2],
    [1,-1,1,0,-1,0,0,0,-1,-2,-2,0,-1,-2,-1,4,1,-3,-2,-2],
    [0,-1,0,-1,-1,-1,-1,-2,-2,-1,-1,-1,-1,-2,-1,1,5,-2,-2,0],
    [-3,-3,-4,-4,-2,-2,-3,-2,-2,-3,-2,-3,-1,1,-4,-3,-2,11,2,-3],
    [-2,-2,-2,-3,-2,-1,-2,-3,2,-1,-1,-2,-1,3,-3,-2,-2,2,7,-1],
    [0,-3,-3,-3,-1,-2,-2,-3,-3,3,1,-2,1,-1,-2,-2,0,-3,-1,4]
  ];

  function blosum62(a, b) {
    const i = BLOSUM62_ORDER.indexOf(a);
    const j = BLOSUM62_ORDER.indexOf(b);
    if (i === -1 || j === -1) return a === b ? 1 : -1;
    return BLOSUM62_ROWS[i][j];
  }

  /** Largest alignment this will attempt, to avoid locking up the browser. */
  const MAX_ALIGN_CELLS = 4_000_000;

  /**
   * Global pairwise alignment with affine-free linear gap penalties.
   *
   * @param {string} seqA
   * @param {string} seqB
   * @param {Object} options {match, mismatch, gap, type: 'dna'|'protein'|'auto'}
   * @returns {Object} alignment strings, score and identity statistics
   */
  function pairwiseAlign(seqA, seqB, options = {}) {
    const a = seqA.toUpperCase().replace(/[^A-Z]/g, '');
    const b = seqB.toUpperCase().replace(/[^A-Z]/g, '');

    if (!a.length || !b.length) {
      return { error: 'Both sequences must be non-empty.' };
    }
    if ((a.length + 1) * (b.length + 1) > MAX_ALIGN_CELLS) {
      return {
        error: `Sequences are too long to align in the browser ` +
               `(${a.length} × ${b.length}). Use EMBOSS Needle or MAFFT for sequences this size.`
      };
    }

    let type = options.type || 'auto';
    if (type === 'auto') {
      const ta = SeqLib.detectSequenceType(a);
      const tb = SeqLib.detectSequenceType(b);
      type = (ta === 'protein' || tb === 'protein') ? 'protein' : 'dna';
    }

    const match = options.match ?? 2;
    const mismatch = options.mismatch ?? -1;
    const gap = options.gap ?? -2;
    const score = (x, y) => type === 'protein' ? blosum62(x, y) : (x === y ? match : mismatch);

    const n = a.length, m = b.length;
    const prev = new Float64Array(m + 1);
    const curr = new Float64Array(m + 1);
    // Traceback: 0 = diagonal, 1 = up (gap in b), 2 = left (gap in a)
    const trace = new Uint8Array((n + 1) * (m + 1));

    for (let j = 0; j <= m; j++) { prev[j] = j * gap; trace[j] = 2; }
    trace[0] = 0;

    for (let i = 1; i <= n; i++) {
      curr[0] = i * gap;
      trace[i * (m + 1)] = 1;
      for (let j = 1; j <= m; j++) {
        const diag = prev[j - 1] + score(a[i - 1], b[j - 1]);
        const up = prev[j] + gap;
        const left = curr[j - 1] + gap;
        let best = diag, dir = 0;
        if (up > best) { best = up; dir = 1; }
        if (left > best) { best = left; dir = 2; }
        curr[j] = best;
        trace[i * (m + 1) + j] = dir;
      }
      prev.set(curr);
    }

    // Walk the traceback
    let i = n, j = m;
    const alignedA = [], alignedB = [], midline = [];
    while (i > 0 || j > 0) {
      const dir = (i === 0) ? 2 : (j === 0) ? 1 : trace[i * (m + 1) + j];
      if (dir === 0) {
        alignedA.push(a[i - 1]); alignedB.push(b[j - 1]);
        if (a[i - 1] === b[j - 1]) midline.push('|');
        else if (type === 'protein' && blosum62(a[i - 1], b[j - 1]) > 0) midline.push(':');
        else midline.push(' ');
        i--; j--;
      } else if (dir === 1) {
        alignedA.push(a[i - 1]); alignedB.push('-'); midline.push(' '); i--;
      } else {
        alignedA.push('-'); alignedB.push(b[j - 1]); midline.push(' '); j--;
      }
    }

    const A = alignedA.reverse().join('');
    const B = alignedB.reverse().join('');
    const M = midline.reverse().join('');

    const identities = (M.match(/\|/g) || []).length;
    const similars = identities + (M.match(/:/g) || []).length;
    const gaps = (A.match(/-/g) || []).length + (B.match(/-/g) || []).length;

    return {
      type,
      alignedA: A,
      alignedB: B,
      midline: M,
      length: A.length,
      score: prev[m],
      identities,
      identityPercent: (identities / A.length) * 100,
      similars,
      similarityPercent: (similars / A.length) * 100,
      gaps,
      gapPercent: (gaps / (A.length * 2)) * 100
    };
  }

  /**
   * Split an alignment into fixed-width blocks for display.
   * @returns {Array<{start:number, a:string, mid:string, b:string, end:number}>}
   */
  function formatAlignment(alignment, width = 60) {
    if (!alignment || alignment.error) return [];
    const blocks = [];
    for (let i = 0; i < alignment.length; i += width) {
      blocks.push({
        start: i + 1,
        end: Math.min(i + width, alignment.length),
        a: alignment.alignedA.slice(i, i + width),
        mid: alignment.midline.slice(i, i + width),
        b: alignment.alignedB.slice(i, i + width)
      });
    }
    return blocks;
  }

  // =========================================================================
  // Microsatellite (SSR) detection
  // =========================================================================

  /** Minimum repeat counts per motif length — MISA defaults (Thiel et al. 2003). */
  const SSR_MIN_REPEATS = { 1: 12, 2: 6, 3: 5, 4: 5, 5: 4, 6: 4 };

  /**
   * Normalize a motif to its lexicographically smallest rotation, so that
   * AT, TA and their rotations are reported as one motif class.
   */
  function canonicalMotif(motif) {
    let best = motif;
    for (let i = 1; i < motif.length; i++) {
      const rot = motif.slice(i) + motif.slice(0, i);
      if (rot < best) best = rot;
    }
    return best;
  }

  /**
   * Find simple sequence repeats (microsatellites).
   *
   * @param {string} seq
   * @param {Object} thresholds optional overrides of SSR_MIN_REPEATS
   * @returns {Array<Object>} non-overlapping SSRs, ordered by position
   */
  function findSSRs(seq, thresholds = {}) {
    const s = seq.toUpperCase().replace(/[^ACGT]/g, '');
    const minRepeats = { ...SSR_MIN_REPEATS, ...thresholds };
    const found = [];
    const covered = new Uint8Array(s.length);

    // Longer motifs first, so a hexamer isn't reported as three dimers
    for (let motifLen = 6; motifLen >= 1; motifLen--) {
      const need = minRepeats[motifLen];
      for (let i = 0; i + motifLen <= s.length; i++) {
        const motif = s.slice(i, i + motifLen);

        // Skip motifs that are themselves a shorter repeat (e.g. "AAA")
        if (motifLen > 1) {
          let degenerate = false;
          for (let d = 1; d < motifLen; d++) {
            if (motifLen % d === 0) {
              const unit = motif.slice(0, d);
              if (motif === unit.repeat(motifLen / d)) { degenerate = true; break; }
            }
          }
          if (degenerate) continue;
        }

        // Count consecutive repeats
        let count = 1;
        let j = i + motifLen;
        while (j + motifLen <= s.length && s.slice(j, j + motifLen) === motif) {
          count++; j += motifLen;
        }
        if (count < need) continue;

        // Reject if it overlaps an already-recorded SSR
        let overlaps = false;
        for (let k = i; k < j; k++) if (covered[k]) { overlaps = true; break; }
        if (overlaps) continue;

        for (let k = i; k < j; k++) covered[k] = 1;

        found.push({
          motif,
          canonical: canonicalMotif(motif),
          motifLength: motifLen,
          repeats: count,
          start: i + 1,
          end: j,
          length: j - i,
          type: ['', 'mono', 'di', 'tri', 'tetra', 'penta', 'hexa'][motifLen] + 'nucleotide',
          sequence: s.slice(i, j)
        });

        i = j - 1;   // continue scanning past this repeat
      }
    }

    return found.sort((a, b) => a.start - b.start);
  }

  // =========================================================================
  // Virtual restriction digest
  // =========================================================================

  /**
   * Digest a sequence with the chosen enzymes and report fragment sizes.
   *
   * @param {string} seq
   * @param {string[]} enzymeNames names from SeqLib.RESTRICTION_ENZYMES
   * @param {boolean} circular treat the molecule as circular
   * @returns {{cuts: Array, fragments: Array, enzymes: string[]}}
   */
  function digest(seq, enzymeNames, circular = false) {
    const s = seq.toUpperCase().replace(/[^ACGT]/g, '');
    const cuts = [];

    for (const name of enzymeNames) {
      const pattern = SeqLib.RESTRICTION_ENZYMES[name];
      if (!pattern) continue;
      const site = pattern.replace('^', '');
      const offset = pattern.indexOf('^');       // cut position within the site

      let idx = s.indexOf(site);
      while (idx !== -1) {
        cuts.push({ enzyme: name, position: idx + offset, site: idx + 1 });
        idx = s.indexOf(site, idx + 1);
      }
    }

    cuts.sort((a, b) => a.position - b.position);

    const fragments = [];
    if (!cuts.length) {
      fragments.push({
        start: 1, end: s.length, size: s.length,
        from: circular ? 'circular, uncut' : 'start', to: 'end'
      });
    } else if (circular) {
      for (let i = 0; i < cuts.length; i++) {
        const from = cuts[i];
        const to = cuts[(i + 1) % cuts.length];
        const size = i === cuts.length - 1
          ? (s.length - from.position) + to.position
          : to.position - from.position;
        fragments.push({
          start: from.position + 1,
          end: to.position,
          size,
          from: from.enzyme,
          to: to.enzyme
        });
      }
    } else {
      let prev = 0, prevName = 'start';
      for (const cut of cuts) {
        fragments.push({
          start: prev + 1, end: cut.position, size: cut.position - prev,
          from: prevName, to: cut.enzyme
        });
        prev = cut.position;
        prevName = cut.enzyme;
      }
      fragments.push({
        start: prev + 1, end: s.length, size: s.length - prev,
        from: prevName, to: 'end'
      });
    }

    return {
      enzymes: enzymeNames,
      cuts,
      fragments: fragments.filter(f => f.size > 0),
      // Sorted descending, as fragments would appear on a gel
      gelOrder: fragments.filter(f => f.size > 0).map(f => f.size).sort((a, b) => b - a)
    };
  }

  // =========================================================================

  return {
    PRIMER_DEFAULTS,
    SSR_MIN_REPEATS,
    primerTm,
    longestHomopolymer,
    selfComplementarity,
    hasGcClamp,
    evaluatePrimer,
    designPrimers,
    blosum62,
    pairwiseAlign,
    formatAlignment,
    canonicalMotif,
    findSSRs,
    digest
  };
});

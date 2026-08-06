/**
 * seqlib.js — Sequence analysis engine for GeneCharacterize
 *
 * Pure functions with no DOM dependencies, so they can be unit tested in Node
 * and reused in the browser. All analysis runs client-side; no sequence data
 * ever leaves the user's machine.
 *
 * References:
 *   Kyte & Doolittle (1982) J Mol Biol 157:105-132  — hydropathy scale
 *   Pace et al. (1995) Protein Sci 4:2411-2423      — extinction coefficients
 *   Wallace et al. (1979) NAR 6:3543                — Tm (short oligos)
 *   Howley et al. (1979) JBC 254:4876               — Tm (long sequences)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard genetic code (NCBI translation table 1). */
const CODON_TABLE = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
};

/** Average residue masses (Da), i.e. amino acid mass minus one water. */
const AA_MASS = {
  A: 71.0788, R: 156.1875, N: 114.1038, D: 115.0886, C: 103.1388,
  E: 129.1155, Q: 128.1307, G: 57.0519, H: 137.1411, I: 113.1594,
  L: 113.1594, K: 128.1741, M: 131.1926, F: 147.1766, P: 97.1167,
  S: 87.0782, T: 101.1051, W: 186.2132, Y: 163.1760, V: 99.1326
};

const WATER_MASS = 18.01528;

/** Kyte-Doolittle hydropathy index. */
const KD_HYDROPATHY = {
  A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5, Q: -3.5, E: -3.5, G: -0.4,
  H: -3.2, I: 4.5, L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6, S: -0.8,
  T: -0.7, W: -0.9, Y: -1.3, V: 4.2
};

/**
 * pKa sets for isoelectric point estimation.
 *
 * There is no single correct set — published pI values depend on which one the
 * authors' software used, and different tools disagree by up to ~0.5 pH units
 * on the same sequence. Validation against three published papers showed:
 *
 *   - ExPASy ProtParam / Compute pI-Mw  -> 'bjellqvist'
 *   - BioXM and most EMBOSS-derived tools -> 'emboss'
 *
 * Choose the set matching the tool you are comparing against, and state which
 * one you used in your methods.
 *
 * Each set gives pKa for the C-terminal carboxyl, the N-terminal amine, the
 * four acidic side chains (D, E, C, Y) and the three basic ones (H, K, R).
 */
const PKA_SETS = {
  // Bjellqvist et al. (1993/1994), derived from isoelectric focusing data.
  // This is what ExPASy ProtParam uses — the most commonly cited in papers.
  bjellqvist: {
    label: 'Bjellqvist (ExPASy ProtParam)',
    Cterm: 3.55, Nterm: 7.50,
    D: 4.05, E: 4.45, C: 9.00, Y: 10.00,
    H: 5.98, K: 10.00, R: 12.00
  },
  // EMBOSS iep defaults, also used by BioXM and several standalone tools.
  emboss: {
    label: 'EMBOSS (BioXM, EMBOSS iep)',
    Cterm: 3.60, Nterm: 8.60,
    D: 3.90, E: 4.10, C: 8.50, Y: 10.10,
    H: 6.50, K: 10.80, R: 12.50
  },
  // Classic textbook values (Lehninger, Principles of Biochemistry).
  lehninger: {
    label: 'Lehninger (textbook)',
    Cterm: 3.65, Nterm: 8.20,
    D: 3.65, E: 4.25, C: 8.18, Y: 10.07,
    H: 6.00, K: 10.53, R: 12.48
  },
  // Solomon, Organic Chemistry.
  solomon: {
    label: 'Solomon',
    Cterm: 2.40, Nterm: 9.60,
    D: 3.90, E: 4.30, C: 8.30, Y: 10.10,
    H: 6.00, K: 10.50, R: 12.50
  },
  // Thurlkill et al. (2006), measured in model peptides.
  thurlkill: {
    label: 'Thurlkill (2006)',
    Cterm: 3.67, Nterm: 8.00,
    D: 3.67, E: 4.25, C: 8.55, Y: 9.84,
    H: 6.54, K: 10.40, R: 12.00
  }
};

/** Default set. ProtParam is the most widely cited, so it is the safest default. */
const DEFAULT_PKA_SET = 'bjellqvist';

/**
 * Resolve a pKa set by name, falling back to the default.
 * @param {string|Object} set name from PKA_SETS, or a custom pKa object
 * @returns {Object}
 */
function resolvePkaSet(set) {
  if (set && typeof set === 'object') return set;
  return PKA_SETS[set] || PKA_SETS[DEFAULT_PKA_SET];
}

/** Backwards-compatible alias for the default set. */
const PKA = PKA_SETS[DEFAULT_PKA_SET];

/** Single-strand DNA nucleotide monophosphate masses (Da). */
const DNA_MASS = { A: 313.21, T: 304.20, C: 289.18, G: 329.21 };

const AA_NAMES = {
  A: 'Alanine', R: 'Arginine', N: 'Asparagine', D: 'Aspartic acid', C: 'Cysteine',
  E: 'Glutamic acid', Q: 'Glutamine', G: 'Glycine', H: 'Histidine', I: 'Isoleucine',
  L: 'Leucine', K: 'Lysine', M: 'Methionine', F: 'Phenylalanine', P: 'Proline',
  S: 'Serine', T: 'Threonine', W: 'Tryptophan', Y: 'Tyrosine', V: 'Valine'
};

/** Common restriction enzymes: name -> recognition site (cut position marked by ^). */
const RESTRICTION_ENZYMES = {
  EcoRI: 'G^AATTC', BamHI: 'G^GATCC', HindIII: 'A^AGCTT', NotI: 'GC^GGCCGC',
  XhoI: 'C^TCGAG', SalI: 'G^TCGAC', PstI: 'CTGCA^G', SmaI: 'CCC^GGG',
  KpnI: 'GGTAC^C', SacI: 'GAGCT^C', XbaI: 'T^CTAGA', SpeI: 'A^CTAGT',
  NcoI: 'C^CATGG', NdeI: 'CA^TATG', EcoRV: 'GAT^ATC', HaeIII: 'GG^CC'
};

// ---------------------------------------------------------------------------
// FASTA parsing
// ---------------------------------------------------------------------------

/**
 * Parse FASTA-formatted text into records. Text without any '>' header is
 * treated as a single unnamed sequence, which is what users usually paste.
 *
 * @param {string} text
 * @returns {Array<{id: string, description: string, sequence: string}>}
 */
function parseFasta(text) {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const records = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('>')) {
      if (current) records.push(current);
      const header = trimmed.slice(1).trim();
      const spaceIdx = header.search(/\s/);
      current = {
        id: spaceIdx === -1 ? header : header.slice(0, spaceIdx),
        description: spaceIdx === -1 ? '' : header.slice(spaceIdx + 1).trim(),
        sequence: ''
      };
    } else {
      if (!current) {
        current = { id: 'unnamed_sequence', description: '', sequence: '' };
      }
      // Strip whitespace, digits (from numbered alignments) and gap characters
      current.sequence += trimmed.replace(/[\s\d\-.*]/g, '').toUpperCase();
    }
  }
  if (current) records.push(current);

  return records.filter(r => r.sequence.length > 0);
}

/**
 * Guess whether a sequence is DNA, RNA or protein.
 * Uses the fraction of characters that are nucleotides — a sequence that is
 * >=85% ACGTUN is almost certainly nucleic acid.
 *
 * @param {string} seq
 * @returns {'dna'|'rna'|'protein'|'unknown'}
 */
function detectSequenceType(seq) {
  if (!seq) return 'unknown';
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s.length) return 'unknown';

  const nucleotideCount = (s.match(/[ACGTUN]/g) || []).length;
  const fraction = nucleotideCount / s.length;

  if (fraction >= 0.85) {
    const hasU = s.includes('U');
    const hasT = s.includes('T');
    if (hasU && !hasT) return 'rna';
    return 'dna';
  }
  // Residues that only occur in proteins
  if (/[EFILPQZ]/.test(s)) return 'protein';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Nucleotide analysis
// ---------------------------------------------------------------------------

/**
 * Count occurrences of each character in a sequence.
 * @param {string} seq
 * @returns {Object<string, number>}
 */
function composition(seq) {
  const counts = {};
  for (const ch of seq.toUpperCase()) {
    if (/[A-Z*]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1;
  }
  return counts;
}

/**
 * GC content as a percentage. Ambiguous bases (N) are excluded from the
 * denominator, which is the convention most tools follow.
 *
 * @param {string} seq
 * @returns {number} percentage 0-100
 */
function gcContent(seq) {
  const s = seq.toUpperCase();
  const gc = (s.match(/[GC]/g) || []).length;
  const valid = (s.match(/[ACGTU]/g) || []).length;
  return valid === 0 ? 0 : (gc / valid) * 100;
}

/**
 * GC skew = (G - C) / (G + C). Useful for locating replication origins.
 * @param {string} seq
 * @returns {number} value between -1 and 1
 */
function gcSkew(seq) {
  const s = seq.toUpperCase();
  const g = (s.match(/G/g) || []).length;
  const c = (s.match(/C/g) || []).length;
  return (g + c) === 0 ? 0 : (g - c) / (g + c);
}

/**
 * Sliding-window GC content, for plotting local GC variation.
 * @param {string} seq
 * @param {number} windowSize
 * @param {number} step
 * @returns {Array<{position: number, gc: number}>}
 */
function gcWindows(seq, windowSize = 100, step = 10) {
  const s = seq.toUpperCase();
  const out = [];
  if (s.length < windowSize) {
    return [{ position: Math.ceil(s.length / 2), gc: gcContent(s) }];
  }
  for (let i = 0; i + windowSize <= s.length; i += step) {
    out.push({
      position: i + Math.floor(windowSize / 2),
      gc: gcContent(s.slice(i, i + windowSize))
    });
  }
  return out;
}

/**
 * Reverse complement of a DNA/RNA sequence. Handles IUPAC ambiguity codes.
 * @param {string} seq
 * @returns {string}
 */
function reverseComplement(seq) {
  const map = {
    A: 'T', T: 'A', G: 'C', C: 'G', U: 'A', N: 'N',
    R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
    B: 'V', V: 'B', D: 'H', H: 'D'
  };
  return seq.toUpperCase().split('').reverse()
    .map(ch => map[ch] || 'N').join('');
}

/**
 * Molecular weight of single-stranded DNA (Da).
 * Formula: sum of nucleotide monophosphate masses - 61.96 (accounts for the
 * removal of a phosphate and addition of a hydroxyl on the 5' end).
 *
 * @param {string} seq
 * @returns {number}
 */
function dnaMolecularWeight(seq) {
  const s = seq.toUpperCase();
  let mass = 0;
  let n = 0;
  for (const ch of s) {
    if (DNA_MASS[ch] !== undefined) { mass += DNA_MASS[ch]; n++; }
    else if (ch === 'U') { mass += 306.17; n++; }
  }
  return n === 0 ? 0 : mass - 61.96;
}

/**
 * Melting temperature (Tm) in degrees Celsius.
 * Sequences under 14 nt use the Wallace rule; longer sequences use the
 * salt-adjusted GC formula. Both are approximations — for primer design,
 * nearest-neighbour thermodynamics is more accurate.
 *
 * @param {string} seq
 * @returns {number}
 */
function meltingTemp(seq) {
  const s = seq.toUpperCase().replace(/[^ACGTU]/g, '');
  const n = s.length;
  if (n === 0) return 0;

  const gc = (s.match(/[GC]/g) || []).length;
  const at = n - gc;

  if (n < 14) return 2 * at + 4 * gc;            // Wallace rule
  return 64.9 + 41 * (gc - 16.4) / n;            // salt-adjusted
}

/**
 * Translate a nucleotide sequence to protein in a given reading frame.
 * @param {string} seq
 * @param {number} frame 0, 1 or 2
 * @returns {string} protein sequence, '*' marks stop codons, 'X' unknown
 */
function translate(seq, frame = 0) {
  const s = seq.toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
  let protein = '';
  for (let i = frame; i + 3 <= s.length; i += 3) {
    const codon = s.slice(i, i + 3);
    protein += CODON_TABLE[codon] !== undefined ? CODON_TABLE[codon] : 'X';
  }
  return protein;
}

/**
 * Find open reading frames across all six frames.
 * An ORF here is ATG ... in-frame stop codon, at or above minLength (in amino
 * acids, excluding the stop).
 *
 * @param {string} seq
 * @param {number} minLength minimum protein length in residues
 * @returns {Array<Object>} sorted longest-first
 */
function findORFs(seq, minLength = 30) {
  const forward = seq.toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
  const reverse = reverseComplement(forward);
  const orfs = [];

  const scan = (s, strand) => {
    for (let frame = 0; frame < 3; frame++) {
      let startIdx = -1;
      for (let i = frame; i + 3 <= s.length; i += 3) {
        const codon = s.slice(i, i + 3);
        if (codon === 'ATG' && startIdx === -1) {
          startIdx = i;
        } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && startIdx !== -1) {
          const nt = s.slice(startIdx, i + 3);
          const protein = translate(nt).replace(/\*$/, '');
          if (protein.length >= minLength) {
            orfs.push({
              strand,
              frame: strand === '+' ? frame + 1 : -(frame + 1),
              // Report coordinates on the original forward sequence, 1-based
              start: strand === '+' ? startIdx + 1 : s.length - (i + 3) + 1,
              end: strand === '+' ? i + 3 : s.length - startIdx,
              ntLength: nt.length,
              aaLength: protein.length,
              protein,
              nucleotide: nt
            });
          }
          startIdx = -1;
        }
      }
    }
  };

  scan(forward, '+');
  scan(reverse, '-');

  return orfs.sort((a, b) => b.aaLength - a.aaLength);
}

/**
 * Codon usage counts and frequencies for a coding sequence.
 * @param {string} seq
 * @returns {Array<{codon: string, aa: string, count: number, fraction: number}>}
 */
function codonUsage(seq) {
  const s = seq.toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
  const counts = {};
  let total = 0;
  for (let i = 0; i + 3 <= s.length; i += 3) {
    const codon = s.slice(i, i + 3);
    if (CODON_TABLE[codon]) { counts[codon] = (counts[codon] || 0) + 1; total++; }
  }
  return Object.entries(counts)
    .map(([codon, count]) => ({
      codon,
      aa: CODON_TABLE[codon],
      count,
      fraction: total ? count / total : 0
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Locate restriction enzyme recognition sites.
 * @param {string} seq
 * @returns {Array<{enzyme: string, site: string, positions: number[], count: number}>}
 */
function findRestrictionSites(seq) {
  const s = seq.toUpperCase().replace(/[^ACGT]/g, '');
  const results = [];

  for (const [enzyme, pattern] of Object.entries(RESTRICTION_ENZYMES)) {
    const site = pattern.replace('^', '');
    const positions = [];
    let idx = s.indexOf(site);
    while (idx !== -1) {
      positions.push(idx + 1);              // 1-based
      idx = s.indexOf(site, idx + 1);
    }
    if (positions.length > 0) {
      results.push({ enzyme, site: pattern, positions, count: positions.length });
    }
  }
  return results.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Protein analysis
// ---------------------------------------------------------------------------

/**
 * Average molecular weight of a protein (Da).
 * @param {string} seq
 * @returns {number}
 */
function proteinMolecularWeight(seq) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  let mass = 0;
  let n = 0;
  for (const ch of s) {
    if (AA_MASS[ch] !== undefined) { mass += AA_MASS[ch]; n++; }
  }
  return n === 0 ? 0 : mass + WATER_MASS;
}

/**
 * Net charge of a protein at a given pH, using Henderson-Hasselbalch.
 * @param {string} seq
 * @param {number} pH
 * @param {string|Object} [pkaSet] name from PKA_SETS, or a custom pKa object
 * @returns {number}
 */
function netCharge(seq, pH, pkaSet) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s.length) return 0;
  const pka = resolvePkaSet(pkaSet);
  const counts = composition(s);

  // Positively charged groups: protonated form carries the charge
  let positive = 1 / (1 + Math.pow(10, pH - pka.Nterm));
  for (const aa of ['K', 'R', 'H']) {
    positive += (counts[aa] || 0) / (1 + Math.pow(10, pH - pka[aa]));
  }

  // Negatively charged groups: deprotonated form carries the charge
  let negative = 1 / (1 + Math.pow(10, pka.Cterm - pH));
  for (const aa of ['D', 'E', 'C', 'Y']) {
    negative += (counts[aa] || 0) / (1 + Math.pow(10, pka[aa] - pH));
  }

  return positive - negative;
}

/**
 * Isoelectric point, found by bisection on the net-charge curve.
 *
 * Net charge decreases monotonically with pH, so the crossing point is unique
 * and bisection is guaranteed to converge.
 *
 * @param {string} seq
 * @param {string|Object} [pkaSet] name from PKA_SETS, or a custom pKa object
 * @returns {number} pI, rounded to 2 decimals
 */
function isoelectricPoint(seq, pkaSet) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s.length) return 0;
  const pka = resolvePkaSet(pkaSet);

  let low = 0, high = 14;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const charge = netCharge(s, mid, pka);
    if (Math.abs(charge) < 1e-7) return Math.round(mid * 100) / 100;
    if (charge > 0) low = mid; else high = mid;
  }
  return Math.round(((low + high) / 2) * 100) / 100;
}

/**
 * Compute the pI under every available pKa set.
 *
 * Useful when reproducing a published value: find the set the original authors'
 * software used, rather than assuming your number is wrong.
 *
 * @param {string} seq
 * @returns {Array<{set: string, label: string, pI: number}>}
 */
function isoelectricPointAllSets(seq) {
  return Object.entries(PKA_SETS).map(([key, pka]) => ({
    set: key,
    label: pka.label,
    pI: isoelectricPoint(seq, pka)
  }));
}

/**
 * GRAVY (Grand Average of Hydropathy) — mean Kyte-Doolittle value.
 * Positive values suggest a hydrophobic, likely membrane-associated protein.
 *
 * @param {string} seq
 * @returns {number}
 */
function gravy(seq) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  let sum = 0, n = 0;
  for (const ch of s) {
    if (KD_HYDROPATHY[ch] !== undefined) { sum += KD_HYDROPATHY[ch]; n++; }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * Sliding-window hydropathy profile for plotting.
 * @param {string} seq
 * @param {number} windowSize
 * @returns {Array<{position: number, score: number}>}
 */
function hydropathyProfile(seq, windowSize = 9) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  const out = [];
  if (s.length < windowSize) return out;

  for (let i = 0; i + windowSize <= s.length; i++) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) {
      sum += KD_HYDROPATHY[s[j]] !== undefined ? KD_HYDROPATHY[s[j]] : 0;
    }
    out.push({
      position: i + Math.floor(windowSize / 2) + 1,
      score: sum / windowSize
    });
  }
  return out;
}

/**
 * Molar extinction coefficient at 280 nm (M^-1 cm^-1), Pace et al. 1995.
 * Returns both the reduced-cysteine and cystine-containing estimates.
 *
 * @param {string} seq
 * @returns {{reduced: number, cystines: number, a280Reduced: number}}
 */
function extinctionCoefficient(seq) {
  const counts = composition(seq);
  const W = counts.W || 0, Y = counts.Y || 0, C = counts.C || 0;
  const reduced = 5500 * W + 1490 * Y;
  const cystines = reduced + 125 * Math.floor(C / 2);
  const mw = proteinMolecularWeight(seq);
  return {
    reduced,
    cystines,
    a280Reduced: mw ? reduced / mw : 0   // absorbance of a 1 g/L solution
  };
}

/**
 * Aromaticity — the combined frequency of F, W and Y.
 * @param {string} seq
 * @returns {number} fraction 0-1
 */
function aromaticity(seq) {
  const s = seq.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s.length) return 0;
  const arom = (s.match(/[FWY]/g) || []).length;
  return arom / s.length;
}

// ---------------------------------------------------------------------------
// Top-level analysis
// ---------------------------------------------------------------------------

/**
 * Run the full analysis appropriate to the sequence type.
 * @param {{id: string, description: string, sequence: string}} record
 * @returns {Object} analysis result
 */
function analyzeRecord(record) {
  const seq = record.sequence;
  const type = detectSequenceType(seq);

  const base = {
    id: record.id,
    description: record.description,
    type,
    length: seq.length,
    composition: composition(seq),
    sequence: seq
  };

  if (type === 'dna' || type === 'rna') {
    const orfs = findORFs(seq, 30);
    return {
      ...base,
      gcContent: gcContent(seq),
      gcSkew: gcSkew(seq),
      atContent: 100 - gcContent(seq),
      molecularWeight: dnaMolecularWeight(seq),
      meltingTemp: meltingTemp(seq),
      reverseComplement: reverseComplement(seq),
      gcWindows: gcWindows(seq, Math.min(100, Math.max(10, Math.floor(seq.length / 20))), Math.max(1, Math.floor(seq.length / 200))),
      orfs: orfs.slice(0, 10),
      orfCount: orfs.length,
      longestOrf: orfs[0] || null,
      restrictionSites: findRestrictionSites(seq),
      codonUsage: codonUsage(seq).slice(0, 20),
      frames: [0, 1, 2].map(f => ({ frame: f + 1, protein: translate(seq, f) }))
    };
  }

  if (type === 'protein') {
    const ec = extinctionCoefficient(seq);
    return {
      ...base,
      molecularWeight: proteinMolecularWeight(seq),
      isoelectricPoint: isoelectricPoint(seq),
      isoelectricPointBySet: isoelectricPointAllSets(seq),
      gravy: gravy(seq),
      aromaticity: aromaticity(seq),
      chargeAtPh7: netCharge(seq, 7.0),
      extinctionCoefficient: ec,
      hydropathyProfile: hydropathyProfile(seq, 9),
      negativeResidues: (seq.match(/[DE]/g) || []).length,
      positiveResidues: (seq.match(/[KR]/g) || []).length
    };
  }

  return base;
}

/**
 * Analyze every record in a FASTA string.
 * @param {string} fastaText
 * @returns {Array<Object>}
 */
function analyzeFasta(fastaText) {
  return parseFasta(fastaText).map(analyzeRecord);
}

/**
 * Flatten analysis results into CSV for export.
 * @param {Array<Object>} results
 * @returns {string}
 */
function resultsToCsv(results) {
  const headers = [
    'id', 'description', 'type', 'length', 'gc_content_pct', 'gc_skew',
    'molecular_weight_da', 'melting_temp_c', 'orf_count', 'longest_orf_aa',
    'isoelectric_point', 'gravy', 'aromaticity', 'charge_at_ph7'
  ];

  const escape = v => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const round = (v, d = 3) =>
    typeof v === 'number' ? Number(v.toFixed(d)) : '';

  const rows = results.map(r => [
    r.id, r.description, r.type, r.length,
    round(r.gcContent, 2), round(r.gcSkew, 4),
    round(r.molecularWeight, 2), round(r.meltingTemp, 2),
    r.orfCount ?? '', r.longestOrf ? r.longestOrf.aaLength : '',
    round(r.isoelectricPoint, 2), round(r.gravy, 3),
    round(r.aromaticity, 4), round(r.chargeAtPh7, 2)
  ].map(escape).join(','));

  return [headers.join(','), ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Exports — works in both Node (CommonJS) and the browser
// ---------------------------------------------------------------------------

const SeqLib = {
  CODON_TABLE, AA_MASS, KD_HYDROPATHY, PKA, PKA_SETS, DEFAULT_PKA_SET,
  AA_NAMES, RESTRICTION_ENZYMES, resolvePkaSet,
  parseFasta, detectSequenceType, composition,
  gcContent, gcSkew, gcWindows, reverseComplement, dnaMolecularWeight,
  meltingTemp, translate, findORFs, codonUsage, findRestrictionSites,
  proteinMolecularWeight, netCharge, isoelectricPoint, isoelectricPointAllSets, gravy,
  hydropathyProfile, extinctionCoefficient, aromaticity,
  analyzeRecord, analyzeFasta, resultsToCsv
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SeqLib;
}
if (typeof window !== 'undefined') {
  window.SeqLib = SeqLib;
}

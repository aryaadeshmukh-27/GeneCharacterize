/**
 * Unit tests for seqlib.js
 * Run with:  node --test tests/
 *
 * Where possible, expected values are either hand-calculable or published
 * reference figures (e.g. glycine = 75.07 Da) rather than values copied from
 * the implementation itself.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const S = require('../js/seqlib.js');

/** Assert two floats are equal within a tolerance. */
function closeTo(actual, expected, tolerance = 0.01, message = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} expected ${expected} +/- ${tolerance}, got ${actual}`
  );
}

// ---------------------------------------------------------------------------

describe('parseFasta', () => {
  test('parses a single record with id and description', () => {
    const records = S.parseFasta('>gene1 hypothetical protein\nATGCATGC');
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].id, 'gene1');
    assert.strictEqual(records[0].description, 'hypothetical protein');
    assert.strictEqual(records[0].sequence, 'ATGCATGC');
  });

  test('parses multiple records', () => {
    const records = S.parseFasta('>a\nATGC\n>b\nGGCC\n>c\nTTTT');
    assert.strictEqual(records.length, 3);
    assert.deepStrictEqual(records.map(r => r.id), ['a', 'b', 'c']);
  });

  test('joins sequence across wrapped lines', () => {
    const records = S.parseFasta('>a\nATGC\nATGC\nATGC');
    assert.strictEqual(records[0].sequence, 'ATGCATGCATGC');
  });

  test('accepts raw sequence with no header', () => {
    const records = S.parseFasta('ATGCATGC');
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].id, 'unnamed_sequence');
    assert.strictEqual(records[0].sequence, 'ATGCATGC');
  });

  test('strips gaps, digits and whitespace', () => {
    const records = S.parseFasta('>a\nATG-CAT 10 GC.');
    assert.strictEqual(records[0].sequence, 'ATGCATGC');
  });

  test('returns empty array for empty input', () => {
    assert.deepStrictEqual(S.parseFasta(''), []);
    assert.deepStrictEqual(S.parseFasta('   \n  '), []);
  });

  test('drops header-only records with no sequence', () => {
    const records = S.parseFasta('>empty\n>real\nATGC');
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].id, 'real');
  });
});

// ---------------------------------------------------------------------------

describe('detectSequenceType', () => {
  test('identifies DNA', () => {
    assert.strictEqual(S.detectSequenceType('ATGCATGCATGCATGC'), 'dna');
  });

  test('identifies RNA by presence of U and absence of T', () => {
    assert.strictEqual(S.detectSequenceType('AUGCAUGCAUGCAUGC'), 'rna');
  });

  test('identifies protein', () => {
    // Contains E, Q, L, P — residues with no nucleotide meaning
    assert.strictEqual(S.detectSequenceType('MEQLPKRSTVWY'), 'protein');
  });

  test('handles empty input', () => {
    assert.strictEqual(S.detectSequenceType(''), 'unknown');
  });

  test('tolerates a few ambiguous bases in DNA', () => {
    assert.strictEqual(S.detectSequenceType('ATGCATGCATGCATGCNNAT'), 'dna');
  });
});

// ---------------------------------------------------------------------------

describe('gcContent', () => {
  test('all GC is 100 percent', () => closeTo(S.gcContent('GGCC'), 100));
  test('no GC is 0 percent', () => closeTo(S.gcContent('ATAT'), 0));
  test('half GC is 50 percent', () => closeTo(S.gcContent('GCAT'), 50));
  test('is case insensitive', () => closeTo(S.gcContent('gcat'), 50));
  test('excludes N from the denominator', () => {
    // 2 GC out of 4 real bases = 50%, the two Ns are ignored
    closeTo(S.gcContent('GCATNN'), 50);
  });
  test('empty sequence returns 0', () => assert.strictEqual(S.gcContent(''), 0));
});

describe('gcSkew', () => {
  test('computes (G-C)/(G+C)', () => closeTo(S.gcSkew('GGGCC'), 0.2));
  test('is 0 when G and C are balanced', () => closeTo(S.gcSkew('GCGC'), 0));
  test('is -1 with only C', () => closeTo(S.gcSkew('CCCC'), -1));
  test('returns 0 with no G or C', () => assert.strictEqual(S.gcSkew('ATAT'), 0));
});

describe('gcWindows', () => {
  test('returns one point when sequence is shorter than the window', () => {
    const w = S.gcWindows('GGCC', 100, 10);
    assert.strictEqual(w.length, 1);
    closeTo(w[0].gc, 100);
  });

  test('slides across a longer sequence', () => {
    const seq = 'GC'.repeat(100);            // 200 bp, uniformly 100% GC
    const w = S.gcWindows(seq, 50, 25);
    assert.ok(w.length > 1);
    w.forEach(p => closeTo(p.gc, 100));
  });
});

// ---------------------------------------------------------------------------

describe('reverseComplement', () => {
  test('reverses and complements', () => {
    assert.strictEqual(S.reverseComplement('ATGC'), 'GCAT');
  });
  test('is its own inverse', () => {
    const seq = 'ATGCATTAGCCGTA';
    assert.strictEqual(S.reverseComplement(S.reverseComplement(seq)), seq);
  });
  test('handles a palindromic restriction site', () => {
    assert.strictEqual(S.reverseComplement('GAATTC'), 'GAATTC');
  });
  test('maps unknown characters to N', () => {
    assert.strictEqual(S.reverseComplement('ATZC'), 'GNAT');
  });
});

// ---------------------------------------------------------------------------

describe('meltingTemp', () => {
  test('uses the Wallace rule below 14 nt', () => {
    // ATGC: 2 AT + 2 GC -> 2(2) + 4(2) = 12
    closeTo(S.meltingTemp('ATGC'), 12);
  });

  test('Wallace rule on a 12-mer', () => {
    // 6 AT + 6 GC -> 2(6) + 4(6) = 36
    closeTo(S.meltingTemp('ATATATGCGCGC'), 36);
  });

  test('switches to the GC formula at 14 nt and above', () => {
    const seq = 'ATGCATGCATGCAT';                    // 14 nt, 6 GC
    const expected = 64.9 + 41 * (6 - 16.4) / 14;
    closeTo(S.meltingTemp(seq), expected, 0.001);
  });

  test('empty sequence returns 0', () => assert.strictEqual(S.meltingTemp(''), 0));
});

describe('dnaMolecularWeight', () => {
  test('single adenine nucleotide', () => {
    closeTo(S.dnaMolecularWeight('A'), 313.21 - 61.96);
  });
  test('scales with length', () => {
    const one = S.dnaMolecularWeight('ATGC');
    const two = S.dnaMolecularWeight('ATGCATGC');
    closeTo(two - one, one + 61.96, 0.01);
  });
  test('empty sequence returns 0', () => {
    assert.strictEqual(S.dnaMolecularWeight(''), 0);
  });
});

// ---------------------------------------------------------------------------

describe('translate', () => {
  test('translates start, one residue, and stop', () => {
    assert.strictEqual(S.translate('ATGGCCTAA'), 'MA*');
  });

  test('respects the reading frame', () => {
    assert.strictEqual(S.translate('AATGGCCTAA', 1), 'MA*');
  });

  test('ignores a trailing partial codon', () => {
    assert.strictEqual(S.translate('ATGGCCTA'), 'MA');
  });

  test('treats U as T so RNA works', () => {
    assert.strictEqual(S.translate('AUGGCCUAA'), 'MA*');
  });

  test('all three stop codons map to *', () => {
    assert.strictEqual(S.translate('TAATAGTGA'), '***');
  });

  test('codon table covers all 64 codons', () => {
    assert.strictEqual(Object.keys(S.CODON_TABLE).length, 64);
  });

  test('codon table has exactly 3 stop codons', () => {
    const stops = Object.values(S.CODON_TABLE).filter(a => a === '*');
    assert.strictEqual(stops.length, 3);
  });
});

// ---------------------------------------------------------------------------

describe('findORFs', () => {
  // ATG + 35 alanine codons + TAA = 36 aa protein (M followed by 35 A)
  const orfSeq = 'ATG' + 'GCC'.repeat(35) + 'TAA';

  test('finds a forward-strand ORF', () => {
    const orfs = S.findORFs(orfSeq, 30);
    assert.ok(orfs.length >= 1);
    const top = orfs[0];
    assert.strictEqual(top.aaLength, 36);
    assert.strictEqual(top.protein, 'M' + 'A'.repeat(35));
    assert.strictEqual(top.strand, '+');
    assert.strictEqual(top.start, 1);
  });

  test('respects the minimum length filter', () => {
    assert.strictEqual(S.findORFs(orfSeq, 100).length, 0);
  });

  test('finds ORFs on the reverse strand', () => {
    const revSeq = S.reverseComplement(orfSeq);
    const orfs = S.findORFs(revSeq, 30);
    const minus = orfs.filter(o => o.strand === '-');
    assert.ok(minus.length >= 1, 'expected at least one reverse-strand ORF');
    assert.strictEqual(minus[0].aaLength, 36);
  });

  test('reverse-strand coordinates stay within the sequence', () => {
    const orfs = S.findORFs(orfSeq + S.reverseComplement(orfSeq), 30);
    const len = (orfSeq + S.reverseComplement(orfSeq)).length;
    orfs.forEach(o => {
      assert.ok(o.start >= 1 && o.end <= len, `ORF ${o.start}-${o.end} out of range`);
      assert.ok(o.start < o.end, 'start should precede end');
    });
  });

  test('results are sorted longest first', () => {
    const orfs = S.findORFs(orfSeq + 'AAAA' + 'ATG' + 'GCC'.repeat(60) + 'TAA', 30);
    for (let i = 1; i < orfs.length; i++) {
      assert.ok(orfs[i - 1].aaLength >= orfs[i].aaLength);
    }
  });

  test('returns nothing for a sequence with no ORFs', () => {
    assert.strictEqual(S.findORFs('AAAAAAAAAAAAAAAAAAAA', 30).length, 0);
  });
});

// ---------------------------------------------------------------------------

describe('codonUsage', () => {
  test('counts codons and computes fractions', () => {
    const usage = S.codonUsage('ATGATGGCC');
    const atg = usage.find(u => u.codon === 'ATG');
    assert.strictEqual(atg.count, 2);
    closeTo(atg.fraction, 2 / 3);
    assert.strictEqual(atg.aa, 'M');
  });

  test('fractions sum to 1', () => {
    const usage = S.codonUsage('ATGGCCTTAGGGCCCAAATTT');
    const total = usage.reduce((s, u) => s + u.fraction, 0);
    closeTo(total, 1, 1e-9);
  });
});

describe('findRestrictionSites', () => {
  test('locates an EcoRI site', () => {
    const sites = S.findRestrictionSites('AAAGAATTCAAA');
    const ecori = sites.find(s => s.enzyme === 'EcoRI');
    assert.ok(ecori, 'EcoRI site not found');
    assert.deepStrictEqual(ecori.positions, [4]);   // 1-based
  });

  test('counts multiple occurrences', () => {
    const sites = S.findRestrictionSites('GAATTCTTTGAATTC');
    const ecori = sites.find(s => s.enzyme === 'EcoRI');
    assert.strictEqual(ecori.count, 2);
    assert.deepStrictEqual(ecori.positions, [1, 10]);
  });

  test('returns empty for a sequence with no sites', () => {
    assert.deepStrictEqual(S.findRestrictionSites('AAAAAAAAAA'), []);
  });
});

// ---------------------------------------------------------------------------

describe('proteinMolecularWeight', () => {
  // Published average molecular weights of free amino acids
  test('glycine is 75.07 Da', () => closeTo(S.proteinMolecularWeight('G'), 75.07, 0.01));
  test('alanine is 89.09 Da', () => closeTo(S.proteinMolecularWeight('A'), 89.09, 0.01));
  test('tryptophan is 204.23 Da', () => closeTo(S.proteinMolecularWeight('W'), 204.23, 0.01));

  test('glycylglycine is 132.12 Da', () => {
    // Two glycines joined by a peptide bond (one water lost)
    closeTo(S.proteinMolecularWeight('GG'), 132.12, 0.01);
  });

  test('each peptide bond loses one water', () => {
    const single = S.proteinMolecularWeight('A');
    const triple = S.proteinMolecularWeight('AAA');
    closeTo(triple, single * 3 - 2 * 18.01528, 0.01);
  });

  test('empty sequence returns 0', () => {
    assert.strictEqual(S.proteinMolecularWeight(''), 0);
  });
});

// ---------------------------------------------------------------------------

describe('netCharge', () => {
  test('is positive at low pH', () => {
    assert.ok(S.netCharge('ACDEFGHIKLMNPQRSTVWY', 2) > 0);
  });

  test('is negative at high pH', () => {
    assert.ok(S.netCharge('ACDEFGHIKLMNPQRSTVWY', 12) < 0);
  });

  test('decreases monotonically with pH', () => {
    const seq = 'ACDEFGHIKLMNPQRSTVWY';
    let prev = Infinity;
    for (let pH = 0; pH <= 14; pH += 0.5) {
      const q = S.netCharge(seq, pH);
      assert.ok(q < prev, `charge should decrease as pH rises (pH ${pH})`);
      prev = q;
    }
  });

  test('a poly-lysine peptide is positive at pH 7', () => {
    assert.ok(S.netCharge('KKKKK', 7) > 3);
  });

  test('a poly-glutamate peptide is negative at pH 7', () => {
    assert.ok(S.netCharge('EEEEE', 7) < -3);
  });
});

describe('isoelectricPoint', () => {
  test('acidic peptide has a low pI', () => {
    const pI = S.isoelectricPoint('DDDDEEEE');
    assert.ok(pI < 4.5, `expected pI < 4.5, got ${pI}`);
  });

  test('basic peptide has a high pI', () => {
    const pI = S.isoelectricPoint('KKKKRRRR');
    assert.ok(pI > 10, `expected pI > 10, got ${pI}`);
  });

  test('net charge at the pI is approximately zero', () => {
    const seq = 'MEQLPKRSTVWYACDEFGHIN';
    const pI = S.isoelectricPoint(seq);
    closeTo(S.netCharge(seq, pI), 0, 0.01, 'charge at pI');
  });

  test('pI falls within the valid pH range', () => {
    ['A', 'KKKKKKKK', 'DDDDDDDD', 'ACDEFGHIKLMNPQRSTVWY'].forEach(seq => {
      const pI = S.isoelectricPoint(seq);
      assert.ok(pI >= 0 && pI <= 14, `pI ${pI} out of range for ${seq}`);
    });
  });
});

// ---------------------------------------------------------------------------

describe('gravy', () => {
  test('poly-isoleucine equals the isoleucine index (4.5)', () => {
    closeTo(S.gravy('IIII'), 4.5);
  });

  test('averages a mixed hydrophobic peptide', () => {
    // (1.8 + 4.5 + 3.8 + 4.2) / 4 = 3.575
    closeTo(S.gravy('AILV'), 3.575);
  });

  test('charged residues give a negative GRAVY', () => {
    assert.ok(S.gravy('DEKR') < 0);
  });

  test('empty sequence returns 0', () => assert.strictEqual(S.gravy(''), 0));
});

describe('hydropathyProfile', () => {
  test('produces length - window + 1 points', () => {
    const profile = S.hydropathyProfile('ACDEFGHIKLMNPQ', 9);
    assert.strictEqual(profile.length, 14 - 9 + 1);
  });

  test('returns empty when shorter than the window', () => {
    assert.deepStrictEqual(S.hydropathyProfile('ACDE', 9), []);
  });

  test('uniform sequence gives a flat profile', () => {
    S.hydropathyProfile('I'.repeat(20), 9).forEach(p => closeTo(p.score, 4.5));
  });
});

describe('extinctionCoefficient', () => {
  test('tryptophan contributes 5500', () => {
    assert.strictEqual(S.extinctionCoefficient('W').reduced, 5500);
  });

  test('tyrosine contributes 1490', () => {
    assert.strictEqual(S.extinctionCoefficient('Y').reduced, 1490);
  });

  test('contributions are additive', () => {
    assert.strictEqual(S.extinctionCoefficient('WWY').reduced, 5500 * 2 + 1490);
  });

  test('cystine pairs add 125 each', () => {
    const ec = S.extinctionCoefficient('WCC');
    assert.strictEqual(ec.cystines, 5500 + 125);
  });

  test('a protein with no W, Y or C absorbs nothing at 280 nm', () => {
    assert.strictEqual(S.extinctionCoefficient('AAAGGG').reduced, 0);
  });
});

describe('aromaticity', () => {
  test('all aromatic residues gives 1', () => closeTo(S.aromaticity('FWY'), 1));
  test('no aromatic residues gives 0', () => closeTo(S.aromaticity('AAAA'), 0));
  test('computes the correct fraction', () => closeTo(S.aromaticity('FAAA'), 0.25));
});

// ---------------------------------------------------------------------------

describe('analyzeRecord', () => {
  test('returns nucleotide fields for DNA', () => {
    const r = S.analyzeRecord({ id: 'x', description: '', sequence: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG' });
    assert.strictEqual(r.type, 'dna');
    assert.ok('gcContent' in r);
    assert.ok('meltingTemp' in r);
    assert.ok('orfs' in r);
    assert.strictEqual(r.frames.length, 3);
  });

  test('returns protein fields for a protein', () => {
    const r = S.analyzeRecord({ id: 'p', description: '', sequence: 'MEQLPKRSTVWYACDEFGHIN' });
    assert.strictEqual(r.type, 'protein');
    assert.ok('isoelectricPoint' in r);
    assert.ok('gravy' in r);
    assert.ok(!('gcContent' in r));
  });

  test('length matches the input sequence', () => {
    const seq = 'ATGCATGCATGC';
    assert.strictEqual(S.analyzeRecord({ id: 'x', description: '', sequence: seq }).length, seq.length);
  });
});

describe('analyzeFasta', () => {
  test('analyzes every record', () => {
    const results = S.analyzeFasta('>a\nATGCATGCATGCATGC\n>b\nGGGGCCCCGGGGCCCC');
    assert.strictEqual(results.length, 2);
    closeTo(results[1].gcContent, 100);
  });
});

describe('resultsToCsv', () => {
  test('emits a header row plus one row per record', () => {
    const csv = S.resultsToCsv(S.analyzeFasta('>a\nATGCATGCATGCATGC\n>b\nGGGGCCCCGGGGCCCC'));
    const lines = csv.split('\n');
    assert.strictEqual(lines.length, 3);
    assert.ok(lines[0].startsWith('id,description,type,length'));
  });

  test('quotes fields containing commas', () => {
    const csv = S.resultsToCsv([{ id: 'a', description: 'one, two', type: 'dna', length: 4 }]);
    assert.ok(csv.includes('"one, two"'));
  });

  test('handles an empty result set', () => {
    const csv = S.resultsToCsv([]);
    assert.strictEqual(csv.split('\n').length, 1);
  });
});

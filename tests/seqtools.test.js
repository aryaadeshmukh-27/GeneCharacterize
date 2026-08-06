/**
 * Unit tests for seqtools.js — primers, alignment, SSRs and digestion.
 * Run with:  node --test
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const T = require('../js/seqtools.js');
const S = require('../js/seqlib.js');

function closeTo(actual, expected, tolerance = 0.01, message = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} expected ${expected} +/- ${tolerance}, got ${actual}`
  );
}

// ---------------------------------------------------------------------------

describe('primerTm', () => {
  test('returns a plausible Tm for a typical 20-mer', () => {
    const tm = T.primerTm('ATGGCTAAGCTTGAAGCTCG');
    assert.ok(tm > 40 && tm < 75, `Tm ${tm} outside a plausible range`);
  });

  test('GC-rich primers melt higher than AT-rich primers of equal length', () => {
    const gcRich = T.primerTm('GCGCGCGGCGGCGCCGGCGC');
    const atRich = T.primerTm('ATATATTAATTAATATTAAA');
    assert.ok(gcRich > atRich, `expected GC-rich (${gcRich}) > AT-rich (${atRich})`);
  });

  test('longer primers melt higher', () => {
    const short = T.primerTm('ATGGCTAAGCTTGAAG');
    const long = T.primerTm('ATGGCTAAGCTTGAAGCTCGTAAGCTT');
    assert.ok(long > short);
  });

  test('sequences under 2 bases return 0', () => {
    assert.strictEqual(T.primerTm('A'), 0);
    assert.strictEqual(T.primerTm(''), 0);
  });
});

describe('longestHomopolymer', () => {
  test('counts the longest single-base run', () => {
    assert.strictEqual(T.longestHomopolymer('ATGAAAAGC'), 4);
  });
  test('a uniform sequence returns its length', () => {
    assert.strictEqual(T.longestHomopolymer('GGGG'), 4);
  });
  test('no repeats returns 1', () => {
    assert.strictEqual(T.longestHomopolymer('ATGC'), 1);
  });
  test('empty sequence returns 0', () => {
    assert.strictEqual(T.longestHomopolymer(''), 0);
  });
});

describe('selfComplementarity', () => {
  test('a perfect palindrome is highly self-complementary', () => {
    // GAATTC is its own reverse complement
    assert.ok(T.selfComplementarity('GAATTC') >= 6);
  });
  test('a poly-A sequence has low self-complementarity', () => {
    assert.ok(T.selfComplementarity('AAAAAAAAAA') <= 1);
  });
});

describe('hasGcClamp', () => {
  test('accepts 1-3 G/C in the last five bases', () => {
    assert.strictEqual(T.hasGcClamp('AAAAAAAAAATTTGC'), true);
  });
  test('rejects an all-AT 3-prime end', () => {
    assert.strictEqual(T.hasGcClamp('GCGCGCGCGCATATA'), false);
  });
  test('rejects a GC-saturated 3-prime end', () => {
    assert.strictEqual(T.hasGcClamp('AAAAAAAAAAGCGCG'), false);
  });
});

describe('designPrimers', () => {
  // A 600 bp template with mixed composition
  const template =
    'ATGGCTTGCGAAAACCAGCAAGCTCTTGTTGAGAAGATCGTTGAGAAGATCACCGGTCTT' +
    'CACGCTGCTATCACCAAGCTTCCTTCTCTTTCTCCTTCTGCTGAAGTTGACGCTCTTTTC' +
    'ACCGAACTTGTTACCGCTTGCGTTCCTTCTTCTGGTATCGACGTTGACAAGCTTTCTGCT' +
    'GAAGCTCAAGCTATGCGTGAAGACCTTATCCGTCTTTGCTCTGAAGCTGAAGGTCACCTT' +
    'GAAGCTCACTACTCTGACATGCTTGCTGCTCACGACAACCCTCTTGACCACCTTGCTCTT' +
    'TTCCCTTACTTCAACAACTACATCCAACTTGGTAAGCTTGAATACGAACTTCTTGCTCGT' +
    'TACGTTCCTGGTATCGCTCCTACCGCTGCTTTCATCGGTTCTGGTCCTCTTCCTCTTACC' +
    'TCTATCGTTCTTGCTGCTCACCACCTTCCTAACACCACCTTCCACAACTACGACATCGAC' +
    'GCTGCTGCTAACCACCGTGCTGCTCAACTTGTTCGTTCTGACCCTAACCTTTCTGCTCGT' +
    'ATGACCTTCCACACCTCTGACGTTACCAACGTTACCGCTGACCTTGGTAACTACGACGTT';

  test('produces at least one primer pair for a normal template', () => {
    const { pairs } = T.designPrimers(template);
    assert.ok(pairs.length > 0, 'expected at least one primer pair');
  });

  test('every returned primer respects the Tm constraints', () => {
    const { pairs } = T.designPrimers(template);
    pairs.forEach(p => {
      assert.ok(p.forward.tm >= 55 && p.forward.tm <= 65, `forward Tm ${p.forward.tm}`);
      assert.ok(p.reverse.tm >= 55 && p.reverse.tm <= 65, `reverse Tm ${p.reverse.tm}`);
    });
  });

  test('every returned primer respects the GC constraints', () => {
    const { pairs } = T.designPrimers(template);
    pairs.forEach(p => {
      assert.ok(p.forward.gc >= 40 && p.forward.gc <= 60, `forward GC ${p.forward.gc}`);
      assert.ok(p.reverse.gc >= 40 && p.reverse.gc <= 60, `reverse GC ${p.reverse.gc}`);
    });
  });

  test('product sizes fall inside the requested range', () => {
    const { pairs } = T.designPrimers(template, { minProduct: 200, maxProduct: 400 });
    pairs.forEach(p => {
      assert.ok(p.productSize >= 200 && p.productSize <= 400, `product ${p.productSize}`);
    });
  });

  test('paired primers have compatible melting temperatures', () => {
    const { pairs } = T.designPrimers(template);
    pairs.forEach(p => assert.ok(p.tmDifference <= 3, `Tm difference ${p.tmDifference}`));
  });

  test('results are sorted best-first', () => {
    const { pairs } = T.designPrimers(template);
    for (let i = 1; i < pairs.length; i++) {
      assert.ok(pairs[i - 1].score <= pairs[i].score);
    }
  });

  test('the forward primer is a literal substring of the template', () => {
    const { pairs } = T.designPrimers(template);
    pairs.forEach(p => assert.ok(template.includes(p.forward.sequence),
      'forward primer should appear verbatim in the template'));
  });

  test('the reverse primer matches the reverse complement of the template', () => {
    const { pairs } = T.designPrimers(template);
    const rc = S.reverseComplement(template);
    pairs.forEach(p => assert.ok(rc.includes(p.reverse.sequence),
      'reverse primer should appear in the reverse complement'));
  });

  test('warns rather than throwing on a too-short template', () => {
    const result = T.designPrimers('ATGC');
    assert.strictEqual(result.pairs.length, 0);
    assert.ok(result.warnings.length > 0);
  });

  test('respects the maximum pair count', () => {
    const { pairs } = T.designPrimers(template, { maxPairs: 3 });
    assert.ok(pairs.length <= 3);
  });
});

// ---------------------------------------------------------------------------

describe('pairwiseAlign', () => {
  test('identical sequences align at 100% identity with no gaps', () => {
    const r = T.pairwiseAlign('ATGCATGC', 'ATGCATGC');
    closeTo(r.identityPercent, 100);
    assert.strictEqual(r.gaps, 0);
    assert.strictEqual(r.alignedA, r.alignedB);
  });

  test('detects a single substitution', () => {
    const r = T.pairwiseAlign('ATGCATGC', 'ATGGATGC');
    assert.strictEqual(r.identities, 7);
    assert.strictEqual(r.length, 8);
  });

  test('inserts a gap for a deletion', () => {
    const r = T.pairwiseAlign('ATGCATGC', 'ATGATGC');
    assert.strictEqual(r.gaps, 1);
    assert.strictEqual(r.length, 8);
    assert.ok(r.alignedB.includes('-'));
  });

  test('aligned strings are always the same length', () => {
    const r = T.pairwiseAlign('ATGCATGCTTAGCC', 'ATGGGCATGCTAGC');
    assert.strictEqual(r.alignedA.length, r.alignedB.length);
    assert.strictEqual(r.midline.length, r.alignedA.length);
  });

  test('removing gaps recovers the original sequences', () => {
    const a = 'ATGCATGCTTAGCC', b = 'ATGGGCATGCTAGC';
    const r = T.pairwiseAlign(a, b);
    assert.strictEqual(r.alignedA.replace(/-/g, ''), a);
    assert.strictEqual(r.alignedB.replace(/-/g, ''), b);
  });

  test('the midline pipe count equals the identity count', () => {
    const r = T.pairwiseAlign('ATGCATGC', 'ATGGATGC');
    assert.strictEqual((r.midline.match(/\|/g) || []).length, r.identities);
  });

  test('detects protein sequences and uses BLOSUM62', () => {
    const r = T.pairwiseAlign('MEQLPKRSTVWY', 'MEQLPKRSTVWY');
    assert.strictEqual(r.type, 'protein');
    closeTo(r.identityPercent, 100);
  });

  test('scores conservative protein substitutions as similar', () => {
    // Leucine and isoleucine score positively in BLOSUM62
    const r = T.pairwiseAlign('MEQLPKRSTVWY', 'MEQIPKRSTVWY');
    assert.ok(r.similars > r.identities, 'conservative change should count as similar');
    assert.ok(r.midline.includes(':'));
  });

  test('rejects empty input', () => {
    assert.ok(T.pairwiseAlign('', 'ATGC').error);
    assert.ok(T.pairwiseAlign('ATGC', '').error);
  });

  test('refuses sequences too large to align in the browser', () => {
    const huge = 'A'.repeat(3000);
    assert.ok(T.pairwiseAlign(huge, huge).error);
  });

  test('unrelated sequences align at low identity', () => {
    const r = T.pairwiseAlign('AAAAAAAAAAAA', 'GGGGGGGGGGGG');
    assert.ok(r.identityPercent < 20, `identity ${r.identityPercent}`);
  });
});

describe('blosum62', () => {
  test('tryptophan against itself scores 11', () => {
    assert.strictEqual(T.blosum62('W', 'W'), 11);
  });
  test('the matrix is symmetric', () => {
    'ARNDCQEGHILKMFPSTWYV'.split('').forEach(a =>
      'ARNDCQEGHILKMFPSTWYV'.split('').forEach(b =>
        assert.strictEqual(T.blosum62(a, b), T.blosum62(b, a), `${a}/${b}`)));
  });
  test('leucine and isoleucine score positively', () => {
    assert.ok(T.blosum62('L', 'I') > 0);
  });
  test('tryptophan and aspartate score negatively', () => {
    assert.ok(T.blosum62('W', 'D') < 0);
  });
});

describe('formatAlignment', () => {
  test('splits into blocks of the requested width', () => {
    const r = T.pairwiseAlign('A'.repeat(150), 'A'.repeat(150));
    const blocks = T.formatAlignment(r, 60);
    assert.strictEqual(blocks.length, 3);
    assert.strictEqual(blocks[0].a.length, 60);
    assert.strictEqual(blocks[2].a.length, 30);
  });

  test('returns empty for a failed alignment', () => {
    assert.deepStrictEqual(T.formatAlignment({ error: 'nope' }), []);
  });
});

// ---------------------------------------------------------------------------

describe('canonicalMotif', () => {
  test('rotations collapse to the same canonical form', () => {
    assert.strictEqual(T.canonicalMotif('AT'), T.canonicalMotif('TA'));
  });
  test('picks the lexicographically smallest rotation', () => {
    assert.strictEqual(T.canonicalMotif('GAT'), 'ATG');
  });
});

describe('findSSRs', () => {
  test('finds a dinucleotide repeat above threshold', () => {
    const seq = 'CCCCCC' + 'AT'.repeat(10) + 'CCCCCC';
    const ssrs = T.findSSRs(seq);
    const di = ssrs.find(s => s.motifLength === 2);
    assert.ok(di, 'expected a dinucleotide SSR');
    assert.strictEqual(di.repeats, 10);
    assert.strictEqual(di.motif, 'AT');
  });

  test('ignores repeats below the threshold', () => {
    // 3 AT repeats is under the minimum of 6
    const ssrs = T.findSSRs('CCCCCC' + 'AT'.repeat(3) + 'CCCCCC');
    assert.strictEqual(ssrs.filter(s => s.motifLength === 2).length, 0);
  });

  test('finds a trinucleotide repeat', () => {
    const ssrs = T.findSSRs('AAAAAA' + 'CTG'.repeat(8) + 'AAAAAA');
    const tri = ssrs.find(s => s.motifLength === 3);
    assert.ok(tri);
    assert.strictEqual(tri.repeats, 8);
  });

  test('reports correct 1-based coordinates', () => {
    const prefix = 'CCCCCC';
    const seq = prefix + 'AT'.repeat(10) + 'CCCCCC';
    const di = T.findSSRs(seq).find(s => s.motifLength === 2);
    assert.strictEqual(di.start, prefix.length + 1);
    assert.strictEqual(di.end, prefix.length + 20);
    assert.strictEqual(di.length, 20);
  });

  test('the reported sequence matches the coordinates', () => {
    const seq = 'CCCCCC' + 'AT'.repeat(10) + 'CCCCCC';
    T.findSSRs(seq).forEach(s => {
      assert.strictEqual(s.sequence, seq.slice(s.start - 1, s.end));
    });
  });

  test('does not report a degenerate motif such as AAA as a trimer', () => {
    const ssrs = T.findSSRs('A'.repeat(30));
    assert.ok(ssrs.every(s => s.motifLength === 1),
      'poly-A should only be reported as a mononucleotide repeat');
  });

  test('SSRs do not overlap each other', () => {
    const seq = 'AT'.repeat(10) + 'CTG'.repeat(8) + 'G'.repeat(15);
    const ssrs = T.findSSRs(seq);
    for (let i = 1; i < ssrs.length; i++) {
      assert.ok(ssrs[i].start > ssrs[i - 1].end,
        `SSR at ${ssrs[i].start} overlaps previous ending at ${ssrs[i - 1].end}`);
    }
  });

  test('results are ordered by position', () => {
    const seq = 'AT'.repeat(10) + 'GGGGG' + 'CTG'.repeat(8);
    const ssrs = T.findSSRs(seq);
    for (let i = 1; i < ssrs.length; i++) {
      assert.ok(ssrs[i].start >= ssrs[i - 1].start);
    }
  });

  test('returns empty for a sequence with no repeats', () => {
    assert.deepStrictEqual(T.findSSRs('ATGCATGCTTAGCCAGTCAGT'), []);
  });

  test('custom thresholds are respected', () => {
    const seq = 'CCCCCC' + 'AT'.repeat(3) + 'CCCCCC';
    const ssrs = T.findSSRs(seq, { 2: 3 });
    assert.ok(ssrs.some(s => s.motif === 'AT'));
  });
});

// ---------------------------------------------------------------------------

describe('digest', () => {
  test('a sequence with no sites yields one full-length fragment', () => {
    const d = T.digest('AAAAAAAAAAAAAAAAAAAA', ['EcoRI']);
    assert.strictEqual(d.cuts.length, 0);
    assert.strictEqual(d.fragments.length, 1);
    assert.strictEqual(d.fragments[0].size, 20);
  });

  test('a single site produces two fragments', () => {
    const d = T.digest('AAAAAGAATTCAAAAA', ['EcoRI']);
    assert.strictEqual(d.cuts.length, 1);
    assert.strictEqual(d.fragments.length, 2);
  });

  test('fragment sizes sum to the sequence length', () => {
    const seq = 'AAAAAGAATTCAAAAAGGATCCAAAAA';
    const d = T.digest(seq, ['EcoRI', 'BamHI']);
    const total = d.fragments.reduce((s, f) => s + f.size, 0);
    assert.strictEqual(total, seq.length);
  });

  test('cuts are ordered by position', () => {
    const d = T.digest('GGATCCAAAAAGAATTCAAAAAGGATCC', ['EcoRI', 'BamHI']);
    for (let i = 1; i < d.cuts.length; i++) {
      assert.ok(d.cuts[i].position >= d.cuts[i - 1].position);
    }
  });

  test('EcoRI cuts after the leading G', () => {
    // Site GAATTC starts at index 5 (0-based); G^AATTC cuts one base in
    const d = T.digest('AAAAAGAATTCAAAAA', ['EcoRI']);
    assert.strictEqual(d.cuts[0].position, 6);
    assert.strictEqual(d.fragments[0].size, 6);
  });

  test('circular digestion produces one fragment per cut', () => {
    const d = T.digest('AAAAAGAATTCAAAAAGGATCCAAAAA', ['EcoRI', 'BamHI'], true);
    assert.strictEqual(d.fragments.length, d.cuts.length);
  });

  test('circular fragment sizes still sum to the sequence length', () => {
    const seq = 'AAAAAGAATTCAAAAAGGATCCAAAAA';
    const d = T.digest(seq, ['EcoRI', 'BamHI'], true);
    assert.strictEqual(d.fragments.reduce((s, f) => s + f.size, 0), seq.length);
  });

  test('gel order is sorted largest first', () => {
    const d = T.digest('AAAAAGAATTCAAAAAAAAAAGGATCCAA', ['EcoRI', 'BamHI']);
    for (let i = 1; i < d.gelOrder.length; i++) {
      assert.ok(d.gelOrder[i - 1] >= d.gelOrder[i]);
    }
  });

  test('unknown enzyme names are ignored rather than throwing', () => {
    const d = T.digest('AAAAAGAATTCAAAAA', ['NotAnEnzyme', 'EcoRI']);
    assert.strictEqual(d.cuts.length, 1);
  });
});

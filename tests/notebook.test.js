/**
 * Unit tests for notebook.js and databases.js.
 * Run with:  node --test
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const N = require('../js/notebook.js');
const D = require('../js/databases.js');
const { PROTOCOL_STEPS } = require('../js/tools-data.js');

// ---------------------------------------------------------------------------

describe('createNotebook', () => {
  test('starts empty with the current schema version', () => {
    const nb = N.createNotebook();
    assert.strictEqual(nb.schemaVersion, N.SCHEMA_VERSION);
    assert.deepStrictEqual(nb.steps, {});
    assert.deepStrictEqual(nb.analyses, []);
    assert.ok(nb.project);
  });

  test('is reported as empty', () => {
    assert.strictEqual(N.isEmpty(N.createNotebook()), true);
  });
});

describe('step entries', () => {
  test('getStep returns a blank entry for an untouched step', () => {
    const step = N.getStep(N.createNotebook(), 3);
    assert.strictEqual(step.notes, '');
    assert.deepStrictEqual(step.findings, []);
  });

  test('setNotes stores text against the right step', () => {
    const nb = N.setNotes(N.createNotebook(), 2, 'Top hit E-value 1e-120');
    assert.strictEqual(N.getStep(nb, 2).notes, 'Top hit E-value 1e-120');
    assert.strictEqual(N.getStep(nb, 3).notes, '');
  });

  test('addFinding records a label and value', () => {
    const nb = N.addFinding(N.createNotebook(), 3, 'Domain', 'PLN03075');
    const findings = N.getStep(nb, 3).findings;
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].label, 'Domain');
    assert.strictEqual(findings[0].value, 'PLN03075');
    assert.ok(findings[0].id);
  });

  test('addFinding ignores an empty label', () => {
    const nb = N.addFinding(N.createNotebook(), 3, '   ', 'value');
    assert.strictEqual(N.getStep(nb, 3).findings.length, 0);
  });

  test('addFinding trims whitespace', () => {
    const nb = N.addFinding(N.createNotebook(), 1, '  Gene ID  ', '  AT1G01010  ');
    const f = N.getStep(nb, 1).findings[0];
    assert.strictEqual(f.label, 'Gene ID');
    assert.strictEqual(f.value, 'AT1G01010');
  });

  test('removeFinding deletes only the target finding', () => {
    let nb = N.createNotebook();
    nb = N.addFinding(nb, 1, 'A', '1');
    nb = N.addFinding(nb, 1, 'B', '2');
    const id = N.getStep(nb, 1).findings[0].id;
    nb = N.removeFinding(nb, 1, id);
    const remaining = N.getStep(nb, 1).findings;
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].label, 'B');
  });

  test('recordToolUse does not duplicate entries', () => {
    let nb = N.createNotebook();
    nb = N.recordToolUse(nb, 2, 'NCBI BLAST');
    nb = N.recordToolUse(nb, 2, 'NCBI BLAST');
    nb = N.recordToolUse(nb, 2, 'InterPro');
    assert.deepStrictEqual(N.getStep(nb, 2).toolsUsed, ['NCBI BLAST', 'InterPro']);
  });
});

describe('saveAnalysis', () => {
  const dnaResult = {
    id: 'gene1', description: 'test gene', type: 'dna', length: 900,
    gcContent: 48.5, gcSkew: 0.02, meltingTemp: 84.1, molecularWeight: 278000,
    orfCount: 2, longestOrf: { aaLength: 280 }
  };

  test('stores a DNA summary with the expected metrics', () => {
    const nb = N.saveAnalysis(N.createNotebook(), dnaResult);
    assert.strictEqual(nb.analyses.length, 1);
    const a = nb.analyses[0];
    assert.strictEqual(a.sequenceId, 'gene1');
    assert.strictEqual(a.type, 'dna');
    assert.ok('GC content (%)' in a.metrics);
    assert.ok('ORFs detected' in a.metrics);
  });

  test('stores a protein summary with protein-specific metrics', () => {
    const nb = N.saveAnalysis(N.createNotebook(), {
      id: 'p1', description: '', type: 'protein', length: 280,
      molecularWeight: 30000, isoelectricPoint: 5.4, gravy: 0.12,
      chargeAtPh7: -4.2, aromaticity: 0.08, extinctionCoefficient: { reduced: 33000 }
    });
    const m = nb.analyses[0].metrics;
    assert.ok('Isoelectric point' in m);
    assert.ok('GRAVY' in m);
    assert.ok(!('GC content (%)' in m));
  });

  test('removeAnalysis deletes by id', () => {
    let nb = N.saveAnalysis(N.createNotebook(), dnaResult);
    nb = N.removeAnalysis(nb, nb.analyses[0].id);
    assert.strictEqual(nb.analyses.length, 0);
  });
});

describe('stats', () => {
  test('counts notes, findings, tools and analyses', () => {
    let nb = N.createNotebook();
    nb = N.setNotes(nb, 1, 'note one');
    nb = N.setNotes(nb, 2, 'note two');
    nb = N.setNotes(nb, 3, '   ');                       // whitespace should not count
    nb = N.addFinding(nb, 1, 'A', '1');
    nb = N.addFinding(nb, 2, 'B', '2');
    nb = N.recordToolUse(nb, 1, 'BLAST');
    nb = N.recordToolUse(nb, 2, 'BLAST');                // same tool, counted once
    nb = N.recordToolUse(nb, 2, 'InterPro');

    const s = N.stats(nb, 19);
    assert.strictEqual(s.stepsWithNotes, 2);
    assert.strictEqual(s.totalFindings, 2);
    assert.strictEqual(s.toolsUsed, 2);
    assert.strictEqual(s.totalSteps, 19);
  });

  test('a notebook with content is not empty', () => {
    assert.strictEqual(N.isEmpty(N.addFinding(N.createNotebook(), 1, 'X', 'y')), false);
  });
});

describe('documentedSteps', () => {
  test('returns only steps that have content', () => {
    let nb = N.createNotebook();
    nb = N.setNotes(nb, 5, 'phylogeny built with IQ-TREE');
    nb = N.addFinding(nb, 12, 'miRNA', 'miR164');
    const docs = N.documentedSteps(nb, PROTOCOL_STEPS);
    assert.strictEqual(docs.length, 2);
    assert.deepStrictEqual(docs.map(d => d.step.step), [5, 12]);
  });

  test('returns empty for a blank notebook', () => {
    assert.deepStrictEqual(N.documentedSteps(N.createNotebook(), PROTOCOL_STEPS), []);
  });
});

// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  test('escapes the dangerous characters', () => {
    assert.strictEqual(N.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  });
  test('handles null and undefined', () => {
    assert.strictEqual(N.escapeHtml(null), '');
    assert.strictEqual(N.escapeHtml(undefined), '');
  });
});

describe('toMarkdown', () => {
  function sample() {
    let nb = N.createNotebook();
    nb.project.title = 'NAS family in Setaria';
    nb.project.gene = 'SiNAS3';
    nb.project.species = 'Setaria italica';
    nb = N.setNotes(nb, 2, 'Top BLAST hit XP_004958765.3 at 85% identity.');
    nb = N.addFinding(nb, 3, 'Conserved domain', 'PLN03075');
    nb = N.recordToolUse(nb, 3, 'NCBI CDD');
    return nb;
  }

  test('includes the project title as a heading', () => {
    assert.ok(N.toMarkdown(sample(), PROTOCOL_STEPS).startsWith('# NAS family in Setaria'));
  });

  test('includes project metadata', () => {
    const md = N.toMarkdown(sample(), PROTOCOL_STEPS);
    assert.ok(md.includes('SiNAS3'));
    assert.ok(md.includes('Setaria italica'));
  });

  test('includes step notes and findings', () => {
    const md = N.toMarkdown(sample(), PROTOCOL_STEPS);
    assert.ok(md.includes('Top BLAST hit'));
    assert.ok(md.includes('PLN03075'));
    assert.ok(md.includes('Conserved domain'));
  });

  test('records the tools used', () => {
    assert.ok(N.toMarkdown(sample(), PROTOCOL_STEPS).includes('NCBI CDD'));
  });

  test('falls back to a default title', () => {
    const md = N.toMarkdown(N.createNotebook(), PROTOCOL_STEPS);
    assert.ok(md.startsWith('# Gene Characterization Report'));
  });

  test('handles an empty notebook without throwing', () => {
    assert.ok(N.toMarkdown(N.createNotebook(), PROTOCOL_STEPS).length > 0);
  });
});

describe('toHtml', () => {
  test('produces a complete HTML document', () => {
    const html = N.toHtml(N.createNotebook(), PROTOCOL_STEPS);
    assert.ok(html.trimStart().startsWith('<!DOCTYPE html>'));
    assert.ok(html.trimEnd().endsWith('</html>'));
    assert.ok(html.includes('<style>'));
  });

  test('escapes user content rather than injecting it', () => {
    let nb = N.createNotebook();
    nb.project.title = '<script>alert(1)</script>';
    nb = N.setNotes(nb, 1, '<img src=x onerror=alert(2)>');
    const html = N.toHtml(nb, PROTOCOL_STEPS);
    assert.ok(!html.includes('<script>alert(1)</script>'), 'title was not escaped');
    assert.ok(!html.includes('<img src=x'), 'notes were not escaped');
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('renders findings into a table', () => {
    const nb = N.addFinding(N.createNotebook(), 3, 'Domain', 'PLN03075');
    const html = N.toHtml(nb, PROTOCOL_STEPS);
    assert.ok(html.includes('PLN03075'));
    assert.ok(html.includes('<table>'));
  });

  test('states clearly when nothing has been documented', () => {
    assert.ok(N.toHtml(N.createNotebook(), PROTOCOL_STEPS).includes('No protocol steps'));
  });

  test('converts newlines in notes to line breaks', () => {
    const nb = N.setNotes(N.createNotebook(), 1, 'line one\nline two');
    assert.ok(N.toHtml(nb, PROTOCOL_STEPS).includes('line one<br>line two'));
  });
});

describe('toJson / fromJson', () => {
  test('round-trips a notebook without loss', () => {
    let nb = N.createNotebook();
    nb.project.title = 'Round trip';
    nb = N.addFinding(nb, 4, 'Alignment', 'MAFFT L-INS-i');
    const { notebook, error } = N.fromJson(N.toJson(nb));
    assert.strictEqual(error, null);
    assert.strictEqual(notebook.project.title, 'Round trip');
    assert.strictEqual(N.getStep(notebook, 4).findings[0].value, 'MAFFT L-INS-i');
  });

  test('rejects malformed JSON with a message', () => {
    const { notebook, error } = N.fromJson('not json at all');
    assert.strictEqual(notebook, null);
    assert.ok(/parse/i.test(error));
  });

  test('rejects JSON that is not a notebook', () => {
    const { notebook, error } = N.fromJson('{"hello":"world"}');
    assert.strictEqual(notebook, null);
    assert.ok(error);
  });

  test('rejects an unsupported schema version', () => {
    const { error } = N.fromJson(JSON.stringify({ schemaVersion: 999, project: {}, steps: {} }));
    assert.ok(/version/i.test(error));
  });
});

describe('load (no localStorage available)', () => {
  test('falls back to a fresh notebook instead of throwing', () => {
    const nb = N.load();
    assert.ok(nb);
    assert.strictEqual(nb.schemaVersion, N.SCHEMA_VERSION);
  });

  test('save reports failure rather than throwing', () => {
    assert.strictEqual(N.save(N.createNotebook()), false);
  });
});

// ---------------------------------------------------------------------------

describe('databases registry', () => {
  test('every category has databases', () => {
    D.DATABASE_CATEGORIES.forEach(cat => {
      assert.ok(cat.databases.length > 0, `${cat.name} has no databases`);
      assert.ok(cat.id && cat.name && cat.icon);
    });
  });

  test('every database has the required fields', () => {
    D.allDatabases().forEach(db => {
      assert.ok(db.name, 'missing name');
      assert.ok(db.url, `${db.name} missing url`);
      assert.ok(db.description, `${db.name} missing description`);
      assert.ok(db.organism, `${db.name} missing organism`);
      assert.ok(db.holds, `${db.name} missing holds`);
    });
  });

  test('every URL is valid http or https', () => {
    D.allDatabases().forEach(db => {
      assert.doesNotThrow(() => new URL(db.url), `${db.name}: ${db.url}`);
      assert.ok(/^https?:/.test(db.url), `${db.name} is not http(s)`);
    });
  });

  test('category ids are unique', () => {
    const ids = D.DATABASE_CATEGORIES.map(c => c.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  test('search matches on name', () => {
    const hits = D.searchDatabases('uniprot');
    assert.ok(hits.some(db => db.name === 'UniProtKB'));
  });

  test('search matches on organism', () => {
    assert.ok(D.searchDatabases('arabidopsis').some(db => db.name === 'TAIR'));
  });

  test('an empty query returns everything', () => {
    assert.strictEqual(D.searchDatabases('').length, D.allDatabases().length);
  });

  test('a nonsense query returns nothing', () => {
    assert.strictEqual(D.searchDatabases('zzzznotathing').length, 0);
  });

  test('buildSearchUrl encodes the query', () => {
    const db = D.allDatabases().find(d => d.name === 'UniProtKB');
    const url = D.buildSearchUrl(db, 'nicotianamine synthase');
    assert.ok(url.includes('nicotianamine%20synthase'));
    assert.doesNotThrow(() => new URL(url));
  });

  test('buildSearchUrl returns null without a template or query', () => {
    const noTemplate = D.allDatabases().find(d => !d.searchTemplate);
    assert.strictEqual(D.buildSearchUrl(noTemplate, 'x'), null);
    const withTemplate = D.allDatabases().find(d => d.searchTemplate);
    assert.strictEqual(D.buildSearchUrl(withTemplate, '  '), null);
  });

  test('every search template produces a valid URL', () => {
    D.allDatabases().filter(db => db.searchTemplate).forEach(db => {
      const url = D.buildSearchUrl(db, 'test query');
      assert.doesNotThrow(() => new URL(url), `${db.name}: ${url}`);
    });
  });
});

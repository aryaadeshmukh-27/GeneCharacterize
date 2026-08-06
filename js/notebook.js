/**
 * notebook.js — Lab notebook state and report generation.
 *
 * Records what you found at each protocol step and turns the accumulated
 * record into a formatted report. Report builders are pure functions taking a
 * notebook object and returning a string, so they are unit testable.
 *
 * Everything is stored in localStorage — there is no server and no account.
 */

(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof window !== 'undefined') window.Notebook = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'genecharacterize.notebook.v1';
  const LEGACY_STORAGE_KEY = 'biocharacterize.notebook.v1';   // pre-rename; migrated on first load
  const SCHEMA_VERSION = 1;

  /** A fresh, empty notebook. */
  function createNotebook() {
    return {
      schemaVersion: SCHEMA_VERSION,
      project: {
        title: '',
        gene: '',
        family: '',
        species: '',
        accession: '',
        researcher: '',
        started: new Date().toISOString()
      },
      steps: {},              // stepNumber -> { notes, findings[], toolsUsed[], completedAt }
      analyses: [],           // saved analyzer snapshots
      updated: new Date().toISOString()
    };
  }

  // -------------------------------------------------------------- persistence

  function load() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);

      // Notebooks saved before the rename live under the old key. Adopt them once,
      // then write forward under the new key so nobody loses recorded work.
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          localStorage.setItem(STORAGE_KEY, legacy);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          raw = legacy;
        }
      }

      if (!raw) return createNotebook();
      const data = JSON.parse(raw);
      if (data.schemaVersion !== SCHEMA_VERSION) return createNotebook();
      return data;
    } catch (e) {
      return createNotebook();
    }
  }

  function save(notebook) {
    notebook.updated = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notebook));
      return true;
    } catch (e) {
      return false;   // quota exceeded or storage unavailable
    }
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    return createNotebook();
  }

  // ------------------------------------------------------------- step entries

  function getStep(notebook, stepNumber) {
    return notebook.steps[stepNumber] || { notes: '', findings: [], toolsUsed: [], completedAt: null };
  }

  function setNotes(notebook, stepNumber, notes) {
    const step = getStep(notebook, stepNumber);
    step.notes = notes;
    notebook.steps[stepNumber] = step;
    return notebook;
  }

  function addFinding(notebook, stepNumber, label, value) {
    if (!label || !label.trim()) return notebook;
    const step = getStep(notebook, stepNumber);
    step.findings.push({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      label: label.trim(),
      value: (value || '').trim(),
      recorded: new Date().toISOString()
    });
    notebook.steps[stepNumber] = step;
    return notebook;
  }

  function removeFinding(notebook, stepNumber, findingId) {
    const step = getStep(notebook, stepNumber);
    step.findings = step.findings.filter(f => f.id !== findingId);
    notebook.steps[stepNumber] = step;
    return notebook;
  }

  function recordToolUse(notebook, stepNumber, toolName) {
    const step = getStep(notebook, stepNumber);
    if (!step.toolsUsed.includes(toolName)) step.toolsUsed.push(toolName);
    notebook.steps[stepNumber] = step;
    return notebook;
  }

  /** Save a snapshot of an analyzer result into the notebook. */
  function saveAnalysis(notebook, result) {
    const summary = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      recorded: new Date().toISOString(),
      sequenceId: result.id,
      description: result.description,
      type: result.type,
      length: result.length,
      metrics: {}
    };

    if (result.type === 'protein') {
      summary.metrics = {
        'Molecular weight (kDa)': (result.molecularWeight / 1000).toFixed(2),
        'Isoelectric point': result.isoelectricPoint + ' (Bjellqvist/ProtParam pKa)',
        'GRAVY': result.gravy.toFixed(3),
        'Net charge at pH 7': result.chargeAtPh7.toFixed(2),
        'Aromaticity (%)': (result.aromaticity * 100).toFixed(1),
        'Extinction coefficient': result.extinctionCoefficient.reduced
      };
    } else if (result.type === 'dna' || result.type === 'rna') {
      summary.metrics = {
        'GC content (%)': result.gcContent.toFixed(1),
        'GC skew': result.gcSkew.toFixed(4),
        'Melting temperature (C)': result.meltingTemp.toFixed(1),
        'Molecular weight (kDa)': (result.molecularWeight / 1000).toFixed(1),
        'ORFs detected': result.orfCount,
        'Longest ORF (aa)': result.longestOrf ? result.longestOrf.aaLength : 0
      };
    }

    notebook.analyses.push(summary);
    return notebook;
  }

  function removeAnalysis(notebook, id) {
    notebook.analyses = notebook.analyses.filter(a => a.id !== id);
    return notebook;
  }

  // --------------------------------------------------------------- statistics

  function stats(notebook, totalSteps = 19) {
    const entries = Object.values(notebook.steps);
    return {
      stepsWithNotes: entries.filter(s => s.notes && s.notes.trim()).length,
      totalFindings: entries.reduce((n, s) => n + s.findings.length, 0),
      toolsUsed: new Set(entries.flatMap(s => s.toolsUsed)).size,
      savedAnalyses: notebook.analyses.length,
      totalSteps
    };
  }

  function isEmpty(notebook) {
    const s = stats(notebook);
    return s.stepsWithNotes === 0 && s.totalFindings === 0 && s.savedAnalyses === 0;
  }

  // ----------------------------------------------------------- report helpers

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /** Steps that have any recorded content, in order. */
  function documentedSteps(notebook, protocolSteps) {
    return protocolSteps
      .map(step => ({ step, entry: notebook.steps[step.step] }))
      .filter(({ entry }) =>
        entry && ((entry.notes && entry.notes.trim()) || entry.findings.length || entry.toolsUsed.length));
  }

  // -------------------------------------------------------------- Markdown

  /**
   * Render the notebook as a Markdown document.
   * @param {Object} notebook
   * @param {Array} protocolSteps the PROTOCOL_STEPS registry
   * @returns {string}
   */
  function toMarkdown(notebook, protocolSteps) {
    const p = notebook.project;
    const lines = [];

    lines.push('# ' + (p.title || 'Gene Characterization Report'));
    lines.push('');

    const meta = [
      ['Gene', p.gene], ['Gene family', p.family], ['Species', p.species],
      ['Accession', p.accession], ['Researcher', p.researcher],
      ['Started', formatDate(p.started)], ['Last updated', formatDate(notebook.updated)]
    ].filter(([, v]) => v);

    if (meta.length) {
      lines.push('| Field | Value |');
      lines.push('|---|---|');
      meta.forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
      lines.push('');
    }

    const s = stats(notebook, protocolSteps.length);
    lines.push(`**Summary:** ${s.stepsWithNotes} of ${s.totalSteps} steps documented · ` +
               `${s.totalFindings} findings recorded · ${s.savedAnalyses} analyses saved`);
    lines.push('');

    // Saved analyses
    if (notebook.analyses.length) {
      lines.push('## Sequence analyses');
      lines.push('');
      notebook.analyses.forEach(a => {
        lines.push(`### ${a.sequenceId}${a.description ? ' — ' + a.description : ''}`);
        lines.push('');
        lines.push(`Type: ${a.type.toUpperCase()} · Length: ${a.length} ${a.type === 'protein' ? 'residues' : 'bp'}`);
        lines.push('');
        lines.push('| Metric | Value |');
        lines.push('|---|---|');
        Object.entries(a.metrics).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
        lines.push('');
      });
    }

    // Protocol record
    const documented = documentedSteps(notebook, protocolSteps);
    if (documented.length) {
      lines.push('## Protocol record');
      lines.push('');
      documented.forEach(({ step, entry }) => {
        lines.push(`### Step ${step.step}. ${step.title}`);
        lines.push('');
        if (entry.findings.length) {
          entry.findings.forEach(f =>
            lines.push(`- **${f.label}:** ${f.value || '(not recorded)'}`));
          lines.push('');
        }
        if (entry.notes && entry.notes.trim()) {
          lines.push(entry.notes.trim());
          lines.push('');
        }
        if (entry.toolsUsed.length) {
          lines.push(`*Tools used: ${entry.toolsUsed.join(', ')}*`);
          lines.push('');
        }
      });
    }

    lines.push('---');
    lines.push('');
    lines.push('Generated by GeneCharacterize. Computed values are estimates from ' +
               'standard formulae; predictions from external tools are predictions, not evidence.');

    return lines.join('\n');
  }

  // ------------------------------------------------------------------ HTML

  /**
   * Render the notebook as a self-contained, printable HTML report.
   * @returns {string} a complete HTML document
   */
  function toHtml(notebook, protocolSteps) {
    const p = notebook.project;
    const s = stats(notebook, protocolSteps.length);
    const e = escapeHtml;

    const meta = [
      ['Gene', p.gene], ['Gene family', p.family], ['Species', p.species],
      ['Accession', p.accession], ['Researcher', p.researcher],
      ['Started', formatDate(p.started)], ['Report generated', formatDate(new Date().toISOString())]
    ].filter(([, v]) => v);

    const analysesHtml = notebook.analyses.map(a => `
      <section class="analysis">
        <h3>${e(a.sequenceId)}${a.description ? ' <span class="muted">— ' + e(a.description) + '</span>' : ''}</h3>
        <p class="muted">${e(a.type.toUpperCase())} · ${a.length.toLocaleString()} ${a.type === 'protein' ? 'residues' : 'bp'}</p>
        <table>
          <tbody>
            ${Object.entries(a.metrics).map(([k, v]) =>
              `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>`).join('');

    const stepsHtml = documentedSteps(notebook, protocolSteps).map(({ step, entry }) => `
      <section class="step">
        <h3><span class="step-badge">${step.step}</span> ${e(step.title)}</h3>
        ${entry.findings.length ? `
          <table>
            <tbody>
              ${entry.findings.map(f =>
                `<tr><th>${e(f.label)}</th><td>${e(f.value) || '<span class="muted">not recorded</span>'}</td></tr>`).join('')}
            </tbody>
          </table>` : ''}
        ${entry.notes && entry.notes.trim() ? `<div class="notes">${e(entry.notes).replace(/\n/g, '<br>')}</div>` : ''}
        ${entry.toolsUsed.length ? `<p class="tools">Tools used: ${entry.toolsUsed.map(e).join(', ')}</p>` : ''}
      </section>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${e(p.title || 'Gene Characterization Report')}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; color: #13251a;
         max-width: 800px; margin: 0 auto; padding: 3rem 2rem; }
  h1 { font-size: 2rem; margin-bottom: .25rem; border-bottom: 3px solid #1d8129; padding-bottom: .5rem; }
  h2 { font-size: 1.4rem; margin-top: 2.5rem; color: #0b2c15; border-bottom: 1px solid #b4d2bc; padding-bottom: .3rem; }
  h3 { font-size: 1.1rem; margin-top: 1.75rem; color: #0b2c15; }
  table { border-collapse: collapse; width: 100%; margin: .75rem 0; font-family: system-ui, sans-serif; font-size: .9rem; }
  th, td { text-align: left; padding: .45rem .7rem; border-bottom: 1px solid #d8e8dc; vertical-align: top; }
  th { width: 40%; font-weight: 600; color: #3a5544; }
  .muted { color: #5a7563; font-weight: normal; }
  .summary { background: #e8f3ea; border-left: 4px solid #1d8129; padding: .85rem 1.15rem; margin: 1.25rem 0;
             font-family: system-ui, sans-serif; font-size: .9rem; }
  .notes { background: #f4faf5; border: 1px solid #d8e8dc; border-radius: 6px; padding: .85rem 1.15rem;
           margin: .75rem 0; font-family: system-ui, sans-serif; font-size: .92rem; white-space: normal; }
  .tools { font-size: .82rem; color: #5a7563; font-style: italic; font-family: system-ui, sans-serif; }
  .step-badge { display: inline-block; background: #1d8129; color: #fff; width: 1.6rem; height: 1.6rem;
                border-radius: 50%; text-align: center; line-height: 1.6rem; font-size: .8rem;
                font-family: system-ui, sans-serif; margin-right: .4rem; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #b4d2bc;
           font-size: .8rem; color: #5a7563; font-family: system-ui, sans-serif; }
  .empty { color: #5a7563; font-style: italic; }
  @media print { body { padding: 1rem; } h2 { page-break-after: avoid; } section { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>${e(p.title || 'Gene Characterization Report')}</h1>

  ${meta.length ? `<table>${meta.map(([k, v]) =>
    `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join('')}</table>` : ''}

  <div class="summary">
    <strong>${s.stepsWithNotes}</strong> of ${s.totalSteps} protocol steps documented ·
    <strong>${s.totalFindings}</strong> findings recorded ·
    <strong>${s.savedAnalyses}</strong> sequence ${s.savedAnalyses === 1 ? 'analysis' : 'analyses'} saved ·
    <strong>${s.toolsUsed}</strong> tools used
  </div>

  ${notebook.analyses.length ? '<h2>Sequence analyses</h2>' + analysesHtml : ''}

  ${stepsHtml ? '<h2>Protocol record</h2>' + stepsHtml
              : '<h2>Protocol record</h2><p class="empty">No protocol steps have been documented yet.</p>'}

  <footer>
    Generated by GeneCharacterize on ${e(formatDate(new Date().toISOString()))}.
    Computed values are estimates from standard formulae; predictions from external tools are
    predictions, not evidence.
  </footer>
</body>
</html>`;
  }

  // ------------------------------------------------------------------ JSON

  function toJson(notebook) {
    return JSON.stringify(notebook, null, 2);
  }

  /**
   * Restore a notebook from an exported JSON string.
   * @returns {{notebook: Object|null, error: string|null}}
   */
  function fromJson(text) {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.project || !data.steps) {
        return { notebook: null, error: 'That file does not look like a GeneCharacterize notebook.' };
      }
      if (data.schemaVersion !== SCHEMA_VERSION) {
        return { notebook: null, error: `Unsupported notebook version (${data.schemaVersion}).` };
      }
      if (!Array.isArray(data.analyses)) data.analyses = [];
      return { notebook: data, error: null };
    } catch (e) {
      return { notebook: null, error: 'Could not parse that file as JSON.' };
    }
  }

  return {
    STORAGE_KEY, LEGACY_STORAGE_KEY, SCHEMA_VERSION,
    createNotebook, load, save, clear,
    getStep, setNotes, addFinding, removeFinding, recordToolUse,
    saveAnalysis, removeAnalysis,
    stats, isEmpty, documentedSteps,
    escapeHtml, formatDate,
    toMarkdown, toHtml, toJson, fromJson
  };
});

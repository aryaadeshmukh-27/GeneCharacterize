/**
 * databases.js — Genomic and proteomic database registry.
 *
 * Distinct from tools-data.js: those entries are analysis *services* that take a
 * sequence and compute something. These are *repositories* you search for
 * existing records. Each has a `searchTemplate` where the site supports a
 * documented query URL, so the app can search directly.
 *
 * Links last verified: 2026-08-02
 */

(function (root, factory) {
  const lib = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof window !== 'undefined') window.Databases = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DATABASE_CATEGORIES = [
    {
      id: 'general',
      name: 'General sequence archives',
      icon: 'fa-database',
      description: 'The primary repositories every characterization starts from.',
      databases: [
        {
          name: 'NCBI Nucleotide', organism: 'All',
          url: 'https://www.ncbi.nlm.nih.gov/nuccore/',
          searchTemplate: 'https://www.ncbi.nlm.nih.gov/nuccore/?term={query}',
          description: 'GenBank nucleotide records — the reference archive for DNA and RNA sequences.',
          holds: 'Nucleotide sequences, annotations, source organism'
        },
        {
          name: 'NCBI Protein', organism: 'All',
          url: 'https://www.ncbi.nlm.nih.gov/protein/',
          searchTemplate: 'https://www.ncbi.nlm.nih.gov/protein/?term={query}',
          description: 'Protein sequences from GenBank, RefSeq, PDB, SwissProt and PIR.',
          holds: 'Protein sequences, domain annotation, links to structures'
        },
        {
          name: 'NCBI Gene', organism: 'All',
          url: 'https://www.ncbi.nlm.nih.gov/gene/',
          searchTemplate: 'https://www.ncbi.nlm.nih.gov/gene/?term={query}',
          description: 'Gene-centric records tying together sequence, expression, phenotype and literature.',
          holds: 'Gene records, genomic context, transcript variants'
        },
        {
          name: 'UniProtKB', organism: 'All',
          url: 'https://www.uniprot.org/',
          searchTemplate: 'https://www.uniprot.org/uniprotkb?query={query}',
          description: 'The reference protein resource. Swiss-Prot entries are manually curated and worth the preference.',
          holds: 'Curated protein records, function, domains, PTMs, literature'
        },
        {
          name: 'ENA', organism: 'All',
          url: 'https://www.ebi.ac.uk/ena/browser/home',
          searchTemplate: 'https://www.ebi.ac.uk/ena/browser/text-search?query={query}',
          description: 'European Nucleotide Archive — the European node of the INSDC, mirrors GenBank.',
          holds: 'Raw reads, assemblies, annotated sequences'
        },
        {
          name: 'RefSeq', organism: 'All',
          url: 'https://www.ncbi.nlm.nih.gov/refseq/',
          description: 'Non-redundant, curated reference sequences — prefer these over raw GenBank submissions.',
          holds: 'Curated genomic, transcript and protein references'
        }
      ]
    },

    {
      id: 'plant',
      name: 'Plant genomics',
      icon: 'fa-seedling',
      description: 'Species-specific resources for crop and model plant genomes.',
      databases: [
        {
          name: 'Phytozome', organism: 'Plants (broad)',
          url: 'https://phytozome-next.jgi.doe.gov/',
          description: 'JGI plant genome portal covering 100+ species with gene families and expression atlases.',
          holds: 'Genomes, annotations, gene families, synteny, expression'
        },
        {
          name: 'Ensembl Plants', organism: 'Plants (broad)',
          url: 'https://plants.ensembl.org/',
          searchTemplate: 'https://plants.ensembl.org/Multi/Search/Results?q={query}',
          description: 'Genome browser with comparative genomics, variation and regulation for plant species.',
          holds: 'Genomes, gene trees, homologues, variation'
        },
        {
          name: 'TAIR', organism: 'Arabidopsis thaliana',
          url: 'https://www.arabidopsis.org/',
          description: 'The Arabidopsis Information Resource — the gold standard for plant gene annotation.',
          holds: 'Gene models, mutant lines, expression, curated function'
        },
        {
          name: 'RAP-DB', organism: 'Oryza sativa (rice)',
          url: 'https://rapdb.dna.affrc.go.jp/',
          description: 'Rice Annotation Project Database — curated rice gene models and functional annotation.',
          holds: 'Rice gene models, annotation, genome browser'
        },
        {
          name: 'MaizeGDB', organism: 'Zea mays (maize)',
          url: 'https://www.maizegdb.org/',
          searchTemplate: 'https://www.maizegdb.org/search?q={query}',
          description: 'The community database for maize genetics and genomics.',
          holds: 'Genomes, stocks, phenotypes, QTL, expression'
        },
        {
          name: 'SoyBase', organism: 'Glycine max (soybean)',
          url: 'https://www.soybase.org/',
          description: 'Soybean genetics and genomics database with QTL and trait data.',
          holds: 'Genome, QTL, germplasm, expression'
        },
        {
          name: 'Sol Genomics Network', organism: 'Solanaceae',
          url: 'https://solgenomics.net/',
          description: 'Tomato, potato, pepper, eggplant and tobacco genome resources.',
          holds: 'Genomes, markers, phenotypes, comparative maps'
        },
        {
          name: 'GrainGenes', organism: 'Triticeae (wheat, barley)',
          url: 'https://wheat.pw.usda.gov/GG3/',
          description: 'Genomic resources for wheat, barley, rye and oat.',
          holds: 'Maps, markers, QTL, sequences'
        },
        {
          name: 'PlantTFDB', organism: 'Plants (broad)',
          url: 'https://planttfdb.gao-lab.org/',
          description: 'Plant transcription factor database with family classification across 165 species.',
          holds: 'TF families, binding motifs, regulatory networks'
        },
        {
          name: 'PLAZA', organism: 'Plants (broad)',
          url: 'https://bioinformatics.psb.ugent.be/plaza/',
          description: 'Comparative genomics platform with precomputed gene families and phylogenies.',
          holds: 'Gene families, phylogenetic trees, collinearity'
        }
      ]
    },

    {
      id: 'animal',
      name: 'Animal & model organisms',
      icon: 'fa-fish',
      description: 'Curated resources for the major animal model systems.',
      databases: [
        {
          name: 'Ensembl', organism: 'Vertebrates',
          url: 'https://www.ensembl.org/',
          searchTemplate: 'https://www.ensembl.org/Multi/Search/Results?q={query}',
          description: 'Vertebrate genome browser with comparative genomics and regulatory annotation.',
          holds: 'Genomes, gene trees, variation, regulation'
        },
        {
          name: 'MGI', organism: 'Mus musculus (mouse)',
          url: 'https://www.informatics.jax.org/',
          description: 'Mouse Genome Informatics — the authoritative mouse gene and phenotype resource.',
          holds: 'Genes, alleles, phenotypes, expression, GO annotation'
        },
        {
          name: 'ZFIN', organism: 'Danio rerio (zebrafish)',
          url: 'https://zfin.org/',
          description: 'The zebrafish model organism database.',
          holds: 'Genes, expression patterns, mutants, phenotypes'
        },
        {
          name: 'FlyBase', organism: 'Drosophila',
          url: 'https://flybase.org/',
          description: 'Drosophila genes and genomes, with exceptionally deep functional curation.',
          holds: 'Genes, alleles, phenotypes, expression, interactions'
        },
        {
          name: 'WormBase', organism: 'C. elegans',
          url: 'https://wormbase.org/',
          description: 'Nematode biology and genomics resource.',
          holds: 'Genes, phenotypes, interactions, expression'
        },
        {
          name: 'SGD', organism: 'S. cerevisiae (yeast)',
          url: 'https://www.yeastgenome.org/',
          description: 'Saccharomyces Genome Database — the best-annotated eukaryotic genome.',
          holds: 'Genes, function, interactions, phenotypes'
        }
      ]
    },

    {
      id: 'protein',
      name: 'Protein families & domains',
      icon: 'fa-cubes',
      description: 'Where to establish what family your protein belongs to.',
      databases: [
        {
          name: 'InterPro', organism: 'All',
          url: 'https://www.ebi.ac.uk/interpro/',
          searchTemplate: 'https://www.ebi.ac.uk/interpro/search/text/{query}/',
          description: 'Integrates 13 signature databases into a single classification resource.',
          holds: 'Domains, families, sites, GO mappings'
        },
        {
          name: 'Pfam', organism: 'All',
          url: 'https://www.ebi.ac.uk/interpro/entry/pfam/',
          description: 'Protein family alignments and hidden Markov models, now hosted in InterPro.',
          holds: 'Domain families, HMMs, seed alignments'
        },
        {
          name: 'PROSITE', organism: 'All',
          url: 'https://prosite.expasy.org/',
          description: 'Documented protein patterns, profiles and functional sites.',
          holds: 'Motifs, active sites, PTM sites'
        },
        {
          name: 'SMART', organism: 'All',
          url: 'https://smart.embl.de/',
          description: 'Domain architecture research tool, strong on signalling and extracellular domains.',
          holds: 'Domain architectures, evolutionary annotation'
        },
        {
          name: 'CDD', organism: 'All',
          url: 'https://www.ncbi.nlm.nih.gov/Structure/cdd/cdd.shtml',
          description: 'NCBI Conserved Domain Database with curated domain models.',
          holds: 'Conserved domains, superfamilies, functional sites'
        },
        {
          name: 'PANTHER', organism: 'All',
          url: 'https://www.pantherdb.org/',
          description: 'Protein family and subfamily classification with pathway assignment.',
          holds: 'Families, subfamilies, GO, pathways'
        }
      ]
    },

    {
      id: 'structure',
      name: 'Structures',
      icon: 'fa-cube',
      description: 'Experimental and predicted three-dimensional structures.',
      databases: [
        {
          name: 'RCSB PDB', organism: 'All',
          url: 'https://www.rcsb.org/',
          searchTemplate: 'https://www.rcsb.org/search?request=%7B%22query%22%3A%7B%22type%22%3A%22terminal%22%2C%22service%22%3A%22full_text%22%2C%22parameters%22%3A%7B%22value%22%3A%22{query}%22%7D%7D%2C%22return_type%22%3A%22entry%22%7D',
          description: 'The archive of experimentally determined structures. Always check here before modeling.',
          holds: 'X-ray, NMR and cryo-EM structures, ligands'
        },
        {
          name: 'AlphaFold DB', organism: 'All',
          url: 'https://alphafold.ebi.ac.uk/',
          searchTemplate: 'https://alphafold.ebi.ac.uk/search/text/{query}',
          description: 'Over 200 million predicted structures with per-residue confidence scores.',
          holds: 'Predicted structures, pLDDT confidence, PAE matrices'
        },
        {
          name: 'PDBe', organism: 'All',
          url: 'https://www.ebi.ac.uk/pdbe/',
          description: 'The European node of the PDB with additional analysis and validation views.',
          holds: 'Structures, validation reports, ligand interactions'
        },
        {
          name: 'SWISS-MODEL Repository', organism: 'All',
          url: 'https://swissmodel.expasy.org/repository',
          description: 'Precomputed homology models for proteins across many proteomes.',
          holds: 'Homology models, QMEAN scores, templates'
        }
      ]
    },

    {
      id: 'expression',
      name: 'Expression & regulation',
      icon: 'fa-chart-column',
      description: 'Where the gene is expressed, and what regulates it.',
      databases: [
        {
          name: 'Expression Atlas', organism: 'All',
          url: 'https://www.ebi.ac.uk/gxa/home',
          searchTemplate: 'https://www.ebi.ac.uk/gxa/search?geneQuery={query}',
          description: 'Curated and reanalysed expression data across species and conditions.',
          holds: 'Baseline and differential expression, single cell'
        },
        {
          name: 'NCBI GEO', organism: 'All',
          url: 'https://www.ncbi.nlm.nih.gov/geo/',
          searchTemplate: 'https://www.ncbi.nlm.nih.gov/gds/?term={query}',
          description: 'The primary archive of functional genomics data for custom reanalysis.',
          holds: 'Microarray and RNA-seq datasets, raw and processed'
        },
        {
          name: 'BAR eFP Browser', organism: 'Plants',
          url: 'https://bar.utoronto.ca/efp/cgi-bin/efpWeb.cgi',
          description: 'Paints expression levels onto anatomical diagrams — very effective in figures.',
          holds: 'Tissue-specific and stress expression, visual output'
        },
        {
          name: 'ATTED-II', organism: 'Plants',
          url: 'https://atted.jp/',
          description: 'Co-expression networks providing guilt-by-association functional evidence.',
          holds: 'Co-expression networks, correlated gene sets'
        },
        {
          name: 'JASPAR', organism: 'All',
          url: 'https://jaspar.elixir.no/',
          description: 'Open-access transcription factor binding profiles as position frequency matrices.',
          holds: 'TF binding matrices, curated profiles'
        },
        {
          name: 'miRBase', organism: 'All',
          url: 'https://www.mirbase.org/',
          description: 'The reference registry of published microRNA sequences and annotation.',
          holds: 'miRNA sequences, hairpins, nomenclature'
        }
      ]
    },

    {
      id: 'pathway',
      name: 'Pathways & interactions',
      icon: 'fa-circle-nodes',
      description: 'Functional context: what the gene product participates in.',
      databases: [
        {
          name: 'KEGG', organism: 'All',
          url: 'https://www.genome.jp/kegg/',
          searchTemplate: 'https://www.genome.jp/dbget-bin/www_bfind_sub?mode=bfind&max_hit=100&dbkey=kegg&keywords={query}',
          description: 'Reference pathway maps for metabolism, signalling and cellular processes.',
          holds: 'Pathways, orthology groups, reactions, compounds'
        },
        {
          name: 'Gene Ontology', organism: 'All',
          url: 'https://geneontology.org/',
          description: 'The controlled vocabulary for gene function, process and localization.',
          holds: 'GO terms, annotations, evidence codes'
        },
        {
          name: 'STRING', organism: 'All',
          url: 'https://string-db.org/',
          description: 'Protein association networks from experimental, curated and predicted evidence.',
          holds: 'Interaction networks, confidence scores, enrichment'
        },
        {
          name: 'Reactome', organism: 'All',
          url: 'https://reactome.org/',
          searchTemplate: 'https://reactome.org/content/query?q={query}',
          description: 'Peer-reviewed, manually curated pathway database with detailed reaction models.',
          holds: 'Curated pathways, reactions, complexes'
        },
        {
          name: 'BioGRID', organism: 'All',
          url: 'https://thebiogrid.org/',
          description: 'Literature-curated genetic and physical interaction records.',
          holds: 'Physical and genetic interactions, chemical associations'
        },
        {
          name: 'IntAct', organism: 'All',
          url: 'https://www.ebi.ac.uk/intact/',
          description: 'Molecular interaction database with detailed experimental provenance.',
          holds: 'Binary interactions, complexes, experimental detail'
        }
      ]
    }
  ];

  /** Flat list of every database. */
  function allDatabases() {
    return DATABASE_CATEGORIES.flatMap(cat =>
      cat.databases.map(db => ({ ...db, category: cat.name, categoryId: cat.id })));
  }

  /** Case-insensitive search across name, organism, description and contents. */
  function searchDatabases(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return allDatabases();
    return allDatabases().filter(db =>
      db.name.toLowerCase().includes(q) ||
      db.organism.toLowerCase().includes(q) ||
      db.description.toLowerCase().includes(q) ||
      db.holds.toLowerCase().includes(q) ||
      db.category.toLowerCase().includes(q));
  }

  /**
   * Build a direct search URL for a database, or null if it has no
   * documented query interface.
   */
  function buildSearchUrl(db, query) {
    if (!db.searchTemplate || !query || !query.trim()) return null;
    return db.searchTemplate.replace('{query}', encodeURIComponent(query.trim()));
  }

  return { DATABASE_CATEGORIES, allDatabases, searchDatabases, buildSearchUrl };
});

/**
 * tools-data.js — Registry of external bioinformatics resources.
 *
 * Every entry links to a live, publicly accessible tool. Where a tool exposes
 * a documented URL/GET interface, `handoff: 'url'` lets the app pre-fill the
 * user's sequence directly. Otherwise `handoff: 'clipboard'` copies the
 * sequence and opens the tool's input form, so the user just has to paste.
 *
 * Links last verified: 2026-08-02
 *
 * handoff values:
 *   'url'       — sequence is injected into the URL via {seq}
 *   'clipboard' — sequence copied, tool opened at its input form
 *   'none'      — reference/database/desktop software, nothing to hand off
 */

const PROTOCOL_STEPS = [
  {
    step: 1,
    title: 'Sequence Input & Quality Control',
    short: 'Sequence Input',
    icon: 'fa-file-import',
    accepts: 'any',
    description:
      'Load your sequence in FASTA format and run the built-in analyzer for a first-pass ' +
      'characterization: length, composition, GC content, melting temperature, open reading ' +
      'frames and translation. Confirm the sequence is complete and free of ambiguous bases ' +
      'before committing to downstream analysis.',
    guidance: [
      'Check for long runs of N — these indicate assembly gaps and will distort GC and ORF calls.',
      'For a coding sequence, confirm the length is a multiple of 3 and that a single long ORF spans it.',
      'Record the accession and genome version now; you will need them for every figure legend later.'
    ],
    tools: [
      {
        name: 'NCBI Gene', category: 'Reference database',
        url: 'https://www.ncbi.nlm.nih.gov/gene/',
        urlTemplate: 'https://www.ncbi.nlm.nih.gov/gene/?term={query}',
        handoff: 'none',
        description: 'Authoritative gene records with genomic context, RefSeq transcripts and cross-references.'
      },
      {
        name: 'UniProtKB', category: 'Protein database',
        url: 'https://www.uniprot.org/',
        urlTemplate: 'https://www.uniprot.org/uniprotkb?query={query}',
        handoff: 'none',
        description: 'Curated protein sequences with functional annotation, domains and literature evidence.'
      },
      {
        name: 'Phytozome', category: 'Plant genomes',
        url: 'https://phytozome-next.jgi.doe.gov/',
        handoff: 'none',
        description: 'JGI plant genome portal — sequences, annotations, gene families and expression atlases.'
      },
      {
        name: 'Ensembl Plants', category: 'Plant genomes',
        url: 'https://plants.ensembl.org/',
        handoff: 'none',
        description: 'Genome browser with comparative genomics and variation data for crop and model plants.'
      },
      {
        name: 'TAIR', category: 'Arabidopsis',
        url: 'https://www.arabidopsis.org/',
        handoff: 'none',
        description: 'The reference resource for Arabidopsis thaliana gene models and functional annotation.'
      },
      {
        name: 'RAP-DB', category: 'Rice',
        url: 'https://rapdb.dna.affrc.go.jp/',
        handoff: 'none',
        description: 'Rice Annotation Project Database — curated Oryza sativa gene models.'
      }
    ]
  },

  {
    step: 2,
    title: 'BLAST Homology Search',
    short: 'BLAST Search',
    icon: 'fa-magnifying-glass',
    accepts: 'any',
    description:
      'Identify homologous sequences across species to establish orthology and collect the ' +
      'members of your gene family. Use the built-in analyzer output to pick the right program: ' +
      'blastn for nucleotide-vs-nucleotide, blastp for protein, and tblastn to find unannotated ' +
      'family members in a genome.',
    guidance: [
      'E-value below 1e-10 with over 50% query coverage is a reasonable starting threshold for orthologs.',
      'Reciprocal best hits are far stronger evidence of orthology than a one-way top hit.',
      'Run tblastn against the genome as well as blastp against proteins — poorly annotated genomes hide family members.'
    ],
    tools: [
      {
        name: 'NCBI BLAST', category: 'Primary tool',
        url: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi',
        urlTemplate: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Web&PAGE_TYPE=BlastSearch&PROGRAM={program}&DATABASE={database}&QUERY={seq}',
        handoff: 'url',
        featured: true,
        description: 'The standard sequence similarity search. Program and database are selected automatically from your sequence type.'
      },
      {
        name: 'UniProt BLAST', category: 'Protein search',
        url: 'https://www.uniprot.org/blast',
        urlTemplate: 'https://www.uniprot.org/blast?query={seq}',
        handoff: 'url',
        description: 'BLAST against curated UniProtKB entries — cleaner annotation than raw GenBank hits.'
      },
      {
        name: 'Phytozome BLAST', category: 'Plant genomes',
        url: 'https://phytozome-next.jgi.doe.gov/blast-search',
        handoff: 'clipboard',
        description: 'Search plant genomes directly, including tblastn against unannotated genomic regions.'
      },
      {
        name: 'Ensembl Plants BLAST', category: 'Plant genomes',
        url: 'https://plants.ensembl.org/Multi/Tools/Blast',
        handoff: 'clipboard',
        description: 'BLAST across Ensembl plant genomes with direct links into the genome browser.'
      },
      {
        name: 'HMMER (EBI)', category: 'Sensitive search',
        url: 'https://www.ebi.ac.uk/Tools/hmmer/',
        handoff: 'clipboard',
        description: 'Profile HMM search — more sensitive than BLAST for detecting remote homologs.'
      }
    ]
  },

  {
    step: 3,
    title: 'Conserved Domain Analysis',
    short: 'Domain Analysis',
    icon: 'fa-cubes',
    accepts: 'protein',
    description:
      'Identify the conserved domains that define your protein family. Domain architecture is ' +
      'the single strongest piece of evidence for family membership — stronger than overall ' +
      'sequence identity, which decays quickly across distant species.',
    guidance: [
      'Confirm the diagnostic domain is present across every candidate family member before including it.',
      'Note domain boundaries in residue coordinates — you will reuse them in the motif and structure steps.',
      'Cross-check at least two databases; CDD and InterPro use different models and occasionally disagree.'
    ],
    tools: [
      {
        name: 'NCBI CDD', category: 'Primary tool',
        url: 'https://www.ncbi.nlm.nih.gov/Structure/cdd/wrpsb.cgi',
        urlTemplate: 'https://www.ncbi.nlm.nih.gov/Structure/cdd/wrpsb.cgi?seqinput={seq}',
        handoff: 'url',
        featured: true,
        description: 'Conserved Domain Database search — identifies domains, superfamilies and functional sites.'
      },
      {
        name: 'InterPro', category: 'Comprehensive',
        url: 'https://www.ebi.ac.uk/interpro/search/sequence/',
        handoff: 'clipboard',
        featured: true,
        description: 'Runs 13 member databases at once (Pfam, PROSITE, SMART, PANTHER and more) with GO mapping.'
      },
      {
        name: 'Pfam (via InterPro)', category: 'Domain families',
        url: 'https://www.ebi.ac.uk/interpro/entry/pfam/',
        handoff: 'none',
        description: 'The Pfam domain family collection, now hosted within InterPro.'
      },
      {
        name: 'SMART', category: 'Domain architecture',
        url: 'https://smart.embl.de/',
        handoff: 'clipboard',
        description: 'Domain architecture analysis with good coverage of signalling and extracellular domains.'
      },
      {
        name: 'PROSITE', category: 'Motifs & patterns',
        url: 'https://prosite.expasy.org/scanprosite/',
        handoff: 'clipboard',
        description: 'Scan for documented functional motifs, active sites and post-translational modification sites.'
      },
      {
        name: 'PlantTFDB', category: 'Plant TFs',
        url: 'https://planttfdb.gao-lab.org/prediction.php',
        handoff: 'clipboard',
        description: 'Classifies plant transcription factors into families based on DNA-binding domain content.'
      }
    ]
  },

  {
    step: 4,
    title: 'Multiple Sequence Alignment',
    short: 'Alignment',
    icon: 'fa-align-left',
    accepts: 'any',
    description:
      'Align all family members. Alignment quality determines the reliability of everything ' +
      'downstream — phylogeny, selection analysis and conservation mapping all inherit its errors. ' +
      'Inspect and trim the alignment before building a tree.',
    guidance: [
      'Align protein sequences rather than nucleotides for distant homologs, then back-translate if you need codons.',
      'Use MAFFT L-INS-i for under ~200 sequences; switch to FFT-NS-2 only when speed forces it.',
      'Trim poorly aligned terminal regions with trimAl or Gblocks before phylogenetic analysis.'
    ],
    tools: [
      {
        name: 'MAFFT', category: 'Recommended',
        url: 'https://mafft.cbrc.jp/alignment/server/',
        handoff: 'clipboard',
        featured: true,
        description: 'Fast, accurate multiple alignment. L-INS-i mode is the accuracy-oriented default for gene families.'
      },
      {
        name: 'Clustal Omega', category: 'EBI service',
        url: 'https://www.ebi.ac.uk/jdispatcher/msa/clustalo',
        handoff: 'clipboard',
        description: 'Scales to very large sequence sets with consistent, reproducible output.'
      },
      {
        name: 'MUSCLE', category: 'EBI service',
        url: 'https://www.ebi.ac.uk/jdispatcher/msa/muscle',
        handoff: 'clipboard',
        description: 'Well-established aligner, a useful second opinion when MAFFT results look questionable.'
      },
      {
        name: 'T-Coffee', category: 'Consistency-based',
        url: 'https://tcoffee.crg.eu/',
        handoff: 'clipboard',
        description: 'Combines multiple alignment methods and reports per-column reliability scores.'
      },
      {
        name: 'Jalview', category: 'Visualization',
        url: 'https://www.jalview.org/',
        handoff: 'none',
        description: 'Desktop alignment editor for inspecting, annotating and trimming alignments.'
      },
      {
        name: 'trimAl', category: 'Alignment trimming',
        url: 'http://trimal.cgenomics.org/',
        handoff: 'none',
        description: 'Automated removal of poorly aligned columns prior to phylogenetic inference.'
      }
    ]
  },

  {
    step: 5,
    title: 'Phylogenetic Tree Construction',
    short: 'Phylogeny',
    icon: 'fa-sitemap',
    accepts: 'any',
    description:
      'Reconstruct the evolutionary relationships among family members. The tree topology is ' +
      'what lets you distinguish orthologs from paralogs and assign subfamily membership.',
    guidance: [
      'Use model selection (ModelTest / IQ-TREE ModelFinder) rather than defaulting to JTT or WAG.',
      'Report bootstrap support from at least 1000 replicates; treat nodes under 70% as unresolved.',
      'Include a clear outgroup — an unrooted tree cannot tell you the direction of evolution.'
    ],
    tools: [
      {
        name: 'IQ-TREE', category: 'Maximum likelihood',
        url: 'http://iqtree.cibiv.univie.ac.at/',
        handoff: 'clipboard',
        featured: true,
        description: 'Fast ML inference with built-in model selection and ultrafast bootstrap.'
      },
      {
        name: 'MEGA', category: 'Desktop software',
        url: 'https://www.megasoftware.net/',
        handoff: 'none',
        featured: true,
        description: 'Integrated alignment, model testing and tree building with a graphical interface.'
      },
      {
        name: 'NGPhylogeny.fr', category: 'Web pipeline',
        url: 'https://ngphylogeny.fr/',
        handoff: 'clipboard',
        description: 'One-click pipeline chaining alignment, trimming, PhyML inference and tree rendering.'
      },
      {
        name: 'iTOL', category: 'Visualization',
        url: 'https://itol.embl.de/',
        handoff: 'none',
        featured: true,
        description: 'Interactive Tree Of Life — publication-quality trees with annotation rings and heatmaps.'
      },
      {
        name: 'FigTree', category: 'Visualization',
        url: 'http://tree.bio.ed.ac.uk/software/figtree/',
        handoff: 'none',
        description: 'Lightweight desktop tree viewer for quick inspection and figure export.'
      },
      {
        name: 'TimeTree', category: 'Divergence times',
        url: 'http://www.timetree.org/',
        handoff: 'none',
        description: 'Published divergence time estimates for calibrating and interpreting your tree.'
      }
    ]
  },

  {
    step: 6,
    title: 'Conserved Motif Analysis',
    short: 'Motif Analysis',
    icon: 'fa-barcode',
    accepts: 'any',
    description:
      'Discover short conserved motifs shared across family members. Motif composition often ' +
      'tracks subfamily structure and can reveal functional divergence that domain-level ' +
      'annotation misses.',
    guidance: [
      'Ten to fifteen motifs is a practical range; more than that usually fragments real motifs.',
      'Map discovered motifs back onto the phylogeny — subfamily-specific motifs are the interesting finding.',
      'Use Tomtom to check whether a novel motif matches an already-characterized one.'
    ],
    tools: [
      {
        name: 'MEME', category: 'Motif discovery',
        url: 'https://meme-suite.org/meme/tools/meme',
        handoff: 'clipboard',
        featured: true,
        description: 'The standard de novo motif discovery tool for sets of related sequences.'
      },
      {
        name: 'STREME', category: 'Motif discovery',
        url: 'https://meme-suite.org/meme/tools/streme',
        handoff: 'clipboard',
        description: 'Successor to DREME — finds enriched motifs in large sequence sets with statistical control.'
      },
      {
        name: 'Tomtom', category: 'Motif comparison',
        url: 'https://meme-suite.org/meme/tools/tomtom',
        handoff: 'none',
        description: 'Compares your discovered motifs against known motif databases.'
      },
      {
        name: 'FIMO', category: 'Motif scanning',
        url: 'https://meme-suite.org/meme/tools/fimo',
        handoff: 'clipboard',
        description: 'Scans sequences for occurrences of a known motif with per-site p-values.'
      },
      {
        name: 'TBtools', category: 'Visualization',
        url: 'https://github.com/CJ-Chen/TBtools-II',
        handoff: 'none',
        description: 'Combines gene structure, domains and motifs into a single publication-ready figure.'
      }
    ]
  },

  {
    step: 7,
    title: 'Chromosomal Location & Synteny',
    short: 'Chromosome Map',
    icon: 'fa-map-location-dot',
    accepts: 'none',
    description:
      'Map family members onto chromosomes and identify duplication events. Tandem arrays and ' +
      'segmental duplications explain how the family expanded, and collinearity with related ' +
      'species dates those events.',
    guidance: [
      'Genes within ~100 kb on the same chromosome with no more than one intervening gene are conventionally called tandem duplicates.',
      'Segmental duplication requires collinearity evidence — MCScanX is the standard test.',
      'Report physical positions in bp against a named genome assembly version.'
    ],
    tools: [
      {
        name: 'MG2C', category: 'Chromosome mapping',
        url: 'http://mg2c.iask.in/mg2c_v2.1/',
        handoff: 'none',
        featured: true,
        description: 'Simple web tool that draws gene positions on chromosome ideograms from a coordinate table.'
      },
      {
        name: 'MCScanX', category: 'Synteny analysis',
        url: 'https://github.com/wyp1125/MCScanX',
        handoff: 'none',
        description: 'Detects collinear blocks and classifies duplication modes (tandem, segmental, WGD).'
      },
      {
        name: 'TBtools', category: 'Visualization',
        url: 'https://github.com/CJ-Chen/TBtools-II',
        handoff: 'none',
        featured: true,
        description: 'Includes a bundled MCScanX wrapper plus circos and dual-synteny plotting.'
      },
      {
        name: 'PGDD', category: 'Plant duplication',
        url: 'http://chibba.agtec.uga.edu/duplication/',
        handoff: 'none',
        description: 'Plant Genome Duplication Database — precomputed syntenic blocks across plant genomes.'
      },
      {
        name: 'Ensembl Plants', category: 'Genome browser',
        url: 'https://plants.ensembl.org/',
        handoff: 'none',
        description: 'Retrieve exact chromosomal coordinates and browse the genomic neighbourhood.'
      }
    ]
  },

  {
    step: 8,
    title: 'Gene Structure Analysis',
    short: 'Gene Structure',
    icon: 'fa-diagram-project',
    accepts: 'none',
    description:
      'Compare exon-intron architecture across the family. Structural conservation usually ' +
      'mirrors phylogenetic grouping, and structural divergence within a clade is a signal ' +
      'worth investigating.',
    guidance: [
      'Plot gene structure alongside the phylogeny — the two should broadly agree.',
      'Intron phase (0, 1 or 2) is more evolutionarily informative than intron count alone.',
      'You need both the genomic and CDS sequences; GSDS compares them to infer structure.'
    ],
    tools: [
      {
        name: 'GSDS 2.0', category: 'Primary tool',
        url: 'https://gsds.gao-lab.org/',
        handoff: 'none',
        featured: true,
        description: 'Gene Structure Display Server — renders exon-intron diagrams from GFF or paired sequences.'
      },
      {
        name: 'TBtools', category: 'Visualization',
        url: 'https://github.com/CJ-Chen/TBtools-II',
        handoff: 'none',
        description: 'Gene structure viewer that overlays domains, motifs and the phylogenetic tree.'
      },
      {
        name: 'Ensembl Plants', category: 'Genome browser',
        url: 'https://plants.ensembl.org/',
        handoff: 'none',
        description: 'Inspect annotated transcript models and alternative splicing directly.'
      },
      {
        name: 'NCBI ORFfinder', category: 'ORF prediction',
        url: 'https://www.ncbi.nlm.nih.gov/orffinder/',
        handoff: 'clipboard',
        description: 'Independent ORF prediction to cross-check the built-in analyzer output.'
      }
    ]
  },

  {
    step: 9,
    title: 'Physicochemical Properties',
    short: 'Physicochemical',
    icon: 'fa-flask',
    accepts: 'protein',
    description:
      'Compute molecular weight, isoelectric point, hydropathy and stability indices. The ' +
      'built-in analyzer calculates most of these locally; ExPASy ProtParam adds the instability ' +
      'and aliphatic indices and is the value normally cited in publications.',
    guidance: [
      'Report pI and MW from ProtParam for consistency with published work — small methodological differences exist between implementations.',
      'A GRAVY value above zero suggests a hydrophobic, possibly membrane-associated protein.',
      'An instability index above 40 predicts a short in vivo half-life.'
    ],
    tools: [
      {
        name: 'ExPASy ProtParam', category: 'Primary tool',
        url: 'https://web.expasy.org/protparam/',
        handoff: 'clipboard',
        featured: true,
        description: 'MW, theoretical pI, extinction coefficient, instability index, aliphatic index and GRAVY.'
      },
      {
        name: 'Expasy Compute pI/Mw', category: 'Quick calculation',
        url: 'https://web.expasy.org/compute_pi/',
        handoff: 'clipboard',
        description: 'Focused pI and molecular weight calculation, including for UniProt accessions.'
      },
      {
        name: 'ProtScale', category: 'Hydropathy plots',
        url: 'https://web.expasy.org/protscale/',
        handoff: 'clipboard',
        description: 'Generates amino acid scale profiles including Kyte-Doolittle hydropathy.'
      },
      {
        name: 'TMHMM / DeepTMHMM', category: 'Transmembrane helices',
        url: 'https://dtu.biolib.com/DeepTMHMM',
        handoff: 'clipboard',
        description: 'Predicts transmembrane helices — the natural follow-up to a positive GRAVY score.'
      }
    ]
  },

  {
    step: 10,
    title: 'Subcellular Localization',
    short: 'Localization',
    icon: 'fa-location-crosshairs',
    accepts: 'protein',
    description:
      'Predict where the protein functions in the cell. Localization constrains plausible ' +
      'function and should agree with the domain content — a predicted DNA-binding domain with ' +
      'a chloroplast transit peptide warrants a second look.',
    guidance: [
      'Run at least two predictors; agreement between independent methods is much more convincing than one confident call.',
      'Choose the plant-specific model where offered — plastid targeting is absent from animal-trained predictors.',
      'Prediction is not evidence. Cite it as prediction and, where it matters, follow up experimentally.'
    ],
    tools: [
      {
        name: 'WoLF PSORT', category: 'Primary tool',
        url: 'https://wolfpsort.hgc.jp/',
        handoff: 'clipboard',
        featured: true,
        description: 'Localization prediction with separate animal, plant and fungal models.'
      },
      {
        name: 'TargetP 2.0', category: 'Targeting peptides',
        url: 'https://services.healthtech.dtu.dk/services/TargetP-2.0/',
        handoff: 'clipboard',
        featured: true,
        description: 'Detects chloroplast transit peptides, mitochondrial targeting peptides and signal peptides.'
      },
      {
        name: 'DeepLoc 2.0', category: 'Deep learning',
        url: 'https://services.healthtech.dtu.dk/services/DeepLoc-2.0/',
        handoff: 'clipboard',
        description: 'Neural-network localization prediction across ten compartments with sorting signals.'
      },
      {
        name: 'SignalP 6.0', category: 'Signal peptides',
        url: 'https://services.healthtech.dtu.dk/services/SignalP-6.0/',
        handoff: 'clipboard',
        description: 'Signal peptide detection and cleavage site prediction for secreted proteins.'
      },
      {
        name: 'CELLO', category: 'Second opinion',
        url: 'http://cello.life.nctu.edu.tw/',
        handoff: 'clipboard',
        description: 'SVM-based localization predictor, useful as an independent cross-check.'
      }
    ]
  },

  {
    step: 11,
    title: 'Promoter & cis-Element Analysis',
    short: 'Promoter Analysis',
    icon: 'fa-dna',
    accepts: 'dna',
    description:
      'Analyze the upstream regulatory region for cis-acting elements. The element repertoire ' +
      'predicts which stimuli regulate the gene and is the standard justification for the stress ' +
      'or hormone treatments used in expression experiments.',
    guidance: [
      'Extract 1.5-2 kb upstream of the start codon; state the exact window in your methods.',
      'Element counts are inflated by chance for short motifs — compare against a shuffled background.',
      'Group elements by function (light, hormone, stress, development) rather than listing every hit.'
    ],
    tools: [
      {
        name: 'PlantCARE', category: 'Primary tool',
        url: 'https://bioinformatics.psb.ugent.be/webtools/plantcare/html/',
        handoff: 'clipboard',
        featured: true,
        description: 'The standard database of plant cis-acting regulatory elements with promoter scanning.'
      },
      {
        name: 'PlantPAN 4.0', category: 'Comprehensive',
        url: 'http://plantpan.itps.ncku.edu.tw/plantpan4/',
        handoff: 'clipboard',
        featured: true,
        description: 'Promoter analysis with TF binding sites, ChIP-seq evidence and comparative promoter views.'
      },
      {
        name: 'New PLACE', category: 'Element database',
        url: 'https://www.dna.affrc.go.jp/PLACE/',
        handoff: 'clipboard',
        description: 'Curated collection of experimentally characterized plant cis-regulatory motifs.'
      },
      {
        name: 'JASPAR', category: 'TF binding profiles',
        url: 'https://jaspar.elixir.no/',
        handoff: 'none',
        description: 'Open-access transcription factor binding profiles as position frequency matrices.'
      },
      {
        name: 'MEME FIMO', category: 'Motif scanning',
        url: 'https://meme-suite.org/meme/tools/fimo',
        handoff: 'clipboard',
        description: 'Scan promoters for JASPAR matrices with statistically calibrated p-values.'
      }
    ]
  },

  {
    step: 12,
    title: 'miRNA Target Prediction',
    short: 'miRNA Targets',
    icon: 'fa-bullseye',
    accepts: 'dna',
    description:
      'Identify microRNAs predicted to regulate your gene post-transcriptionally. In plants, ' +
      'miRNA-target pairing is near-perfect, which makes prediction considerably more reliable ' +
      'than in animals.',
    guidance: [
      'Use the CDS or full transcript, not the genomic sequence with introns.',
      'psRNATarget expectation scores at or below 3 are commonly treated as confident in plants.',
      'Degradome (PARE) data is the strongest available validation short of a cleavage assay.'
    ],
    tools: [
      {
        name: 'psRNATarget', category: 'Primary tool',
        url: 'https://www.zhaolab.org/psRNATarget/',
        handoff: 'clipboard',
        featured: true,
        description: 'Plant small RNA target analysis server with degradome-supported validation.'
      },
      {
        name: 'miRBase', category: 'miRNA database',
        url: 'https://www.mirbase.org/',
        handoff: 'none',
        description: 'The reference registry of published microRNA sequences and annotations.'
      },
      {
        name: 'PmiREN', category: 'Plant miRNA',
        url: 'https://pmiren.com/',
        handoff: 'none',
        description: 'Plant miRNA encyclopedia with expression profiles and target information.'
      },
      {
        name: 'TAPIR', category: 'Target prediction',
        url: 'https://tools.mirnablog.com/tapir/',
        handoff: 'clipboard',
        description: 'Plant miRNA target finder supporting both fast and precise scoring modes.'
      }
    ]
  },

  {
    step: 13,
    title: 'GO & KEGG Functional Annotation',
    short: 'GO & KEGG',
    icon: 'fa-tags',
    accepts: 'protein',
    description:
      'Assign Gene Ontology terms and map the gene onto metabolic and signalling pathways. ' +
      'This is where sequence-level findings connect to biological process.',
    guidance: [
      'Always specify a background gene set for enrichment — the whole genome is rarely the right one.',
      'Correct for multiple testing (FDR) and report adjusted p-values, not raw ones.',
      'Distinguish electronically inferred annotations (IEA) from experimentally supported ones.'
    ],
    tools: [
      {
        name: 'ShinyGO', category: 'Enrichment',
        url: 'http://bioinformatics.sdstate.edu/go/',
        handoff: 'clipboard',
        featured: true,
        description: 'Graphical GO and pathway enrichment with strong plant genome coverage.'
      },
      {
        name: 'KEGG', category: 'Pathways',
        url: 'https://www.genome.jp/kegg/',
        handoff: 'none',
        featured: true,
        description: 'Reference pathway maps for metabolism, signalling and cellular processes.'
      },
      {
        name: 'g:Profiler', category: 'Enrichment',
        url: 'https://biit.cs.ut.ee/gprofiler/gost',
        handoff: 'clipboard',
        description: 'Multi-source functional enrichment with rigorous multiple-testing correction.'
      },
      {
        name: 'DAVID', category: 'Enrichment',
        url: 'https://david.ncifcrf.gov/',
        handoff: 'clipboard',
        description: 'Long-established annotation and enrichment suite with functional clustering.'
      },
      {
        name: 'PANTHER', category: 'Classification',
        url: 'https://www.pantherdb.org/',
        handoff: 'clipboard',
        description: 'Protein family and pathway classification maintained by the GO Consortium.'
      },
      {
        name: 'agriGO v2', category: 'Plant-specific',
        url: 'http://systemsbiology.cau.edu.cn/agriGOv2/',
        handoff: 'clipboard',
        description: 'GO analysis toolkit built specifically around agricultural species.'
      }
    ]
  },

  {
    step: 14,
    title: 'Protein-Protein Interaction Network',
    short: 'PPI Network',
    icon: 'fa-circle-nodes',
    accepts: 'protein',
    description:
      'Place your protein in its interaction context. Interaction partners frequently suggest ' +
      'function more directly than sequence features do, particularly for proteins with generic ' +
      'domain architecture.',
    guidance: [
      'Separate experimentally determined interactions from predicted ones when reporting.',
      'A confidence score of 0.7 or above is a reasonable threshold for a figure.',
      'For non-model species, interactions are usually transferred from a model organism — say so explicitly.'
    ],
    tools: [
      {
        name: 'STRING', category: 'Primary tool',
        url: 'https://string-db.org/cgi/input?input_page_active_form=multiple_sequences',
        handoff: 'clipboard',
        featured: true,
        description: 'Functional association networks from experimental, curated and predicted evidence.'
      },
      {
        name: 'BioGRID', category: 'Curated interactions',
        url: 'https://thebiogrid.org/',
        handoff: 'none',
        description: 'Literature-curated genetic and physical interaction records.'
      },
      {
        name: 'IntAct', category: 'Molecular interactions',
        url: 'https://www.ebi.ac.uk/intact/',
        handoff: 'none',
        description: 'EBI molecular interaction database with detailed experimental provenance.'
      },
      {
        name: 'Cytoscape', category: 'Visualization',
        url: 'https://cytoscape.org/',
        handoff: 'none',
        description: 'Desktop platform for network visualization, layout and topological analysis.'
      }
    ]
  },

  {
    step: 15,
    title: '3D Structure Modeling',
    short: '3D Modeling',
    icon: 'fa-cube',
    accepts: 'protein',
    description:
      'Generate a three-dimensional model of the protein. Structure reveals whether residues ' +
      'that are distant in sequence form a shared active site, and whether conserved motifs ' +
      'cluster on a functional surface.',
    guidance: [
      'Check the AlphaFold database first — your protein or a close homolog may already be modeled.',
      'AlphaFold pLDDT above 90 indicates high confidence; below 50 usually means intrinsic disorder.',
      'For homology modeling, a template with over 30% identity is a reasonable minimum.'
    ],
    tools: [
      {
        name: 'AlphaFold DB', category: 'Predicted structures',
        url: 'https://alphafold.ebi.ac.uk/',
        urlTemplate: 'https://alphafold.ebi.ac.uk/search/text/{query}',
        handoff: 'none',
        featured: true,
        description: 'Over 200 million predicted structures with per-residue confidence scores.'
      },
      {
        name: 'SWISS-MODEL', category: 'Homology modeling',
        url: 'https://swissmodel.expasy.org/interactive',
        handoff: 'clipboard',
        featured: true,
        description: 'Automated homology modeling with template search and QMEAN quality assessment.'
      },
      {
        name: 'ColabFold', category: 'AlphaFold2',
        url: 'https://colab.research.google.com/github/sokrypton/ColabFold/blob/main/AlphaFold2.ipynb',
        handoff: 'clipboard',
        description: 'Run AlphaFold2 free in Google Colab — useful for sequences absent from the database.'
      },
      {
        name: 'Phyre2', category: 'Fold recognition',
        url: 'http://www.sbg.bio.ic.ac.uk/~phyre2/',
        handoff: 'clipboard',
        description: 'Remote homology detection and modeling for targets with no close template.'
      },
      {
        name: 'RCSB PDB', category: 'Experimental structures',
        url: 'https://www.rcsb.org/',
        handoff: 'none',
        description: 'The archive of experimentally determined structures — always check for a real one first.'
      }
    ]
  },

  {
    step: 16,
    title: 'Structure Validation',
    short: 'Validation',
    icon: 'fa-circle-check',
    accepts: 'none',
    description:
      'Assess whether your model is stereochemically reasonable before drawing conclusions from ' +
      'it. An unvalidated model is not usable evidence.',
    guidance: [
      'Aim for over 90% of residues in favoured Ramachandran regions.',
      'A ProSA Z-score within the range observed for native structures of similar size indicates a plausible fold.',
      'Validate the specific regions you intend to interpret, not just the global score.'
    ],
    tools: [
      {
        name: 'SAVES v6', category: 'Validation suite',
        url: 'https://saves.mbi.ucla.edu/',
        handoff: 'none',
        featured: true,
        description: 'Runs PROCHECK, ERRAT, VERIFY-3D and WHATCHECK on an uploaded structure.'
      },
      {
        name: 'ProSA-web', category: 'Energy assessment',
        url: 'https://prosa.services.came.sbg.ac.at/prosa.php',
        handoff: 'none',
        featured: true,
        description: 'Z-score and per-residue energy plot benchmarked against experimental structures.'
      },
      {
        name: 'MolProbity', category: 'All-atom validation',
        url: 'http://molprobity.biochem.duke.edu/',
        handoff: 'none',
        description: 'All-atom contact analysis, Ramachandran statistics and rotamer outlier detection.'
      },
      {
        name: 'PDBsum', category: 'Structure summary',
        url: 'https://www.ebi.ac.uk/thornton-srv/databases/pdbsum/',
        handoff: 'none',
        description: 'Pictorial summaries of secondary structure, ligand contacts and Ramachandran plots.'
      }
    ]
  },

  {
    step: 17,
    title: 'Secondary Structure Prediction',
    short: 'Secondary Structure',
    icon: 'fa-wave-square',
    accepts: 'protein',
    description:
      'Predict helices, strands and coils from sequence. Useful as an independent check on your ' +
      '3D model and for locating disordered regions that structure prediction handles poorly.',
    guidance: [
      'Secondary structure content should broadly match your 3D model — large disagreement means one of them is wrong.',
      'Long predicted coil regions with low AlphaFold pLDDT usually indicate genuine intrinsic disorder.',
      'PSIPRED uses evolutionary profiles and is generally more accurate than single-sequence methods like SOPMA.'
    ],
    tools: [
      {
        name: 'PSIPRED', category: 'Primary tool',
        url: 'https://bioinf.cs.ucl.ac.uk/psipred/',
        handoff: 'clipboard',
        featured: true,
        description: 'Profile-based secondary structure prediction, consistently among the most accurate methods.'
      },
      {
        name: 'SOPMA', category: 'Quick prediction',
        url: 'https://npsa-prabi.ibcp.fr/cgi-bin/npsa_automat.pl?page=npsa_sopma.html',
        handoff: 'clipboard',
        description: 'Fast single-sequence prediction reporting helix, sheet, turn and coil percentages.'
      },
      {
        name: 'JPred4', category: 'Consensus',
        url: 'https://www.compbio.dundee.ac.uk/jpred/',
        handoff: 'clipboard',
        description: 'Consensus predictor that also reports solvent accessibility and coiled-coil regions.'
      },
      {
        name: 'PredictProtein', category: 'Comprehensive',
        url: 'https://predictprotein.org/',
        handoff: 'clipboard',
        description: 'Bundles secondary structure, disorder, binding sites and localization in one run.'
      }
    ]
  },

  {
    step: 18,
    title: 'Selection Pressure Analysis',
    short: 'Selection Pressure',
    icon: 'fa-scale-balanced',
    accepts: 'dna',
    description:
      'Calculate Ka/Ks ratios between duplicated gene pairs to determine the selective regime. ' +
      'This distinguishes genes under functional constraint from those free to diverge, and ' +
      'dates duplication events.',
    guidance: [
      'Ka/Ks below 1 indicates purifying selection, near 1 neutral drift, above 1 positive selection.',
      'Ka/Ks above 1 across a whole gene is rare — site or branch-site models detect it far more often.',
      'Divergence time is estimated as T = Ks / (2r); state the substitution rate r and its source.'
    ],
    tools: [
      {
        name: 'Datamonkey', category: 'Web service',
        url: 'https://www.datamonkey.org/',
        handoff: 'none',
        featured: true,
        description: 'HyPhy selection analyses (FEL, MEME, aBSREL, BUSTED) through a web interface.'
      },
      {
        name: 'PAML', category: 'Reference software',
        url: 'http://abacus.gene.ucl.ac.uk/software/paml.html',
        handoff: 'none',
        featured: true,
        description: 'The standard package for codon-based maximum likelihood selection analysis.'
      },
      {
        name: 'DnaSP', category: 'Population genetics',
        url: 'http://www.ub.edu/dnasp/',
        handoff: 'none',
        description: 'Nucleotide diversity, neutrality tests and sliding-window polymorphism analysis.'
      },
      {
        name: 'TBtools Ka/Ks', category: 'Simple calculator',
        url: 'https://github.com/CJ-Chen/TBtools-II',
        handoff: 'none',
        description: 'Built-in Simple Ka/Ks calculator for pairwise comparison of duplicated genes.'
      },
      {
        name: 'PAL2NAL', category: 'Alignment conversion',
        url: 'http://www.bork.embl.de/pal2nal/',
        handoff: 'clipboard',
        description: 'Converts a protein alignment plus CDS into the codon alignment these methods require.'
      }
    ]
  },

  {
    step: 19,
    title: 'Expression Pattern Analysis',
    short: 'Expression',
    icon: 'fa-chart-column',
    accepts: 'none',
    description:
      'Profile expression across tissues, developmental stages and stress conditions. Expression ' +
      'evidence is what turns a sequence-level description into a functional hypothesis you can test.',
    guidance: [
      'Log-transform expression values before building heatmaps, or a few highly expressed genes will dominate.',
      'Tissue-specific or stress-induced expression is the most common basis for prioritizing candidates.',
      'Validate the key findings by qRT-PCR — public expression atlases have real limitations.'
    ],
    tools: [
      {
        name: 'Expression Atlas', category: 'Primary resource',
        url: 'https://www.ebi.ac.uk/gxa/home',
        handoff: 'none',
        featured: true,
        description: 'Curated, reanalyzed expression data across species, tissues and experimental conditions.'
      },
      {
        name: 'BAR eFP Browser', category: 'Visualization',
        url: 'https://bar.utoronto.ca/efp/cgi-bin/efpWeb.cgi',
        handoff: 'none',
        featured: true,
        description: 'Paints expression levels onto anatomical diagrams — highly effective in figures.'
      },
      {
        name: 'Phytozome', category: 'Plant expression',
        url: 'https://phytozome-next.jgi.doe.gov/',
        handoff: 'none',
        description: 'Gene atlas expression data alongside the genome annotation.'
      },
      {
        name: 'NCBI GEO', category: 'Raw data',
        url: 'https://www.ncbi.nlm.nih.gov/geo/',
        handoff: 'none',
        description: 'The primary archive of functional genomics datasets for custom reanalysis.'
      },
      {
        name: 'ATTED-II', category: 'Co-expression',
        url: 'https://atted.jp/',
        handoff: 'none',
        description: 'Co-expression networks — guilt-by-association evidence for gene function.'
      },
      {
        name: 'TBtools Heatmap', category: 'Visualization',
        url: 'https://github.com/CJ-Chen/TBtools-II',
        handoff: 'none',
        description: 'Generates clustered expression heatmaps from a simple value matrix.'
      }
    ]
  }
];

/** Flat, de-duplicated list of every tool for the searchable directory. */
function allTools() {
  const seen = new Map();
  for (const step of PROTOCOL_STEPS) {
    for (const tool of step.tools) {
      if (!seen.has(tool.url)) {
        seen.set(tool.url, { ...tool, steps: [step.step] });
      } else {
        seen.get(tool.url).steps.push(step.step);
      }
    }
  }
  return Array.from(seen.values());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROTOCOL_STEPS, allTools };
}
if (typeof window !== 'undefined') {
  window.PROTOCOL_STEPS = PROTOCOL_STEPS;
  window.allTools = allTools;
}

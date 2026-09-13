export type EvaluationStatus = 'good' | 'warn' | 'bad';

export interface PipelineMetrics {
  file?: string;
  unique_colors: number;
  palette_score_16: number;
  edge_hardness: number;
  flatness: number;
  hue_entropy: number;
  pixel_grid: number;
  pixel_size: number;
  subject_coherence: number;
  local_variation: number;
}

export interface PipelineCriterion {
  id: string;
  label: string;
  score: number;
  status: EvaluationStatus;
  value: string;
  description: string;
  measures: string;
}

export interface EvaluationSection {
  score: number;
  label: string;
  summary: string;
  criteria: PipelineCriterion[];
}

export interface PipelineEvaluation {
  scoringVersion: 3;
  pixelStructure: EvaluationSection;
  visualReadability: EvaluationSection;
  palette: PipelineCriterion;
  metrics: PipelineMetrics;
  evaluatedAt: string;
}

export interface ImageEvaluation {
  path: string;
  pipeline?: PipelineEvaluation;
  updatedAt: string;
}

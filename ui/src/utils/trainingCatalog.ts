export interface TrainingRun {
  outputId: string;
  modelId: string;
  iteration: 1 | 2 | 3;
  trainingNumber: number;
  loraName: string;
  platform: 'Local' | 'Modal A100';
  status: 'Completado' | 'Fallido' | 'En curso';
  modelLabel: string;
}

export const BASE_GENERATION_OUTPUT_ID = 'flux_base';
export const BASE_GENERATION_LABEL = 'Modelo Flux base, sin entrenamiento';

export interface GenerationModelOption {
  value: string;
  label: string;
}

export const TRAINING_RUNS: TrainingRun[] = [
  {
    outputId: 'iter_01',
    modelId: 'iter_01',
    iteration: 1,
    trainingNumber: 1,
    loraName: 'pixel_art_lora_v1',
    platform: 'Local',
    status: 'Completado',
    modelLabel: 'Iteracion 1 - Entrenamiento 1 (LoRA v1)',
  },
  {
    outputId: 'iter_02',
    modelId: 'iter_02',
    iteration: 2,
    trainingNumber: 2,
    loraName: 'pixel_art_lora_v2',
    platform: 'Local',
    status: 'Completado',
    modelLabel: 'Iteracion 2 - Entrenamiento 2 (LoRA v2)',
  },
  {
    outputId: 'iter_03',
    modelId: 'iter_03',
    iteration: 3,
    trainingNumber: 3,
    loraName: 'pixel_art_lora_v3',
    platform: 'Modal A100',
    status: 'Fallido',
    modelLabel: 'Iteracion 3 - Entrenamiento 3 (LoRA v3, fallido)',
  },
  {
    outputId: 'iter_03_Arreglo',
    modelId: 'iter_03_Arreglo',
    iteration: 3,
    trainingNumber: 4,
    loraName: 'pixel_art_lora_v3_Arreglo',
    platform: 'Modal A100',
    status: 'Completado',
    modelLabel: 'Iteracion 3 - Entrenamiento 4 (LoRA v3 Arreglo)',
  },
  {
    outputId: 'iter_04',
    modelId: 'iter_04',
    iteration: 3,
    trainingNumber: 5,
    loraName: 'pixel_art_lora_v4',
    platform: 'Modal A100',
    status: 'Completado',
    modelLabel: 'Iteracion 3 - Entrenamiento 5 (LoRA v4)',
  },
];

const trainingByOutputId = new Map(TRAINING_RUNS.map(training => [training.outputId, training]));
const trainingByModelId = new Map(TRAINING_RUNS.map(training => [training.modelId, training]));
const trainingOrder = new Map(TRAINING_RUNS.map((training, index) => [training.outputId, index]));

export const GENERATION_MODEL_OPTIONS: GenerationModelOption[] = [
  { value: 'base', label: BASE_GENERATION_LABEL },
  ...TRAINING_RUNS.map(training => ({
    value: training.modelId,
    label: training.modelLabel,
  })),
];

export const VALID_GENERATION_MODEL_IDS = GENERATION_MODEL_OPTIONS.map(option => option.value);

export const DATASET_LABELS: Record<string, string> = {
  iter_01: 'Iteracion 1 - Dataset entrenamiento 1',
  iter_02: 'Iteracion 2 - Dataset entrenamiento 2',
  iter_03: 'Iteracion 3 - Dataset entrenamientos 3 y 4',
  iter_03_captions_medios: 'Iteracion 3 - Dataset entrenamiento 5 (captions medios)',
};

export function getTrainingByOutputId(outputId: string): TrainingRun | undefined {
  return trainingByOutputId.get(outputId);
}

export function getTrainingByModelId(modelId: string): TrainingRun | undefined {
  return trainingByModelId.get(modelId);
}

export function sortTrainingOutputIds(outputIds: string[]): string[] {
  return [...outputIds].sort((a, b) => {
    if (a === BASE_GENERATION_OUTPUT_ID && b !== BASE_GENERATION_OUTPUT_ID) return -1;
    if (b === BASE_GENERATION_OUTPUT_ID && a !== BASE_GENERATION_OUTPUT_ID) return 1;

    const aOrder = trainingOrder.get(a);
    const bOrder = trainingOrder.get(b);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function formatTrainingTitle(outputId: string): string {
  if (outputId === BASE_GENERATION_OUTPUT_ID) return BASE_GENERATION_LABEL;
  const training = getTrainingByOutputId(outputId);
  return training ? `Entrenamiento ${training.trainingNumber}` : outputId;
}

export function formatTrainingFullLabel(outputId: string): string {
  if (outputId === BASE_GENERATION_OUTPUT_ID) return BASE_GENERATION_LABEL;
  const training = getTrainingByOutputId(outputId);
  return training ? `Iteracion ${training.iteration} - Entrenamiento ${training.trainingNumber}` : outputId;
}

export function formatGenerationModelLabel(modelId: string): string {
  if (modelId === 'base') return BASE_GENERATION_LABEL;
  return getTrainingByModelId(modelId)?.modelLabel ?? `${modelId} (LoRA generado)`;
}

export function formatDatasetLabel(datasetName: string): string {
  if (datasetName === 'pixilart') return datasetName;
  return DATASET_LABELS[datasetName] ?? datasetName;
}

export function getGenerationModelOptions(outputIds: string[] = []): GenerationModelOption[] {
  const options = [...GENERATION_MODEL_OPTIONS];
  const knownModelIds = new Set(options.map(option => option.value));

  for (const outputId of sortTrainingOutputIds(outputIds)) {
    if (outputId === BASE_GENERATION_OUTPUT_ID) continue;
    if (getTrainingByOutputId(outputId)) continue;
    if (knownModelIds.has(outputId)) continue;

    options.push({
      value: outputId,
      label: formatGenerationModelLabel(outputId),
    });
    knownModelIds.add(outputId);
  }

  return options;
}

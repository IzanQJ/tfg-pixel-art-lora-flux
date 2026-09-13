import { JobConfig, DatasetConfig, SliderConfig } from '@/types';

export const defaultDatasetConfig: DatasetConfig = {
  folder_path: '/path/to/images/folder',
  mask_path: null,
  mask_min_value: 0.1,
  default_caption: '',
  caption_ext: 'txt',
  caption_dropout_rate: 0.05,
  cache_latents_to_disk: true,
  is_reg: false,
  network_weight: 1,
  resolution: [512],
  controls: [],
  shrink_video_to_frames: true,
  num_frames: 1,
  flip_x: false,
  flip_y: false,
  num_repeats: 1,
};

export const defaultSliderConfig: SliderConfig = {
  guidance_strength: 3.0,
  anchor_strength: 1.0,
  positive_prompt: 'person who is happy',
  negative_prompt: 'person who is sad',
  target_class: 'person',
  anchor_class: '',
};

export const defaultJobConfig: JobConfig = {
  job: 'extension',
  config: {
    name: 'pixel_art_lora_v1',
    process: [
      {
        type: 'diffusion_trainer',
        training_folder: 'outputs/iter_01',
        sqlite_db_path: './aitk_db.db',
        device: 'cuda:0',
        trigger_word: 'pixelart',
        performance_log_every: 100,
        network: {
          type: 'lora',
          linear: 16,
          linear_alpha: 16,
          conv: 16,
          conv_alpha: 16,
          lokr_full_rank: true,
          lokr_factor: -1,
          network_kwargs: {
            ignore_if_contains: [],
          },
        },
        save: {
          dtype: 'float16',
          save_every: 100,
          max_step_saves_to_keep: 4,
          save_format: 'safetensors',
          push_to_hub: false,
        },
        datasets: [defaultDatasetConfig],
        train: {
          batch_size: 1,
          bypass_guidance_embedding: false,
          steps: 500,
          gradient_accumulation: 1,
          train_unet: true,
          train_text_encoder: false,
          gradient_checkpointing: true,
          noise_scheduler: 'flowmatch',
          optimizer: 'adamw8bit',
          content_or_style: 'balanced',
          optimizer_params: {
            weight_decay: 1e-4,
          },
          unload_text_encoder: false,
          cache_text_embeddings: false,
          lr: 0.0001,
          ema_config: {
            use_ema: true,
            ema_decay: 0.99,
          },
          skip_first_sample: false,
          force_first_sample: false,
          disable_sampling: false,
          dtype: 'bf16',
          diff_output_preservation: false,
          diff_output_preservation_multiplier: 1.0,
          diff_output_preservation_class: 'person',
          switch_boundary_every: 1,
          loss_type: 'mse',
        },
        logging: {
          log_every: 1,
          use_ui_logger: true,
        },
        model: {
          name_or_path: 'black-forest-labs/FLUX.1-dev',
          quantize: true,
          qtype: 'qfloat8',
          quantize_te: false,
          arch: 'flux',
          low_vram: false,
          model_kwargs: {},
        },
        sample: {
          sampler: 'flowmatch',
          sample_every: 100,
          width: 512,
          height: 512,
          samples: [
            { prompt: 'pixelart, a small knight character with sword and shield, retro game style' },
            { prompt: 'pixelart, a treasure chest in a dungeon, torch lighting, stone walls' },
            { prompt: 'pixelart, a forest scene with trees and a path, vibrant colors' },
            { prompt: 'pixelart, a spaceship flying through asteroid field, stars background' },
            { prompt: 'pixelart, a cute slime monster, green, bouncing animation frame' },
            { prompt: 'pixelart, medieval castle on a hill, sunset sky, fantasy' },
            { prompt: 'pixelart, robot character, futuristic, standing pose' },
            { prompt: 'pixelart, potion bottles on wooden shelf, magical glow' },
          ],
          neg: '',
          seed: 42,
          walk_seed: true,
          guidance_scale: 4,
          sample_steps: 20,
          num_frames: 1,
          fps: 1,
        },
      },
    ],
  },
  meta: {
    name: '[name]',
    version: '1.0',
  },
};

export const migrateJobConfig = (jobConfig: JobConfig): JobConfig => {
  // upgrade prompt strings to samples
  if (
    jobConfig?.config?.process &&
    jobConfig.config.process[0]?.sample &&
    Array.isArray(jobConfig.config.process[0].sample.prompts) &&
    jobConfig.config.process[0].sample.prompts.length > 0
  ) {
    let newSamples = [];
    for (const prompt of jobConfig.config.process[0].sample.prompts) {
      newSamples.push({
        prompt: prompt,
      });
    }
    jobConfig.config.process[0].sample.samples = newSamples;
    delete jobConfig.config.process[0].sample.prompts;
  }

  // upgrade job from ui_trainer to diffusion_trainer
  if (jobConfig?.config?.process && jobConfig.config.process[0]?.type === 'ui_trainer') {
    jobConfig.config.process[0].type = 'diffusion_trainer';
  }

  // upgrade job from sd_trainer to diffusion_trainer
  if (jobConfig?.config?.process && jobConfig.config.process[0]?.type === 'sd_trainer') {
    jobConfig.config.process[0].type = 'diffusion_trainer';
  }

  // upgrade is_flux: true → arch: 'flux' + qtype
  if (jobConfig?.config?.process && jobConfig.config.process[0]?.model) {
    const model = jobConfig.config.process[0].model;
    if ((model as any).is_flux === true && !model.arch) {
      model.arch = 'flux';
      if (model.quantize && !model.qtype) {
        model.qtype = 'qfloat8';
        model.quantize_te = true;
        model.qtype_te = 'qfloat8';
      }
      delete (model as any).is_flux;
    }
  }

  // upgrade gradient_accumulation_steps → gradient_accumulation
  if (jobConfig?.config?.process && jobConfig.config.process[0]?.train) {
    const train = jobConfig.config.process[0].train;
    if ('gradient_accumulation_steps' in train) {
      train.gradient_accumulation = (train as any).gradient_accumulation_steps;
      delete (train as any).gradient_accumulation_steps;
    }
  }

  if ('auto_memory' in jobConfig.config.process[0].model) {
    jobConfig.config.process[0].model.layer_offloading = (jobConfig.config.process[0].model.auto_memory ||
      false) as boolean;
    delete jobConfig.config.process[0].model.auto_memory;
  }

  if (!('logging' in jobConfig.config.process[0])) {
    //@ts-ignore
    jobConfig.config.process[0].logging = {
      log_every: 1,
      use_ui_logger: true,
    };
  }
  return jobConfig;
};

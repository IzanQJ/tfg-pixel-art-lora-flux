#!/usr/bin/env python3
"""
generate_captions.py — Auto-caption images using Qwen2.5-VL via HuggingFace.

Usage:
    python scripts/tfg/generate_captions.py \
        --images caption_groups/<group_id>/images \
        --output caption_groups/<group_id>/captions.auto.csv \
        --progress-file caption_groups/<group_id>/progress.json \
        --trigger-word pixelart \
        --detail-level medium \
        --model-name Qwen/Qwen2.5-VL-7B-Instruct \
        --overwrite-mode empty_only

Requirements (inside venv):
    pip install transformers accelerate bitsandbytes qwen-vl-utils pillow torch torchvision
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

ALLOWED_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}

DETAIL_PROMPTS = {
    'short': (
        "You are writing captions for LoRA style training. Your goal is to teach a model WHAT STYLE this is, not describe the image content.\n"
        "Write ONE caption of 8-12 words total.\n"
        "Format strictly: [trigger_word], [subject in 3-5 words], [1-2 style tags]\n"
        "Allowed style tags ONLY: pixel art, sprite, 8-bit, 16-bit, retro, isometric, top-down, side-view, limited palette, dithered, chunky pixels.\n"
        "DO NOT describe colors, mood, background, composition, or canvas size. DO NOT write sentences. Just a short label."
    ),
    'medium': (
        "You are writing structured captions for LoRA training. Output ONLY a comma-separated list of tags — no sentences, no periods.\n"
        "Follow this exact structure:\n"
        "  pixelart, [category], [view/perspective], [subject description with 2-4 specific visual details], [style tags]\n\n"
        "Category options: character, scene, icon, item, environment, creature, vehicle, building\n"
        "View options: front view, side view, top-down, isometric, 3/4 view, full body, close-up\n"
        "Subject details: describe main subject, colors used, key visual elements (2-4 comma-separated tags)\n"
        "Always end with these fixed style tags: limited palette, hard edges, cluster shading, retro game style\n\n"
        "Example output: pixelart, character, full body, side view, armored knight with sword, blue and silver colors, black outline, limited palette, hard edges, cluster shading, retro game style\n"
        "Example output: pixelart, scene, isometric, stone dungeon room, torch on wall, treasure chest, dark tones, limited palette, hard edges, cluster shading, retro game style\n\n"
        "DO NOT write sentences. DO NOT add explanations. Output only the comma-separated tag list."
    ),
    'detailed': (
        "You are writing captions for LoRA style training. Your goal is to describe both the subject and the pixel art style.\n"
        "Write 1-2 short sentences, 20-35 words maximum.\n"
        "Include: main subject, brief setting, and specific pixel art technique descriptors.\n"
        "Technique descriptors to use: pixel art, sprite, 8-bit/16-bit, retro, isometric/top-down/side-view, "
        "limited palette, dithered, chunky pixels, outlined sprites, tile-based, indexed color.\n"
        "DO NOT write long prose. DO NOT describe mood, atmosphere, gradients, or overall composition in depth. Stay concise and training-focused."
    ),
}


def build_prompt(base_prompt: str, image_name: str, titles_data: dict) -> str:
    """Enhance the prompt with author-provided metadata as comprehension hints only."""
    meta = titles_data.get(image_name, {})
    title = meta.get('title', '').strip()
    tags = meta.get('tags', [])
    canvas = meta.get('canvas_size_label', '')

    hints = []
    if title:
        hints.append(f'title hint: "{title}"')
    if tags:
        hints.append(f'tags: {", ".join(tags)}')

    prompt = base_prompt
    if hints:
        context = '; '.join(hints)
        prompt = (
            f'[Context to help you understand the image — do NOT copy or mention these literally in your description: {context}]\n\n'
            f'{prompt}'
        )
    if canvas:
        prompt = f'{prompt}\nCanvas resolution: {canvas}.'
    return prompt


def write_progress(path: Path, status: str, total: int, completed: int, current_file: str, error: str = ''):
    data = {
        'status': status,
        'total': total,
        'completed': completed,
        'current_file': current_file,
        'error': error,
        'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')


def load_existing_captions(csv_path: Path) -> dict[str, str]:
    """Load existing captions from CSV."""
    result = {}
    if not csv_path.exists():
        return result
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if 'file' in row:
                result[row['file']] = row.get('caption', '')
    return result


def save_captions(csv_path: Path, captions: dict[str, str]):
    """Write captions dict to CSV."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['file', 'caption'])
        writer.writeheader()
        for filename, caption in sorted(captions.items()):
            writer.writerow({'file': filename, 'caption': caption})


def normalize_trigger(caption: str, trigger: str) -> str:
    """Prepend trigger word if not already present."""
    c = caption.strip()
    if not c:
        return c
    lower = c.lower()
    trigger_lower = trigger.lower()
    if lower.startswith(trigger_lower + ',') or lower.startswith(trigger_lower + ' ') or lower == trigger_lower:
        return c
    return f'{trigger}, {c}'


def load_model(model_name: str):
    """Load Qwen2.5-VL model with 4-bit quantization."""
    print(f'[generate_captions] Loading model: {model_name}', flush=True)

    from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor, BitsAndBytesConfig
    import torch

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type='nf4',
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )

    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        device_map='auto',
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )
    model.eval()

    processor = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)
    print('[generate_captions] Model loaded.', flush=True)
    return model, processor


def caption_image(model, processor, image_path: Path, prompt: str) -> str:
    """Generate a caption for a single image."""
    from PIL import Image
    import torch
    from qwen_vl_utils import process_vision_info

    image = Image.open(image_path).convert('RGB')

    messages = [
        {
            'role': 'user',
            'content': [
                {'type': 'image', 'image': image},
                {'type': 'text', 'text': prompt},
            ],
        }
    ]

    text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    image_inputs, video_inputs = process_vision_info(messages)

    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors='pt',
    ).to(model.device)

    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=200,
            do_sample=False,
            temperature=None,
            top_p=None,
        )

    generated_ids_trimmed = [
        out_ids[len(in_ids):]
        for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
    ]
    output_text = processor.batch_decode(
        generated_ids_trimmed,
        skip_special_tokens=True,
        clean_up_tokenization_spaces=False,
    )
    return output_text[0].strip()


def main():
    parser = argparse.ArgumentParser(description='Auto-caption pixel art images using Qwen2.5-VL')
    parser.add_argument('--images', required=True, help='Directory with source images')
    parser.add_argument('--output', required=True, help='Output captions.auto.csv path')
    parser.add_argument('--progress-file', required=True, help='progress.json path')
    parser.add_argument('--trigger-word', default='pixelart', help='Trigger word prefix')
    parser.add_argument('--detail-level', choices=['short', 'medium', 'detailed'], default='medium')
    parser.add_argument('--model-name', default='Qwen/Qwen2.5-VL-7B-Instruct')
    parser.add_argument('--overwrite-mode', choices=['empty_only', 'overwrite_all'], default='empty_only')
    parser.add_argument('--titles-file', default='', help='Path to titles.json with image metadata')
    args = parser.parse_args()

    # Redirect all stdout/stderr to a log file next to the progress file
    log_path = Path(args.progress_file).parent / 'generate.log'
    log_file = open(log_path, 'w', encoding='utf-8', buffering=1)
    sys.stdout = log_file
    sys.stderr = log_file

    images_dir = Path(args.images)
    output_path = Path(args.output)
    progress_path = Path(args.progress_file)

    # Load titles metadata if provided
    titles_data: dict = {}
    if args.titles_file and Path(args.titles_file).exists():
        with open(args.titles_file, encoding='utf-8') as f:
            titles_data = json.load(f)
        print(f'[generate_captions] Loaded titles for {len(titles_data)} images.', flush=True)

    # Collect image files
    image_files = sorted([
        f for f in images_dir.iterdir()
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTS
    ])

    total = len(image_files)
    if total == 0:
        write_progress(progress_path, 'done', 0, 0, '')
        print('[generate_captions] No images found.', flush=True)
        return

    # Load existing captions
    existing = load_existing_captions(output_path)

    # Determine which files to process
    to_process = []
    for f in image_files:
        current_caption = existing.get(f.name, '')
        if args.overwrite_mode == 'empty_only' and current_caption.strip():
            continue  # skip — already has caption
        to_process.append(f)

    print(f'[generate_captions] {len(to_process)}/{total} images to caption.', flush=True)
    write_progress(progress_path, 'running', total, 0, '')

    if not to_process:
        write_progress(progress_path, 'done', total, total, '')
        return

    # Load model
    try:
        model, processor = load_model(args.model_name)
    except Exception as e:
        write_progress(progress_path, 'error', total, 0, '', str(e))
        print(f'[generate_captions] ERROR loading model: {e}', file=sys.stderr, flush=True)
        sys.exit(1)

    prompt = DETAIL_PROMPTS[args.detail_level]
    completed = 0
    captions = dict(existing)  # start from existing

    for img_path in to_process:
        write_progress(progress_path, 'running', total, completed, img_path.name)
        try:
            image_prompt = build_prompt(prompt, img_path.name, titles_data)
            raw_caption = caption_image(model, processor, img_path, image_prompt)
            final_caption = normalize_trigger(raw_caption, args.trigger_word)
            captions[img_path.name] = final_caption
            print(f'[generate_captions] [{completed + 1}/{len(to_process)}] {img_path.name}: {final_caption[:80]}', flush=True)
        except Exception as e:
            print(f'[generate_captions] ERROR on {img_path.name}: {e}', file=sys.stderr, flush=True)
            captions[img_path.name] = captions.get(img_path.name, '')

        completed += 1
        # Save incrementally every 5 images
        if completed % 5 == 0:
            save_captions(output_path, captions)

    # Final save
    save_captions(output_path, captions)
    write_progress(progress_path, 'done', total, total, '')
    print('[generate_captions] Done.', flush=True)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Extrae métricas técnicas de imágenes para el sistema de evaluación de la
Iteración 3.

El script devuelve medidas objetivas en bruto. La API de la UI las convierte
en dos notas independientes:

  Construcción pixel art
    - Tamaño y cuadrícula: pixel_grid + pixel_size
    - Curvas escalonadas: pixel_grid + edge_hardness + flatness
    - Bordes sin suavizado: edge_hardness

  Lectura visual experimental
    - Coherencia de la figura: subject_coherence
    - Ruido que dificulta la lectura: local_variation

La paleta compacta se calcula aparte con palette_score_16 y unique_colors; no
modifica ninguna de las dos notas principales.

hue_entropy se conserva para comparaciones por CLI, pero no interviene en las
notas actuales de la UI. flatness se usa como apoyo para las curvas escalonadas.

Métricas calculadas por imagen:
  unique_colors     : colores únicos tras reducción a 5 bits/canal
  palette_score_16  : PSNR tras cuantizar a 16 colores; mayor conserva más información
  edge_hardness     : fracción de bordes fuertes; mayor implica menos antialias
  flatness          : proporción de zonas localmente estables
  hue_entropy       : variedad de matices en bits
  pixel_grid        : alineación de cambios de color con una cuadrícula regular
  pixel_size        : tamaño base estimado del píxel ampliado, entre 2 y 16 px
  subject_coherence : proporción del primer plano en la mayor figura conectada
  local_variation   : frecuencia de cambios de color vecinos; menor implica menos ruido

Referencias orientativas para una imagen pixel art limpia:
  unique_colors     : 8–64
  palette_score_16  : > 30 dB
  edge_hardness     : > 0.70
  flatness          : > 0.50
  hue_entropy       : < 1.5 bits
  pixel_grid        : > 0.30
  subject_coherence : > 0.75 cuando existe un único sujeto principal
  local_variation   : < 0.20

Limitaciones:
  - No identifica qué objeto representa la imagen ni comprueba el prompt.
  - No evalúa belleza, composición, anatomía o preferencia estética.
  - La lectura visual es experimental y funciona mejor con un sujeto principal
    separado de un fondo relativamente uniforme.

Uso:
  # Analizar una sola carpeta
  python scripts/tfg/evaluate_style.py \\
    --images outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/samples

  # Comparar varios entrenamientos en una tabla
  python scripts/tfg/evaluate_style.py \\
    --images outputs/iter_01/pixel_art_lora_v1/samples \\
             outputs/iter_02/pixel_art_lora_v2/samples \\
             outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/samples \\
             output/pixel_art_lora_v4/samples \\
    --labels entrenamiento_1 entrenamiento_2 entrenamiento_4 entrenamiento_5 \\
    --output results/style_comparison.json

  # Incluir el dataset de referencia como línea base
  python scripts/tfg/evaluate_style.py \\
    --images outputs/iter_03_Arreglo/pixel_art_lora_v3_Arreglo/samples \\
    --reference datasets/iter_03_captions_medios/images \\
    --labels generado referencia
"""

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from PIL import Image

try:
    import cv2
except ModuleNotFoundError:
    cv2 = None

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


# ---------------------------------------------------------------------------
# Métricas individuales
# ---------------------------------------------------------------------------

def _load_rgb(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    return np.array(img)


def metric_unique_colors(rgb: np.ndarray) -> int:
    """
    Cuenta colores únicos tras reducir a 5 bits por canal.
    Reduce el ruido de compresión JPEG (que crea miles de variantes de color
    casi iguales) sin destruir la paleta real del pixel art.
    """
    reduced = (rgb >> 3).astype(np.uint32)  # 0-31 por canal
    encoded = reduced[:, :, 0] * 1024 + reduced[:, :, 1] * 32 + reduced[:, :, 2]
    return int(np.unique(encoded).shape[0])


def metric_palette_score(rgb: np.ndarray, n_colors: int = 16) -> float:
    """
    PSNR (dB) entre la imagen original y su versión cuantizada a n_colors.
    Cuanto mayor el PSNR, menos información se pierde al forzar una paleta
    reducida, es decir, la imagen ya se parece a pixel art de paleta limitada.
    """
    pil = Image.fromarray(rgb)
    pil_q = pil.quantize(colors=n_colors, method=0).convert("RGB")  # method=0: median-cut
    orig = rgb.astype(np.float32)
    quant = np.array(pil_q).astype(np.float32)
    mse = float(np.mean((orig - quant) ** 2))
    if mse < 0.01:
        return 60.0
    return round(10.0 * math.log10(255.0 ** 2 / mse), 2)


def metric_edge_hardness(rgb: np.ndarray) -> float:
    """
    Fracción de píxeles de borde con gradiente alto (borde duro)
    sobre el total de píxeles de borde (gradiente > umbral mínimo).

    El pixel art upscaleado con nearest-neighbor tiene únicamente bordes en
    escalón (gradiente máximo de golpe) → valor cercano a 1.0.
    Las imágenes con antialias tienen transiciones graduales → valor más bajo.
    """
    if cv2 is not None:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    else:
        gray = (
            rgb[:, :, 0].astype(np.float32) * 0.299
            + rgb[:, :, 1].astype(np.float32) * 0.587
            + rgb[:, :, 2].astype(np.float32) * 0.114
        )
        padded = np.pad(gray, 1, mode="edge")
        gx = (
            -padded[:-2, :-2] + padded[:-2, 2:]
            - 2 * padded[1:-1, :-2] + 2 * padded[1:-1, 2:]
            - padded[2:, :-2] + padded[2:, 2:]
        )
        gy = (
            -padded[:-2, :-2] - 2 * padded[:-2, 1:-1] - padded[:-2, 2:]
            + padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
        )
    mag = np.sqrt(gx ** 2 + gy ** 2)
    max_mag = float(mag.max())
    if max_mag < 1.0:
        return 0.0
    low_thresh = max_mag * 0.08   # «hay borde»
    high_thresh = max_mag * 0.35  # «borde duro»
    n_edges = int((mag > low_thresh).sum())
    n_hard = int((mag > high_thresh).sum())
    if n_edges == 0:
        return 0.0
    return round(n_hard / n_edges, 4)


def metric_flatness(rgb: np.ndarray, tol: int = 8) -> float:
    """
    Fracción de píxeles que son iguales (dentro de tolerancia) tanto a su
    vecino derecho como a su vecino inferior.

    En pixel art con bloques de N×N píxeles idénticos, la mayoría de los
    píxeles son interiores al bloque → flatness alta.
    En imágenes con ruido o gradientes suaves → flatness baja.
    """
    a = rgb.astype(np.int16)
    h_diff = np.max(np.abs(a[:, :-1, :] - a[:, 1:, :]), axis=2)   # (H, W-1)
    v_diff = np.max(np.abs(a[:-1, :, :] - a[1:, :, :]), axis=2)    # (H-1, W)
    h_flat = h_diff[:-1, :] <= tol   # (H-1, W-1)
    v_flat = v_diff[:, :-1] <= tol   # (H-1, W-1)
    return round(float((h_flat & v_flat).mean()), 4)


def metric_hue_entropy(rgb: np.ndarray) -> float:
    """
    Entropía de Shannon (bits) del histograma de matiz (canal H en HSV).
    Pixel art con paleta limitada usa pocos tonos → entropía baja.
    Imágenes fotorrealistas o con muchos colores → entropía alta.
    """
    if cv2 is not None:
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        hue = hsv[:, :, 0]
        hue_range = (0, 180)
    else:
        hsv = np.array(Image.fromarray(rgb).convert("HSV"))
        hue = hsv[:, :, 0]
        hue_range = (0, 256)
    hist, _ = np.histogram(hue, bins=36, range=hue_range)
    hist = hist.astype(np.float64)
    hist = hist[hist > 0]
    prob = hist / hist.sum()
    entropy = float(-np.sum(prob * np.log2(prob)))
    return round(entropy, 4)


def metric_pixel_grid(rgb: np.ndarray, min_size: int = 2, max_size: int = 16) -> tuple[float, int]:
    """
    Estima si los cambios de color se concentran en una cuadrícula regular.

    Cuando una imagen se ha construido con un píxel base de N×N, la mayoría de
    cambios verticales y horizontales coinciden en la misma posición módulo N.
    Una imagen pintada, suavizada o con bloques de tamaños arbitrarios reparte
    esos cambios por todas las posiciones.
    """
    reduced = ((rgb.astype(np.int16) // 8) * 8).astype(np.int16)
    h_diff = np.max(np.abs(reduced[:, 1:, :] - reduced[:, :-1, :]), axis=2)
    v_diff = np.max(np.abs(reduced[1:, :, :] - reduced[:-1, :, :]), axis=2)
    h_energy = (h_diff > 8).sum(axis=0).astype(np.float64)
    v_energy = (v_diff > 8).sum(axis=1).astype(np.float64)

    best_alignment = 0.0
    best_size = 1
    for size in range(min_size, min(max_size, rgb.shape[0] // 4, rgb.shape[1] // 4) + 1):
        h_bins = np.array([
            h_energy[np.arange(h_energy.size) % size == offset].sum()
            for offset in range(size)
        ])
        v_bins = np.array([
            v_energy[np.arange(v_energy.size) % size == offset].sum()
            for offset in range(size)
        ])

        expected = 1.0 / size
        h_peak = float(h_bins.max() / max(h_bins.sum(), 1.0))
        v_peak = float(v_bins.max() / max(v_bins.sum(), 1.0))
        h_alignment = max(0.0, (h_peak - expected) / (1.0 - expected))
        v_alignment = max(0.0, (v_peak - expected) / (1.0 - expected))
        alignment = (h_alignment + v_alignment) / 2.0

        if alignment > best_alignment:
            best_alignment = alignment
            best_size = size

    return round(best_alignment, 4), best_size


def _largest_component_ratio(mask: np.ndarray) -> float:
    """Devuelve qué parte del primer plano pertenece al componente más grande."""
    total = int(mask.sum())
    if total < 128:
        return 0.0

    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    largest = 0

    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue

        stack = [(int(y), int(x))]
        seen[y, x] = True
        size = 0
        while stack:
            current_y, current_x = stack.pop()
            size += 1
            for delta_y, delta_x in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                next_y = current_y + delta_y
                next_x = current_x + delta_x
                if (
                    0 <= next_y < height
                    and 0 <= next_x < width
                    and mask[next_y, next_x]
                    and not seen[next_y, next_x]
                ):
                    seen[next_y, next_x] = True
                    stack.append((next_y, next_x))

        largest = max(largest, size)

    return largest / total


def metric_subject_coherence(rgb: np.ndarray) -> float:
    """
    Estima si hay una forma principal coherente separada del fondo.

    Se obtiene una paleta aproximada del borde de la imagen, se considera primer
    plano aquello que se aleja de esos colores y se mide cuánto de ese primer
    plano pertenece a una única forma conectada. No identifica semánticamente
    el objeto; mide la facilidad con la que se lee su silueta.
    """
    resampling = getattr(Image, "Resampling", Image).NEAREST
    reduced = (
        Image.fromarray(rgb)
        .quantize(colors=16, method=0)
        .convert("RGB")
        .resize((128, 128), resampling)
    )
    image = np.array(reduced).astype(np.int16)
    border_size = 8
    border = np.concatenate([
        image[:border_size].reshape(-1, 3),
        image[-border_size:].reshape(-1, 3),
        image[:, :border_size].reshape(-1, 3),
        image[:, -border_size:].reshape(-1, 3),
    ])
    colors, counts = np.unique(border, axis=0, return_counts=True)
    background = colors[np.argsort(counts)[-4:]]
    distances = np.sqrt(
        ((image[:, :, None, :] - background[None, None, :, :]).astype(np.float32) ** 2).sum(axis=3)
    ).min(axis=2)

    ratios = [
        _largest_component_ratio(distances > threshold)
        for threshold in (30, 45, 60)
    ]
    return round(float(np.mean(ratios)), 4)


def metric_local_variation(rgb: np.ndarray) -> float:
    """
    Frecuencia de cambios de color entre vecinos tras reducir a 4 bits/canal.
    Valores altos indican textura fragmentada o ruido repartido por la imagen.
    """
    reduced = (rgb.astype(np.int16) // 16)
    h_diff = np.max(np.abs(reduced[:, 1:, :] - reduced[:, :-1, :]), axis=2)
    v_diff = np.max(np.abs(reduced[1:, :, :] - reduced[:-1, :, :]), axis=2)
    variation = ((h_diff > 0).mean() + (v_diff > 0).mean()) / 2.0
    return round(float(variation), 4)


def compute_all(path: Path) -> Dict:
    rgb = _load_rgb(path)
    pixel_grid, pixel_size = metric_pixel_grid(rgb)
    return {
        "file": path.name,
        "unique_colors": metric_unique_colors(rgb),
        "palette_score_16": metric_palette_score(rgb, 16),
        "edge_hardness": metric_edge_hardness(rgb),
        "flatness": metric_flatness(rgb),
        "hue_entropy": metric_hue_entropy(rgb),
        "pixel_grid": pixel_grid,
        "pixel_size": pixel_size,
        "subject_coherence": metric_subject_coherence(rgb),
        "local_variation": metric_local_variation(rgb),
    }


# ---------------------------------------------------------------------------
# Agregación y presentación
# ---------------------------------------------------------------------------

def aggregate(metrics: List[Dict]) -> Dict:
    """Calcula estadísticas (mean/std/min/max) para cada métrica."""
    if not metrics:
        return {}
    keys = [k for k in metrics[0] if k != "file"]
    agg = {}
    for k in keys:
        vals = [m[k] for m in metrics if k in m]
        agg[k] = {
            "mean": round(float(np.mean(vals)), 3),
            "std":  round(float(np.std(vals)),  3),
            "min":  round(float(np.min(vals)),  3),
            "max":  round(float(np.max(vals)),  3),
        }
    return agg


_METRIC_COLS = [
    "unique_colors",
    "palette_score_16",
    "edge_hardness",
    "flatness",
    "hue_entropy",
    "pixel_grid",
    "subject_coherence",
    "local_variation",
]
_METRIC_HEADERS = [
    "unique_c",
    "pal16(dB)",
    "edge_hard",
    "flatness",
    "hue_entr",
    "px_grid",
    "subject",
    "variation",
]
_REF_VALUES = {
    "unique_colors":    "8-64",
    "palette_score_16": ">30 dB",
    "edge_hardness":    ">0.70",
    "flatness":         ">0.50",
    "hue_entropy":      "<1.5 b",
    "pixel_grid":        ">0.30",
    "subject_coherence": ">0.75",
    "local_variation":   "<0.20",
}


def print_table(labels: List[str], summaries: List[Dict]):
    COL_W = 12
    label_w = max(max(len(l) for l in labels), len("[ref pixel art]")) + 2
    header = f"{'':>{label_w}}" + "".join(f"{h:>{COL_W}}" for h in _METRIC_HEADERS)
    sep = "-" * len(header)
    print(f"\n{sep}")
    print(header)
    print(sep)
    for label, s in zip(labels, summaries):
        if not s:
            print(f"{label:>{label_w}}" + f"{'(sin datos)':>{COL_W * len(_METRIC_COLS)}}")
            continue
        row = f"{label:>{label_w}}"
        for m in _METRIC_COLS:
            val = s.get(m, {}).get("mean", "-")
            row += f"{str(val):>{COL_W}}"
        print(row)
    print(sep)
    ref_row = f"{'[ref pixel art]':>{label_w}}"
    for m in _METRIC_COLS:
        ref_row += f"{_REF_VALUES[m]:>{COL_W}}"
    print(ref_row)
    print(sep)
    print()


def _iter_images(path: Path) -> List[Path]:
    if path.is_file():
        return [path] if path.suffix.lower() in IMAGE_EXTS else []
    return sorted(p for p in path.iterdir() if p.suffix.lower() in IMAGE_EXTS)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Extrae métricas para la evaluación de imágenes de la Iteración 3",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--images", nargs="+", required=True, metavar="PATH",
                        help="Uno o más archivos o carpetas de imágenes a evaluar")
    parser.add_argument("--reference", metavar="FOLDER",
                        help="Carpeta de dataset real para incluir como referencia")
    parser.add_argument("--labels", nargs="+", metavar="LABEL",
                        help="Etiquetas para cada carpeta (mismo orden que --images)")
    parser.add_argument("--output", metavar="JSON_FILE",
                        help="Guardar resultados completos en un fichero JSON")
    parser.add_argument("--detail", action="store_true",
                        help="Mostrar métricas por imagen además del resumen")
    args = parser.parse_args()

    folders: List[Path] = [Path(p) for p in args.images]
    if args.reference:
        folders.append(Path(args.reference))

    labels: List[str] = list(args.labels or [])
    while len(labels) < len(folders):
        labels.append(folders[len(labels)].name)

    all_summaries: List[Dict] = []
    all_detail: Dict = {}

    for folder, label in zip(folders, labels):
        print(f"\n[{label}]  {folder}")
        if not folder.exists():
            print("  [!] Carpeta no encontrada")
            all_summaries.append({})
            continue

        imgs = _iter_images(folder)
        if not imgs:
            print("  [!] Sin imagenes")
            all_summaries.append({})
            continue

        print(f"  Analizando {len(imgs)} imágenes...")
        per_image: List[Dict] = []
        for p in imgs:
            try:
                m = compute_all(p)
                per_image.append(m)
                if args.detail:
                    print(
                        f"    {m['file']}: "
                        f"colors={m['unique_colors']}  "
                        f"pal16={m['palette_score_16']} dB  "
                        f"edge={m['edge_hardness']}  "
                        f"flat={m['flatness']}  "
                        f"hue={m['hue_entropy']}  "
                        f"grid={m['pixel_grid']}@{m['pixel_size']}px  "
                        f"subject={m['subject_coherence']}  "
                        f"variation={m['local_variation']}"
                    )
            except Exception as e:
                print(f"    [!] {p.name}: {e}")

        s = aggregate(per_image)
        all_summaries.append(s)
        all_detail[label] = {"summary": s, "per_image": per_image}

        if s:
            print(
                f"  unique_colors={s['unique_colors']['mean']}  "
                f"palette_score={s['palette_score_16']['mean']} dB  "
                f"edge_hardness={s['edge_hardness']['mean']}  "
                f"flatness={s['flatness']['mean']}  "
                f"hue_entropy={s['hue_entropy']['mean']}"
            )

    print_table(labels, all_summaries)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(all_detail, f, indent=2, ensure_ascii=False)
        print(f"Resultados guardados en: {args.output}")


if __name__ == "__main__":
    main()

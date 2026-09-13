/**
 * captions.ts — Server-side logic for the Caption Groups feature.
 *
 * Manages:
 *  - Caption group creation, listing, and retrieval
 *  - Image copy from manual_accepted to group
 *  - Caption persistence (captions.csv and per-image .txt)
 *  - Python script launch for Qwen-based auto-captioning
 *  - Progress polling
 *  - Move-to-dataset flow
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import sharp from 'sharp';
import {
  DEFAULT_SCRAPER_FOLDER_ID,
  DEFAULT_SCRAPER_FOLDER_LABEL,
  listScraperFolders,
  normalizeScraperFolderId,
  resolveScraperImagePath,
} from './scraper';

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
export const CAPTION_GROUPS_ROOT = path.join(TOOLKIT_ROOT, 'caption_groups');
export const MANUAL_ACCEPTED_DIR = path.join(
  TOOLKIT_ROOT,
  'datasets',
  'pixilart',
  'filtered',
  'manual_accepted',
);
export const DATASETS_ROOT = path.join(TOOLKIT_ROOT, 'datasets');

const ALLOWED_IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroupStatus = 'draft' | 'generating' | 'review' | 'ready_to_move' | 'moved';

export interface GroupManifest {
  id: string;
  name: string;
  status: GroupStatus;
  created_at: string;
  image_count: number;
  scraper_folder_id?: string;
  scraper_folder_label?: string;
  moved_to?: string;
  moved_at?: string;
}

export interface CaptionRow {
  file: string;
  caption: string;
}

export interface ImageTitleInfo {
  title: string;
  author: string;
  tags: string[];
  canvas_size_label: string | null;
}

export interface GenerateProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  completed: number;
  current_file: string;
  error?: string;
}

export interface GroupImage {
  filename: string;
  url: string;
  caption: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function groupPath(groupId: string): string {
  return path.join(CAPTION_GROUPS_ROOT, groupId);
}

function imagesPath(groupId: string): string {
  return path.join(groupPath(groupId), 'images');
}

function manifestPath(groupId: string): string {
  return path.join(groupPath(groupId), 'manifest.json');
}

function captionsPath(groupId: string): string {
  return path.join(groupPath(groupId), 'captions.csv');
}

function autoCaptionsPath(groupId: string): string {
  return path.join(groupPath(groupId), 'captions.auto.csv');
}

function progressPath(groupId: string): string {
  return path.join(groupPath(groupId), 'progress.json');
}

function titlesPath(groupId: string): string {
  return path.join(groupPath(groupId), 'titles.json');
}

/** Read JSONL and return title metadata keyed by filename */
async function lookupTitles(
  filenames: string[],
  scraperFolderId: string = DEFAULT_SCRAPER_FOLDER_ID,
): Promise<Record<string, ImageTitleInfo>> {
  const result: Record<string, ImageTitleInfo> = {};
  const filenameSet = new Set(filenames);
  const { loadAcceptedManifest } = await import('./scraper');
  const records = await loadAcceptedManifest(scraperFolderId);
  for (const rec of records) {
    const fname = rec.filename || path.basename(rec.local_filtered_path || '');
    if (filenameSet.has(fname)) {
      result[fname] = {
        title: rec.title || '',
        author: (rec as any).author || '',
        tags: Array.isArray((rec as any).tags) ? (rec as any).tags : ((rec as any).tags ? [String((rec as any).tags)] : []),
        canvas_size_label: rec.canvas_size_label || null,
      };
    }
  }
  return result;
}

async function readManifest(groupId: string): Promise<GroupManifest | null> {
  const p = manifestPath(groupId);
  if (!existsSync(p)) return null;
  const raw = await fs.readFile(p, 'utf-8');
  return JSON.parse(raw) as GroupManifest;
}

async function writeManifest(manifest: GroupManifest) {
  await fs.writeFile(manifestPath(manifest.id), JSON.stringify(manifest, null, 2), 'utf-8');
}

async function readCaptions(csvPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!existsSync(csvPath)) return map;
  const raw = await fs.readFile(csvPath, 'utf-8');
  const lines = raw.split('\n');
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // file is first column (no commas in filenames), caption is the rest
    const idx = line.indexOf(',');
    if (idx === -1) continue;
    const file = line.slice(0, idx).trim().replace(/^"|"$/g, '');
    const caption = line.slice(idx + 1).trim().replace(/^"|"$/g, '').replace(/""/g, '"');
    if (file) map.set(file, caption);
  }
  return map;
}

async function writeCaptions(csvPath: string, rows: CaptionRow[]) {
  const lines = ['file,caption'];
  for (const r of rows) {
    // Escape caption: wrap in quotes if it contains comma or quote, escape inner quotes
    const escaped = r.caption.includes(',') || r.caption.includes('"')
      ? `"${r.caption.replace(/"/g, '""')}"`
      : r.caption;
    lines.push(`${r.file},${escaped}`);
  }
  await fs.writeFile(csvPath, lines.join('\n') + '\n', 'utf-8');
}

function normalizeTrigger(caption: string, trigger: string): string {
  const lower = caption.trim().toLowerCase();
  const triggerLower = trigger.toLowerCase();
  if (!lower) return '';
  if (lower.startsWith(triggerLower + ',') || lower.startsWith(triggerLower + ' ')) return caption.trim();
  if (lower === triggerLower) return caption.trim();
  return `${trigger}, ${caption.trim()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all groups, sorted by creation date desc */
export async function listGroups(): Promise<GroupManifest[]> {
  await ensureDir(CAPTION_GROUPS_ROOT);
  const entries = await fs.readdir(CAPTION_GROUPS_ROOT, { withFileTypes: true });
  const groups: GroupManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await readManifest(entry.name);
    if (manifest) groups.push(manifest);
  }
  return groups.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** List images in manual_accepted suitable for selection, enriched with canvas metadata */
export async function listManualAcceptedImages(
  scraperFolderId: string = DEFAULT_SCRAPER_FOLDER_ID,
): Promise<{ filename: string; url: string; canvas_pixel_count: number | null }[]> {
  const { getImagesForView } = await import('./scraper');
  const scraperImages = await getImagesForView('manual_accepted', 'asc', scraperFolderId);
  return scraperImages.map(img => ({
    filename: img.filename,
    url: img.url,
    canvas_pixel_count: img.canvas_pixel_count,
  }));
}

/** Create a new caption group from a list of filenames from manual_accepted */
export async function createGroup(
  name: string,
  filenames: string[],
  scraperFolderId: string = DEFAULT_SCRAPER_FOLDER_ID,
): Promise<GroupManifest> {
  const normalizedScraperFolderId = normalizeScraperFolderId(scraperFolderId);
  const scraperFolderLabel = (await listScraperFolders()).find(folder => folder.id === normalizedScraperFolderId)?.label
    ?? DEFAULT_SCRAPER_FOLDER_LABEL;
  const id = `${Date.now()}-${slugify(name)}`;
  const imgDir = imagesPath(id);
  await ensureDir(imgDir);

  // Copy images
  const copied: string[] = [];
  for (const filename of filenames) {
    const resolved = resolveScraperImagePath(normalizedScraperFolderId, 'manual_accepted', filename);
    const src = resolved?.filePath;
    const dst = path.join(imgDir, filename);
    if (src && existsSync(src)) {
      await fs.copyFile(src, dst);
      copied.push(filename);
    }
  }

  // Create empty captions.csv
  await writeCaptions(captionsPath(id), copied.map(f => ({ file: f, caption: '' })));

  // Save titles.json with scraper metadata for generation context
  const titles = await lookupTitles(copied, normalizedScraperFolderId);
  if (Object.keys(titles).length > 0) {
    await fs.writeFile(titlesPath(id), JSON.stringify(titles, null, 2), 'utf-8');
  }

  // Init progress.json
  const progress: GenerateProgress = {
    status: 'idle',
    total: copied.length,
    completed: 0,
    current_file: '',
  };
  await fs.writeFile(progressPath(id), JSON.stringify(progress, null, 2), 'utf-8');

  const manifest: GroupManifest = {
    id,
    name,
    status: 'draft',
    created_at: new Date().toISOString(),
    image_count: copied.length,
    scraper_folder_id: normalizedScraperFolderId,
    scraper_folder_label: scraperFolderLabel,
  };
  await writeManifest(manifest);
  return manifest;
}

/** Get a single group manifest */
export async function getGroup(groupId: string): Promise<GroupManifest | null> {
  return readManifest(groupId);
}

/** List images of a group with their current captions */
export async function getGroupImages(groupId: string): Promise<GroupImage[]> {
  const imgDir = imagesPath(groupId);
  if (!existsSync(imgDir)) return [];

  const captionsMap = await readCaptions(captionsPath(groupId));
  // Prefer reviewed captions; fall back to auto-generated
  const autoMap = await readCaptions(autoCaptionsPath(groupId));

  const files = await fs.readdir(imgDir);
  return files
    .filter(f => ALLOWED_IMG_EXTS.has(path.extname(f).toLowerCase()))
    .sort()
    .map(f => ({
      filename: f,
      url: `/api/captions/img/${encodeURIComponent(groupId)}/${encodeURIComponent(f)}`,
      caption: autoMap.get(f) || captionsMap.get(f) || '',
    }));
}

/** Save (upsert) captions for a group */
export async function saveCaptions(groupId: string, rows: CaptionRow[]): Promise<void> {
  // Write to both files so they stay in sync
  await writeCaptions(captionsPath(groupId), rows);
  await writeCaptions(autoCaptionsPath(groupId), rows);

  // If group was in draft (no auto-captions yet), keep status; otherwise set review
  const manifest = await readManifest(groupId);
  if (manifest && manifest.status === 'generating') {
    // wait for generation to finish
    return;
  }
  if (manifest && manifest.status === 'draft') {
    // manual save in draft — leave as is
    return;
  }
  // Otherwise mark review
  if (manifest && manifest.status !== 'ready_to_move' && manifest.status !== 'moved') {
    manifest.status = 'review';
    await writeManifest(manifest);
  }
}

/** Get current generation progress */
export async function getProgress(groupId: string): Promise<GenerateProgress> {
  const p = progressPath(groupId);
  if (!existsSync(p))
    return { status: 'idle', total: 0, completed: 0, current_file: '' };
  const raw = await fs.readFile(p, 'utf-8');
  return JSON.parse(raw) as GenerateProgress;
}

/** Launch the Python captioning script */
export async function startGeneration(
  groupId: string,
  opts: {
    triggerWord: string;
    detailLevel: 'short' | 'medium' | 'detailed';
    modelName: string;
    overwriteMode: 'empty_only' | 'overwrite_all';
  },
): Promise<void> {
  const manifest = await readManifest(groupId);
  if (!manifest) throw new Error('Group not found');
  if (manifest.status === 'generating') throw new Error('Already generating');

  // Set status to generating and reset progress to avoid stale 'done' triggering auto-finalize
  manifest.status = 'generating';
  await writeManifest(manifest);

  const imgDir = imagesPath(groupId);
  // Count images for initial progress reset
  let imageCount = 0;
  try {
    const files = await fs.readdir(imgDir);
    imageCount = files.filter(f => ALLOWED_IMG_EXTS.has(path.extname(f).toLowerCase())).length;
  } catch { /* ignore */ }
  const resetProgress: GenerateProgress = { status: 'idle', total: imageCount, completed: 0, current_file: '' };
  await fs.writeFile(progressPath(groupId), JSON.stringify(resetProgress, null, 2), 'utf-8');
  const autoOut = autoCaptionsPath(groupId);
  const progressFile = progressPath(groupId);
  const scriptPath = path.join(TOOLKIT_ROOT, 'scripts', 'tfg', 'generate_captions.py');

  // Find Python executable — prefer venv
  const venvPython = path.join(TOOLKIT_ROOT, 'venv', 'Scripts', 'python.exe');
  const pythonExe = existsSync(venvPython) ? venvPython : 'python';

  const tPath = titlesPath(groupId);
  const args = [
    scriptPath,
    '--images', imgDir,
    '--output', autoOut,
    '--progress-file', progressFile,
    '--trigger-word', opts.triggerWord,
    '--detail-level', opts.detailLevel,
    '--model-name', opts.modelName,
    '--overwrite-mode', opts.overwriteMode,
    ...(existsSync(tPath) ? ['--titles-file', tPath] : []),
  ];

  const child = spawn(pythonExe, args, {
    detached: true,
    stdio: 'ignore',
    cwd: TOOLKIT_ROOT,
    windowsHide: true,
  });
  child.unref();

  // Watch for process exit to update manifest status
  child.on('error', async () => {
    const m = await readManifest(groupId);
    if (m) {
      m.status = 'review';
      await writeManifest(m);
    }
  });
}

/** After generation is done, merge auto captions into reviewed CSV and update status */
export async function finalizeGeneration(groupId: string): Promise<void> {
  const manifest = await readManifest(groupId);
  if (!manifest) return;

  const autoMap = await readCaptions(autoCaptionsPath(groupId));
  const existingMap = await readCaptions(captionsPath(groupId));

  // Merge: keep existing non-empty, fill empty with auto
  const imgDir = imagesPath(groupId);
  const files = (await fs.readdir(imgDir)).filter(f =>
    ALLOWED_IMG_EXTS.has(path.extname(f).toLowerCase()),
  );
  const merged: CaptionRow[] = files.map(f => ({
    file: f,
    caption: existingMap.get(f) || autoMap.get(f) || '',
  }));
  await writeCaptions(captionsPath(groupId), merged);

  manifest.status = 'review';
  await writeManifest(manifest);
}

/** Delete a caption group folder entirely */
export async function deleteGroup(groupId: string): Promise<void> {
  const dir = groupPath(groupId);
  if (existsSync(dir)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Return available dataset iter folders */
export async function listDatasets(): Promise<string[]> {  if (!existsSync(DATASETS_ROOT)) return [];
  const entries = await fs.readdir(DATASETS_ROOT, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && e.name !== 'pixilart')
    .map(e => e.name)
    .sort();
}

/** Move (copy) group images + captions to a dataset, run sync_captions equivalent */
export async function moveToDataset(
  groupId: string,
  datasetName: string,
  triggerWord: string,
): Promise<void> {
  const manifest = await readManifest(groupId);
  if (!manifest) throw new Error('Group not found');

  const imgDir = imagesPath(groupId);
  const destImgDir = path.join(DATASETS_ROOT, datasetName, 'images');
  await ensureDir(destImgDir);

  const captionsMap = await readCaptions(captionsPath(groupId));
  const imgFiles = (await fs.readdir(imgDir)).filter(f =>
    ALLOWED_IMG_EXTS.has(path.extname(f).toLowerCase()),
  );

  // Scale images to 512x512 nearest-neighbor and save as PNG (handle collisions by adding suffix)
  const renames = new Map<string, string>(); // original → final name in dest
  for (const filename of imgFiles) {
    // Always output as .png regardless of source format
    const baseName = path.basename(filename, path.extname(filename)) + '.png';
    let destName = baseName;
    let counter = 1;
    while (existsSync(path.join(destImgDir, destName))) {
      const base = path.basename(baseName, '.png');
      destName = `${base}_${counter}.png`;
      counter++;
    }
    await sharp(path.join(imgDir, filename))
      .resize(512, 512, {
        kernel: sharp.kernel.nearest,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(path.join(destImgDir, destName));
    renames.set(filename, destName);
  }

  // Update / create captions.csv in dataset
  const datasetCsvPath = path.join(DATASETS_ROOT, datasetName, 'images', 'captions.csv');
  const existingDatasetCaptions = await readCaptions(datasetCsvPath);

  for (const [origName, destName] of renames) {
    const rawCaption = captionsMap.get(origName) ?? '';
    existingDatasetCaptions.set(destName, rawCaption);
  }

  const allRows: CaptionRow[] = Array.from(existingDatasetCaptions.entries()).map(([f, c]) => ({
    file: f,
    caption: c,
  }));
  await writeCaptions(datasetCsvPath, allRows);

  // Generate .txt files (equivalent to sync_captions.py)
  for (const [origName, destName] of renames) {
    const rawCaption = captionsMap.get(origName) ?? '';
    const normalized = normalizeTrigger(rawCaption, triggerWord);
    if (!normalized) continue;
    const txtPath = path.join(destImgDir, path.basename(destName, path.extname(destName)) + '.txt');
    await fs.writeFile(txtPath, normalized, 'utf-8');
  }

  // Update manifest
  manifest.status = 'moved';
  manifest.moved_to = datasetName;
  manifest.moved_at = new Date().toISOString();
  await writeManifest(manifest);
}

/** Serve a group image as a stream-compatible path */
export function resolveGroupImagePath(groupId: string, filename: string): string | null {
  const p = path.join(imagesPath(groupId), filename);
  return existsSync(p) ? p : null;
}

/** Serve a manual_accepted image path */
export function resolveManualAcceptedImagePath(filename: string): string | null {
  const p = path.join(MANUAL_ACCEPTED_DIR, filename);
  return existsSync(p) ? p : null;
}

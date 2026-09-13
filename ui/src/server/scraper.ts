/**
 * scraper.ts — Server-side logic for the Pixilart scraper review UI.
 *
 * Manages:
 *  - Path constants for all scraper directories and manifests
 *  - JSONL read/append helpers
 *  - Manifest loaders (accepted, rejected, manual_removed)
 *  - Image listing per view
 *  - Sync: manual_accepted = accepted − manual_removed
 *  - Delete: remove from manual_accepted + record in manual_removed manifest
 */

import fs from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { PIXILART_TOPICS } from '@/utils/pixilartTopics';

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const TOOLKIT_ROOT    = path.resolve(process.cwd(), '..');
const PIXILART_ROOT   = path.join(TOOLKIT_ROOT, 'datasets', 'pixilart');
const FILTERED_ROOT   = path.join(PIXILART_ROOT, 'filtered');
const SCRAPES_ROOT    = path.join(PIXILART_ROOT, 'scrapes');

export const DEFAULT_SCRAPER_FOLDER_ID = 'default';
export const DEFAULT_SCRAPER_FOLDER_LABEL = 'Pixilart principal';

export const ACCEPTED_DIR        = path.join(FILTERED_ROOT, 'accepted');
export const REJECTED_DIR        = path.join(FILTERED_ROOT, 'rejected');
export const MANUAL_ACCEPTED_DIR = path.join(FILTERED_ROOT, 'manual_accepted');

const METADATA_DIR           = path.join(FILTERED_ROOT, 'metadata');
const FILTERED_JSONL         = path.join(METADATA_DIR, 'pixilart_filtered.jsonl');
const REJECTED_JSONL         = path.join(METADATA_DIR, 'pixilart_rejected.jsonl');
const MANUAL_REMOVED_JSONL   = path.join(METADATA_DIR, 'pixilart_manual_removed.jsonl');

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VALID_TOPIC_VALUES = new Set(PIXILART_TOPICS.map(topic => topic.value));

function slugifyFolderName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function isSafeFolderId(folderId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(folderId);
}

export function normalizeScraperFolderId(folderId?: string | null): string {
  if (!folderId || folderId === DEFAULT_SCRAPER_FOLDER_ID) return DEFAULT_SCRAPER_FOLDER_ID;
  if (!isSafeFolderId(folderId)) throw new Error('Invalid scraper folder');
  return folderId;
}

function scraperRootFor(folderId?: string | null): string {
  const normalized = normalizeScraperFolderId(folderId);
  if (normalized === DEFAULT_SCRAPER_FOLDER_ID) return PIXILART_ROOT;
  const root = path.resolve(SCRAPES_ROOT, normalized);
  const allowed = path.resolve(SCRAPES_ROOT);
  if (!root.startsWith(allowed + path.sep)) throw new Error('Invalid scraper folder');
  return root;
}

function pathsFor(folderId?: string | null) {
  const root = scraperRootFor(folderId);
  const filteredRoot = path.join(root, 'filtered');
  return {
    root,
    rawImagesDir: path.join(root, 'raw', 'images'),
    rawMetadataDir: path.join(root, 'raw', 'metadata'),
    rawLogsDir: path.join(root, 'raw', 'logs'),
    reportsDir: path.join(root, 'reports'),
    filteredRoot,
    acceptedDir: path.join(filteredRoot, 'accepted'),
    rejectedDir: path.join(filteredRoot, 'rejected'),
    manualAcceptedDir: path.join(filteredRoot, 'manual_accepted'),
    metadataDir: path.join(filteredRoot, 'metadata'),
    filteredJsonl: path.join(filteredRoot, 'metadata', 'pixilart_filtered.jsonl'),
    rejectedJsonl: path.join(filteredRoot, 'metadata', 'pixilart_rejected.jsonl'),
    manualRemovedJsonl: path.join(filteredRoot, 'metadata', 'pixilart_manual_removed.jsonl'),
    runJson: path.join(root, 'scrape_run.json'),
  };
}

async function countImages(dirPath: string): Promise<number> {
  return (await listImageFiles(dirPath)).length;
}

function scraperImageUrl(folderId: string, view: ScraperView, filename: string): string {
  const encodedFilename = encodeURIComponent(filename);
  if (folderId === DEFAULT_SCRAPER_FOLDER_ID) {
    return `/api/scraper/img/${view}/${encodedFilename}`;
  }
  return `/api/scraper/img/${encodeURIComponent(folderId)}/${view}/${encodedFilename}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Record shape as written by the scraper's ManifestPipeline */
export interface ScraperRecord {
  id?: number;
  art_url?: string;
  image_url?: string;
  title?: string;
  source_tag?: string;
  // Canvas / pixel-art size (set by spider from API — the real size)
  canvas_width_px?: number | null;
  canvas_height_px?: number | null;
  canvas_size_label?: string | null;
  canvas_pixel_count?: number | null;
  // Pillow / downloaded-PNG size (kept for backward compat, ~1200px)
  width_px?: number | null;
  height_px?: number | null;
  size_label?: string | null;
  pixel_count?: number | null;
  local_filtered_path?: string;
  filter_status?: string;
  reject_reason?: string | null;
  /** Popularity metrics from Pixilart API */
  likes_count?: number | null;
  views?: number | null;
  /** Derived at load time from local_filtered_path basename */
  filename?: string;
}

export interface ManualRemovedRecord {
  id?: number;
  art_url?: string;
  image_url?: string;
  filename: string;
  title?: string;
  source_tag?: string;
  width_px?: number | null;
  height_px?: number | null;
  size_label?: string | null;
  removed_at: string;
  remove_reason: 'manual_remove';
}

/** Normalised shape returned to the UI */
export interface ScraperImage {
  filename: string;
  url: string;
  canvas_width_px: number | null;
  canvas_height_px: number | null;
  canvas_size_label: string | null;
  canvas_pixel_count: number | null;
  title?: string;
  source_tag?: string;
  art_url?: string;
  reject_reason?: string | null;
}

export type ScraperView = 'accepted' | 'rejected' | 'manual_accepted';
export type SortOrder   = 'asc' | 'desc';

export interface ScraperFolder {
  id: string;
  label: string;
  isDefault: boolean;
  acceptedCount: number;
  manualAcceptedCount: number;
  rejectedCount: number;
  status?: ScraperRunStatus;
  createdAt?: string;
  progress?: {
    current: number;
    total: number;
    percent: number;
  };
}

export type ScraperRunStatus = 'idle' | 'running' | 'done' | 'error';

export interface ScraperRunManifest {
  id: string;
  label: string;
  status: ScraperRunStatus;
  topics: string[];
  items_per_topic: number;
  max_items: number;
  min_likes: number;
  overwrite: boolean;
  no_cache: boolean;
  started_at: string;
  finished_at?: string;
  exit_code?: number | null;
  error?: string;
  log_file: string;
}

let activeRun: { folderId: string; pid: number } | null = null;

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

async function appendJsonl(filePath: string, record: object): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Manifest loaders
// ---------------------------------------------------------------------------

function enrichRecord(r: ScraperRecord): ScraperRecord {
  const filename = r.local_filtered_path
    ? path.basename(r.local_filtered_path)
    : undefined;
  // Prefer canvas fields; compute canvas_pixel_count if missing
  const cw = r.canvas_width_px ?? null;
  const ch = r.canvas_height_px ?? null;
  const cpc = r.canvas_pixel_count ?? (cw !== null && ch !== null ? cw * ch : null);
  return {
    ...r,
    filename,
    canvas_pixel_count: cpc,
    canvas_size_label: r.canvas_size_label ?? (cw && ch ? `${cw}x${ch}` : null),
  };
}

export async function loadAcceptedManifest(folderId: string = DEFAULT_SCRAPER_FOLDER_ID): Promise<ScraperRecord[]> {
  const records = await readJsonl<ScraperRecord>(pathsFor(folderId).filteredJsonl);
  return records.map(enrichRecord);
}

export async function loadRejectedManifest(folderId: string = DEFAULT_SCRAPER_FOLDER_ID): Promise<ScraperRecord[]> {
  const records = await readJsonl<ScraperRecord>(pathsFor(folderId).rejectedJsonl);
  return records.map(enrichRecord);
}

export async function loadManualRemovedSet(folderId: string = DEFAULT_SCRAPER_FOLDER_ID): Promise<Set<string>> {
  const records = await readJsonl<ManualRemovedRecord>(pathsFor(folderId).manualRemovedJsonl);
  return new Set(records.map(r => r.filename));
}

// ---------------------------------------------------------------------------
// List physical image files in a directory
// ---------------------------------------------------------------------------

export async function listImageFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.filter(name =>
      ALLOWED_EXTS.has(path.extname(name).toLowerCase()),
    );
  } catch {
    return [];
  }
}

async function readRunManifest(folderId: string): Promise<ScraperRunManifest | null> {
  const runPath = pathsFor(folderId).runJson;
  try {
    const raw = await fs.readFile(runPath, 'utf-8');
    return JSON.parse(raw) as ScraperRunManifest;
  } catch {
    return null;
  }
}

async function writeRunManifest(folderId: string, manifest: ScraperRunManifest): Promise<void> {
  const runPath = pathsFor(folderId).runJson;
  await fs.mkdir(path.dirname(runPath), { recursive: true });
  await fs.writeFile(runPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

function progressForRun(
  run: ScraperRunManifest | null,
  acceptedCount: number,
  rejectedCount: number,
): ScraperFolder['progress'] {
  if (!run) return undefined;
  const total = Math.max(
    1,
    run.max_items > 0 ? run.max_items : run.topics.length * run.items_per_topic,
  );
  const current = Math.min(total, acceptedCount + rejectedCount);
  return {
    current,
    total,
    percent: Math.min(100, Math.round((current / total) * 100)),
  };
}

export async function listScraperFolders(): Promise<ScraperFolder[]> {
  await fs.mkdir(SCRAPES_ROOT, { recursive: true });

  const defaultPaths = pathsFor(DEFAULT_SCRAPER_FOLDER_ID);
  const defaultRun = await readRunManifest(DEFAULT_SCRAPER_FOLDER_ID);
  const defaultAcceptedCount = await countImages(defaultPaths.acceptedDir);
  const defaultManualAcceptedCount = await countImages(defaultPaths.manualAcceptedDir);
  const defaultRejectedCount = await countImages(defaultPaths.rejectedDir);
  const folders: ScraperFolder[] = [{
    id: DEFAULT_SCRAPER_FOLDER_ID,
    label: DEFAULT_SCRAPER_FOLDER_LABEL,
    isDefault: true,
    acceptedCount: defaultAcceptedCount,
    manualAcceptedCount: defaultManualAcceptedCount,
    rejectedCount: defaultRejectedCount,
    status: defaultRun?.status,
    progress: progressForRun(defaultRun, defaultAcceptedCount, defaultRejectedCount),
  }];

  const entries = await fs.readdir(SCRAPES_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeFolderId(entry.name)) continue;
    const folderPaths = pathsFor(entry.name);
    const run = await readRunManifest(entry.name);
    const acceptedCount = await countImages(folderPaths.acceptedDir);
    const manualAcceptedCount = await countImages(folderPaths.manualAcceptedDir);
    const rejectedCount = await countImages(folderPaths.rejectedDir);
    folders.push({
      id: entry.name,
      label: run?.label ?? entry.name,
      isDefault: false,
      acceptedCount,
      manualAcceptedCount,
      rejectedCount,
      status: run?.status,
      createdAt: run?.started_at,
      progress: progressForRun(run, acceptedCount, rejectedCount),
    });
  }

  return folders.sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}

export async function deleteScraperFolder(folderId: string): Promise<{ deleted: boolean }> {
  const normalizedFolderId = normalizeScraperFolderId(folderId);
  if (normalizedFolderId === DEFAULT_SCRAPER_FOLDER_ID) {
    throw new Error('No se puede eliminar la carpeta principal del scraper');
  }

  if (activeRun?.folderId === normalizedFolderId) {
    throw new Error('No se puede eliminar una carpeta con el scraper en ejecucion');
  }

  const run = await readRunManifest(normalizedFolderId);
  if (run?.status === 'running') {
    throw new Error('No se puede eliminar una carpeta con el scraper en ejecucion');
  }

  const root = path.resolve(scraperRootFor(normalizedFolderId));
  const allowedRoot = path.resolve(SCRAPES_ROOT);
  if (!root.startsWith(allowedRoot + path.sep)) {
    throw new Error('Invalid scraper folder');
  }

  await fs.rm(root, { recursive: true, force: true });
  return { deleted: true };
}

export function resolveScraperImagePath(
  folderId: string,
  view: ScraperView,
  filename: string,
): { filePath: string; baseDir: string } | null {
  const normalizedFolderId = normalizeScraperFolderId(folderId);
  const scraperPaths = pathsFor(normalizedFolderId);
  const viewDirs: Record<ScraperView, string> = {
    accepted: scraperPaths.acceptedDir,
    rejected: scraperPaths.rejectedDir,
    manual_accepted: scraperPaths.manualAcceptedDir,
  };
  const baseDir = viewDirs[view];
  if (!baseDir) return null;

  const filePath = path.resolve(path.join(baseDir, filename));
  if (!filePath.startsWith(path.resolve(baseDir) + path.sep)) return null;
  return { filePath, baseDir };
}

function getPythonExe(): string {
  const venvPython = path.join(TOOLKIT_ROOT, 'venv', 'Scripts', 'python.exe');
  if (existsSync(venvPython)) return venvPython;
  return 'python';
}

export async function startScraperRun(opts: {
  label?: string;
  topics: string[];
  itemsPerTopic: number;
  maxItems: number;
  minLikes: number;
  overwrite?: boolean;
  noCache?: boolean;
}): Promise<ScraperRunManifest> {
  if (activeRun) {
    throw new Error(`Ya hay un scraper en ejecucion: ${activeRun.folderId}`);
  }

  const topics = [...new Set(opts.topics.map(t => String(t).trim().toLowerCase()).filter(Boolean))];
  if (topics.length === 0) throw new Error('Selecciona al menos un topic');
  const invalidTopics = topics.filter(topic => !VALID_TOPIC_VALUES.has(topic));
  if (invalidTopics.length > 0) throw new Error(`Topics invalidos: ${invalidTopics.join(', ')}`);

  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  const labelBase = opts.label?.trim() || `Scraper ${topics.join(', ')}`;
  const folderBase = slugifyFolderName(labelBase) || 'scraper';
  const folderId = `${timestamp}_${folderBase}`.slice(0, 64);
  const scraperPaths = pathsFor(folderId);
  await fs.mkdir(scraperPaths.root, { recursive: true });

  const logFile = path.join(scraperPaths.rawLogsDir, 'run.log');
  await fs.mkdir(path.dirname(logFile), { recursive: true });

  const manifest: ScraperRunManifest = {
    id: folderId,
    label: labelBase,
    status: 'running',
    topics,
    items_per_topic: Math.max(1, Math.floor(opts.itemsPerTopic || 20)),
    max_items: Math.max(0, Math.floor(opts.maxItems || 0)),
    min_likes: Math.max(0, Math.floor(opts.minLikes || 0)),
    overwrite: Boolean(opts.overwrite),
    no_cache: Boolean(opts.noCache),
    started_at: now.toISOString(),
    log_file: logFile,
  };
  await writeRunManifest(folderId, manifest);

  const scriptDir = path.join(TOOLKIT_ROOT, 'scripts', 'scrapers', 'pixilart_scraper');
  const scriptPath = path.join(scriptDir, 'run_spider.py');
  const args = [
    scriptPath,
    '--topics', ...topics,
    '--items-per-topic', String(manifest.items_per_topic),
    '--max-items', String(manifest.max_items),
    '--min-likes', String(manifest.min_likes),
    '--output-root', scraperPaths.root,
    ...(manifest.overwrite ? ['--overwrite'] : []),
    ...(manifest.no_cache ? ['--no-cache'] : []),
  ];

  const logStream = createWriteStream(logFile, { flags: 'a' });
  const child = spawn(getPythonExe(), args, {
    cwd: scriptDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });

  activeRun = { folderId, pid: child.pid ?? 0 };
  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });

  child.on('error', async err => {
    const latest = await readRunManifest(folderId);
    await writeRunManifest(folderId, {
      ...(latest ?? manifest),
      status: 'error',
      finished_at: new Date().toISOString(),
      error: err.message,
    });
    if (activeRun?.folderId === folderId) activeRun = null;
    logStream.end();
  });

  child.on('close', async code => {
    const latest = await readRunManifest(folderId);
    await writeRunManifest(folderId, {
      ...(latest ?? manifest),
      status: code === 0 ? 'done' : 'error',
      finished_at: new Date().toISOString(),
      exit_code: code,
      error: code === 0 ? undefined : `Proceso terminado con codigo ${code}`,
    });
    if (activeRun?.folderId === folderId) activeRun = null;
    logStream.end();
  });

  return manifest;
}

export async function getScraperRunStatus(folderId: string): Promise<{ run: ScraperRunManifest | null; logTail: string }> {
  const normalizedFolderId = normalizeScraperFolderId(folderId);
  const run = await readRunManifest(normalizedFolderId);
  if (!run) return { run: null, logTail: '' };
  try {
    const raw = await fs.readFile(run.log_file, 'utf-8');
    return { run, logTail: raw.split(/\r?\n/).slice(-80).join('\n') };
  } catch {
    return { run, logTail: '' };
  }
}

// ---------------------------------------------------------------------------
// Build ScraperImage list for a given view
// ---------------------------------------------------------------------------

export async function getImagesForView(
  view: ScraperView,
  sort: SortOrder = 'asc',
  folderId: string = DEFAULT_SCRAPER_FOLDER_ID,
): Promise<ScraperImage[]> {
  const normalizedFolderId = normalizeScraperFolderId(folderId);
  const scraperPaths = pathsFor(normalizedFolderId);
  let dir: string;
  let manifest: ScraperRecord[];

  if (view === 'accepted') {
    dir = scraperPaths.acceptedDir;
    manifest = await loadAcceptedManifest(normalizedFolderId);
  } else if (view === 'rejected') {
    dir = scraperPaths.rejectedDir;
    manifest = await loadRejectedManifest(normalizedFolderId);
  } else {
    // manual_accepted uses accepted metadata but reads files from manual dir
    dir = scraperPaths.manualAcceptedDir;
    manifest = await loadAcceptedManifest(normalizedFolderId);
  }

  // Filename → record lookup
  const byFilename = new Map<string, ScraperRecord>();
  for (const r of manifest) {
    if (r.filename) byFilename.set(r.filename, r);
  }

  const files = await listImageFiles(dir);

  const images: ScraperImage[] = files.map(filename => {
    const rec = byFilename.get(filename);
    return {
      filename,
      url: scraperImageUrl(normalizedFolderId, view, filename),
      canvas_width_px:   rec?.canvas_width_px   ?? null,
      canvas_height_px:  rec?.canvas_height_px  ?? null,
      canvas_size_label: rec?.canvas_size_label ?? null,
      canvas_pixel_count: rec?.canvas_pixel_count ?? null,
      title: rec?.title,
      source_tag: rec?.source_tag,
      art_url: rec?.art_url,
      reject_reason: rec?.reject_reason ?? null,
    };
  });

  images.sort((a, b) => {
    const pa = a.canvas_pixel_count ?? 0;
    const pb = b.canvas_pixel_count ?? 0;
    return sort === 'asc' ? pa - pb : pb - pa;
  });

  return images;
}

// ---------------------------------------------------------------------------
// Sync: manual_accepted = accepted − manual_removed
// ---------------------------------------------------------------------------

export async function syncManualAccepted(folderId: string = DEFAULT_SCRAPER_FOLDER_ID): Promise<{ copied: number }> {
  const normalizedFolderId = normalizeScraperFolderId(folderId);
  const scraperPaths = pathsFor(normalizedFolderId);
  await fs.mkdir(scraperPaths.manualAcceptedDir, { recursive: true });

  const [acceptedFiles, manualFiles, removedSet] = await Promise.all([
    listImageFiles(scraperPaths.acceptedDir),
    listImageFiles(scraperPaths.manualAcceptedDir),
    loadManualRemovedSet(normalizedFolderId),
  ]);

  const manualSet = new Set(manualFiles);
  let copied = 0;

  for (const filename of acceptedFiles) {
    if (removedSet.has(filename)) continue; // skip manually removed
    if (manualSet.has(filename)) continue;  // already present
    await fs.copyFile(
      path.join(scraperPaths.acceptedDir, filename),
      path.join(scraperPaths.manualAcceptedDir, filename),
    );
    copied++;
  }

  return { copied };
}

// ---------------------------------------------------------------------------
// Delete from manual_accepted + record in removed manifest
// ---------------------------------------------------------------------------

export async function deleteFromManualAccepted(
  filenames: string[],
  folderId: string = DEFAULT_SCRAPER_FOLDER_ID,
): Promise<{ deleted: number; errors: string[] }> {
  const normalizedFolderId = normalizeScraperFolderId(folderId);
  const scraperPaths = pathsFor(normalizedFolderId);
  // Build metadata lookup for the records to log
  const accepted = await loadAcceptedManifest(normalizedFolderId);
  const byFilename = new Map<string, ScraperRecord>();
  for (const r of accepted) {
    if (r.filename) byFilename.set(r.filename, r);
  }

  let deleted = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const filename of filenames) {
    // Security: filename must not contain path separators or traversal
    if (
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..')
    ) {
      errors.push(`Invalid filename: ${filename}`);
      continue;
    }

    const filePath = path.join(scraperPaths.manualAcceptedDir, filename);

    // Ensure resolved path stays within the manual_accepted dir
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(scraperPaths.manualAcceptedDir) + path.sep)) {
      errors.push(`Path traversal attempt: ${filename}`);
      continue;
    }

    try {
      const rec = byFilename.get(filename);

      // 1. Copy from accepted/ → rejected/ (accepted/ is the source of truth, never modified)
      await fs.mkdir(scraperPaths.rejectedDir, { recursive: true });
      const acceptedSrc = path.join(scraperPaths.acceptedDir, filename);
      const rejectedDst = path.join(scraperPaths.rejectedDir, filename);
      await fs.copyFile(acceptedSrc, rejectedDst);

      // 2. Remove from manual_accepted/
      await fs.unlink(filePath);
      deleted++;

      // 3. Append to rejected manifest with manual_deleted reason
      await appendJsonl(scraperPaths.rejectedJsonl, {
        ...(rec ?? {}),
        filter_status: 'rejected',
        review_status: 'manual',
        reject_reason: 'manual_deleted',
        local_filtered_path: rejectedDst,
      });

      // 4. Record in manual_removed manifest (sync exclusion list — prevents re-appearing)
      const removal: ManualRemovedRecord = {
        id: rec?.id,
        art_url: rec?.art_url,
        image_url: rec?.image_url,
        filename,
        title: rec?.title,
        source_tag: rec?.source_tag,
        width_px: rec?.width_px ?? null,
        height_px: rec?.height_px ?? null,
        size_label: rec?.size_label ?? null,
        removed_at: now,
        remove_reason: 'manual_remove',
      };
      await appendJsonl(scraperPaths.manualRemovedJsonl, removal);
    } catch (err: any) {
      errors.push(`Failed to delete ${filename}: ${err.message}`);
    }
  }

  return { deleted, errors };
}

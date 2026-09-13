import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const OUTPUTS_DIR = path.join(TOOLKIT_ROOT, 'outputs');

// Busca .safetensors en outputs/ excluyendo checkpoints intermedios (_000000NNN.safetensors)
function findLoRAs(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findLoRAs(fullPath, results);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.safetensors') &&
      !/_\d{9}\.safetensors$/.test(entry.name)
    ) {
      // Ruta relativa desde TOOLKIT_ROOT con forward-slashes
      const relative = path.relative(TOOLKIT_ROOT, fullPath).replace(/\\/g, '/');
      results.push(relative);
    }
  }
  return results;
}

export async function GET() {
  try {
    const loras = findLoRAs(OUTPUTS_DIR);
    loras.sort();
    return NextResponse.json({ loras });
  } catch (err: any) {
    return NextResponse.json({ loras: [], error: err.message }, { status: 500 });
  }
}

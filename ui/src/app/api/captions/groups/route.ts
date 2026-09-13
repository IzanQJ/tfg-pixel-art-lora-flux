import { NextRequest, NextResponse } from 'next/server';
import { listGroups, createGroup } from '@/server/captions';

export async function GET() {
  try {
    const groups = await listGroups();
    return NextResponse.json({ groups });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, filenames, scraperFolder } = body as { name: string; filenames: string[]; scraperFolder?: string };
    if (!name || !filenames?.length) {
      return NextResponse.json({ error: 'name and filenames are required' }, { status: 400 });
    }
    const group = await createGroup(name, filenames, scraperFolder);
    return NextResponse.json({ group }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

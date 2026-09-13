import { NextRequest, NextResponse } from 'next/server';
import { listDatasets } from '@/server/captions';

export async function GET(_request: NextRequest) {
  try {
    const datasets = await listDatasets();
    return NextResponse.json({ datasets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const base = process.env.OPENVIGIE_COLLECTOR_URL?.replace(/\/$/, '');
  if (!base) return NextResponse.json({ error: 'Collecteur non configuré.' }, { status: 503 });
  try {
    const response = await fetch(`${base}/catalog/versions?${new URL(request.url).searchParams}`, {
      cache: 'no-store', signal: AbortSignal.timeout(120000),
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Dictionnaire CPE NVD indisponible.' }, { status: 503 });
  }
}

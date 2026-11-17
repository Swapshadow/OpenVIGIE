import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const collectorBase = (process.env.OPENVIGIE_COLLECTOR_URL ?? 'http://collector:8787').replace(/\/$/, '');

  const target = new URL('/bulletin/weekly', collectorBase);
  const token = (await cookies()).get('openvigie_session')?.value;
  if (!token) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });

  try {
    const response = await fetch(target, {
      cache: 'no-store', signal: AbortSignal.timeout(120_000),
      headers: { Authorization: `Bearer ${token}` },
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Le collecteur prépare ou actualise encore les sources. Réessaie dans quelques instants.' },
      { status: 503 },
    );
  }
}

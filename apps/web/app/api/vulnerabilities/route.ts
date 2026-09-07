import { NextResponse } from 'next/server';

async function proxy(request: Request) {
  const base = process.env.OPENVIGIE_COLLECTOR_URL?.replace(/\/$/, '');
  if (!base) return NextResponse.json({ error: 'Le collecteur est requis pour vérifier les versions affectées.' }, { status: 503 });
  try {
    const response = await fetch(`${base}/vulnerabilities?${new URL(request.url).searchParams}`, {
      method: request.method, cache: 'no-store', signal: AbortSignal.timeout(120000),
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Collecteur indisponible : impossible de confirmer les versions affectées.' }, { status: 503 });
  }
}
export const GET = proxy;
export const DELETE = proxy;

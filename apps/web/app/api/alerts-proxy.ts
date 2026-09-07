import { NextResponse } from 'next/server';

export async function proxyAlerts(request: Request, path: string) {
  const base = process.env.OPENVIGIE_COLLECTOR_URL?.replace(/\/$/, '');
  if (!base) return NextResponse.json({ error: 'Le collecteur doit être configuré pour les alertes.' }, { status: 503 });
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    const allowedOrigins = new Set([new URL(request.url).origin]);
    for (const value of (process.env.OPENVIGIE_PUBLIC_ORIGINS ?? '').split(',')) {
      try { allowedOrigins.add(new URL(value.trim()).origin); } catch { /* Ignore invalid configuration. */ }
    }
    if ((origin && !allowedOrigins.has(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 });
    }
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
      return NextResponse.json({ error: 'JSON requis.' }, { status: 415 });
    }
  }
  try {
    const body = request.method === 'GET' ? undefined : await request.text();
    if (body && new TextEncoder().encode(body).length > 16384) return NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 });
    const response = await fetch(`${base}${path}${new URL(request.url).search}`, {
      method: request.method, body, headers: { 'Content-Type': 'application/json' },
      cache: 'no-store', signal: AbortSignal.timeout(45000),
    });
    return new NextResponse(await response.arrayBuffer(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Collecteur indisponible.' }, { status: 503 });
  }
}

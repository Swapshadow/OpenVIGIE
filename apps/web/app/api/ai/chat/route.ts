import { NextRequest, NextResponse } from 'next/server';

const collectorUrl = process.env.OPENVIGIE_COLLECTOR_URL ?? 'http://collector:8787';

export async function POST(request: NextRequest) {
  const target = new URL('/ai/chat', collectorUrl);

  let response: Response;
  try {
    const body = await request.text();
    response = await fetch(target, {
      method: 'POST',
      body,
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(250_000),
    });
  } catch {
    return NextResponse.json(
      { error: 'Vigi, l’assistant IA local, est indisponible pour le moment.' },
      { status: 503 },
    );
  }

  if (!response.ok || !response.body) {
    // Input validation and internal errors arrive as a small JSON body, not a stream.
    const payload = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    return NextResponse.json(payload, { status: response.status });
  }

  // Success: pass the NDJSON event stream straight through so the reply renders
  // token by token in the UI instead of waiting for the full answer.
  return new Response(response.body, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}

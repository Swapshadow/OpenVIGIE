import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const COOKIE = 'openvigie_session';

export async function accountProxy(request: Request, path: string, options?: { setSession?: boolean; clearSession?: boolean }) {
  const base = (process.env.OPENVIGIE_COLLECTOR_URL ?? 'http://collector:8787').replace(/\/$/, '');
  const jar = await cookies();
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 });
    }
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && path !== '/auth/logout'
      && request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
      return NextResponse.json({ error: 'JSON requis.' }, { status: 415 });
    }
  }
  const token = jar.get(COOKIE)?.value ?? '';
  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  try {
    const upstream = await fetch(`${base}${path}`, {
      method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(120_000),
    });
    const payload = await upstream.json() as { token?: string; [key: string]: unknown };
    const sessionToken = payload.token;
    if (options?.setSession) delete payload.token;
    const response = NextResponse.json(payload, { status: upstream.status });
    if (options?.setSession && upstream.ok && sessionToken) {
      response.cookies.set(COOKIE, sessionToken, {
        httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:',
        path: '/', maxAge: 30 * 24 * 60 * 60,
      });
    }
    if (options?.clearSession) response.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: 'Service OpenVigie indisponible.' }, { status: 503 });
  }
}

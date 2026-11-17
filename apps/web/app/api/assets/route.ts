import { accountProxy } from '../account-proxy';
export async function GET(request: Request) { return accountProxy(request, '/assets'); }
export async function POST(request: Request) { return accountProxy(request, '/assets'); }
export async function DELETE(request: Request) { return accountProxy(request, `/assets?${new URL(request.url).searchParams}`); }

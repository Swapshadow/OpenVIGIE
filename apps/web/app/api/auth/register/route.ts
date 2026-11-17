import { accountProxy } from '../../account-proxy';
export async function POST(request: Request) { return accountProxy(request, '/auth/register', { setSession: true }); }

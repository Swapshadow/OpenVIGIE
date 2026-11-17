import { accountProxy } from '../../account-proxy';
export async function GET(request: Request) { return accountProxy(request, '/account/me'); }

import { proxyAlerts } from '../alerts-proxy';
export async function GET(request: Request) { return proxyAlerts(request, '/notifications'); }

import { proxyAlerts } from '../../alerts-proxy';
export async function POST(request: Request) { return proxyAlerts(request, '/notifications/mark-all-read'); }

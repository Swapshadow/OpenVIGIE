import { proxyAlerts } from '../../../alerts-proxy';
export async function POST(request: Request) { return proxyAlerts(request, '/settings/email-config/test'); }

import { proxyAlerts } from '../../alerts-proxy';
export async function GET(request: Request) { return proxyAlerts(request, '/settings/email-config'); }
export async function POST(request: Request) { return proxyAlerts(request, '/settings/email-config'); }

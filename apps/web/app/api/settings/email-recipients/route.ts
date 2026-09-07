import { proxyAlerts } from '../../alerts-proxy';
export async function GET(request: Request) { return proxyAlerts(request, '/settings/email-recipients'); }
export async function POST(request: Request) { return proxyAlerts(request, '/settings/email-recipients'); }
export async function PUT(request: Request) { return proxyAlerts(request, '/settings/email-recipients'); }
export async function DELETE(request: Request) { return proxyAlerts(request, '/settings/email-recipients'); }

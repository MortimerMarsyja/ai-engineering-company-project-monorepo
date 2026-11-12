import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function GET(request: Request) {
  return proxyAuthenticated(request, "/allowed-emails", "GET");
}

export async function POST(request: Request) {
  return proxyAuthenticated(request, "/allowed-emails", "POST");
}

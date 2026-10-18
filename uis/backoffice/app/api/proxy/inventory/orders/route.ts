import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function GET(request: Request) {
  return proxyAuthenticated(request, "/inventory/orders", "GET");
}

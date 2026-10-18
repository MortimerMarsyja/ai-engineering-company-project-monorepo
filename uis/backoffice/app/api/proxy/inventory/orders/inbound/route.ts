import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function POST(request: Request) {
  return proxyAuthenticated(request, "/inventory/orders/inbound", "POST");
}

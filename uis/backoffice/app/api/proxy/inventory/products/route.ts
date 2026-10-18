import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function GET(request: Request) {
  return proxyAuthenticated(request, "/inventory/products", "GET");
}

export async function POST(request: Request) {
  return proxyAuthenticated(request, "/inventory/products", "POST");
}

import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyAuthenticated(request, `/incidents${search}`, "GET");
}

export async function POST(request: Request) {
  return proxyAuthenticated(request, "/incidents", "POST");
}

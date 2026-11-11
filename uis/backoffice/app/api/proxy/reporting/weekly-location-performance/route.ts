import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyAuthenticated(request, `/reporting/weekly-location-performance${search}`, "GET");
}

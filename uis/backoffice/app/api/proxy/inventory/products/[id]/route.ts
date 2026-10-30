import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthenticated(request, `/inventory/products/${id}`, "GET");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthenticated(request, `/inventory/products/${id}`, "PATCH");
}

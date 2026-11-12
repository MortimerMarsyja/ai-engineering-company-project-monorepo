import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthenticated(request, `/allowed-emails/${id}`, "DELETE");
}

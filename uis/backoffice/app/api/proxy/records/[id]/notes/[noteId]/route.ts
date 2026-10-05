import { proxyAuthenticated } from "@/lib/backend-proxy";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await params;
  return proxyAuthenticated(request, `/records/${id}/notes/${noteId}`, "DELETE");
}

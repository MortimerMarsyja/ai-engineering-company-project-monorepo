import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// Multipart upload — forwarded as-is (no JSON Content-Type override),
// unlike proxyAuthenticated which assumes a JSON body.
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const response = await fetch(`${BACKEND_URL}/incidents/analyze`, {
      method: "POST",
      headers: { Authorization: authorization },
      body: formData,
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Incidents service is unavailable" },
      { status: 503 },
    );
  }
}

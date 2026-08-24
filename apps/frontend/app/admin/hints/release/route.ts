import { NextRequest, NextResponse } from "next/server";
import { serverApi } from "../../../lib/server-api";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const stageId = formData.get("stageId");
  if (typeof stageId !== "string") {
    throw new Error("Invalid hint stage");
  }

  const result = await serverApi(
    "/api/admin/hints/release",
    {
      method: "POST",
      body: JSON.stringify({ stageId }),
    },
    request.headers.get("cookie") ?? undefined,
  );
  if (!result.ok) {
    throw new Error("Failed to release hint stage");
  }

  return NextResponse.redirect(new URL("/admin/operations#hints", request.url));
}

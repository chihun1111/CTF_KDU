import { NextRequest, NextResponse } from "next/server";
import { serverApi } from "../../../lib/server-api";
import { isSameOriginForm, noStoreHeaders, publicUrl } from "../../../lib/request-policy";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginForm(request)) {
    return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403, headers: noStoreHeaders() });
  }

  let stageId: FormDataEntryValue | null;
  try {
    const formData = await request.formData();
    stageId = formData.get("stageId");
    if (formData.getAll("stageId").length !== 1) {
      stageId = null;
    }
  } catch {
    return NextResponse.json({ message: "입력값을 확인해주세요." }, { status: 400, headers: noStoreHeaders() });
  }
  if (typeof stageId !== "string" || !/^0[1-8]:(first|second|extra)$/.test(stageId)) {
    return NextResponse.json({ message: "입력값을 확인해주세요." }, { status: 400, headers: noStoreHeaders() });
  }

  const result = await serverApi(
    "/api/admin/hints/release",
    {
      method: "POST",
      body: JSON.stringify({ stageId }),
    },
    request.headers.get("cookie") ?? "",
  );
  if (!result.ok) {
    if (result.status === 401) {
      return NextResponse.redirect(publicUrl("/login", request), { status: 303, headers: noStoreHeaders() });
    }
    return NextResponse.json(
      { message: "안내를 공개하지 못했습니다. 운영 화면에서 상태를 확인한 뒤 다시 시도해주세요." },
      { status: result.status === 403 ? 403 : 502, headers: noStoreHeaders() },
    );
  }

  // A form POST must redirect as GET; 307 would replay it to the page route.
  return NextResponse.redirect(publicUrl("/admin/operations#hints", request), { status: 303, headers: noStoreHeaders() });
}

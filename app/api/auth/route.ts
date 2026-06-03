import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { clave } = await req.json();
  const secret = process.env.SESSION_SECRET;
  if (clave && secret && clave === process.env.ACCESS_CLAVE) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("pcc_session", secret, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}

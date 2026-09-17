import { timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/app/chatgpt-auth";

export const runtime = "nodejs";

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  let body: unknown;
  try { body=await request.json(); } catch { return NextResponse.json({error:"Invalid request."},{status:400}); }
  const password=body && typeof body === "object" && "password" in body ? body.password : undefined;
  const expected = process.env.ADMIN_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!expected || !authSecret) return NextResponse.json({ error: "Admin login is not configured." }, { status: 503 });
  if (typeof password !== "string" || !password || !equal(password, expected)) return NextResponse.json({ error: "Incorrect password." }, { status: 401 });

  const token = await new SignJWT({ name: "Gentwelve Admin", email: "admin@gentwelve.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuer("gentwelve-catalogue")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(authSecret));

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

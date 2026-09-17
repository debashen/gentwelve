import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export const ADMIN_COOKIE = "gentwelve_admin";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "gentwelve-catalogue" });
    return {
      userId: String(payload.sub ?? "admin"),
      displayName: String(payload.name ?? "Gentwelve Admin"),
      email: String(payload.email ?? "admin@gentwelve.com"),
      fullName: String(payload.name ?? "Gentwelve Admin"),
    };
  } catch {
    return null;
  }
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(`/admin/login?returnTo=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`);
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin";
  return value;
}

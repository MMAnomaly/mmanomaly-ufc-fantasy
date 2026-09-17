import "server-only";

import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./auth-cookie";
import { prisma } from "./prisma";

export { SESSION_COOKIE };

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short. Copy .env.example to .env.");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.id || !payload.email || !payload.displayName) return null;
    return {
      id: String(payload.id),
      email: String(payload.email),
      displayName: String(payload.displayName),
    };
  } catch {
    return null;
  }
}

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${q}`);
  }
  return session;
}

export async function requireCommissioner(leagueId: string) {
  const user = await requireUser();
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) redirect("/");
  if (league.commissionerId !== user.id) {
    redirect(`/leagues/${leagueId}`);
  }
  return { user, league };
}

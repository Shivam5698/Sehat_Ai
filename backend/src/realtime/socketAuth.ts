import jwt from "jsonwebtoken";

export function getSocketUserId(token: unknown, secret: string): string | null {
  if (typeof token !== "string" || !token.trim()) return null;
  const normalized = token.startsWith("Bearer ") ? token.slice(7) : token;

  try {
    const payload = jwt.verify(normalized, secret);
    if (typeof payload === "string" || typeof payload.sub !== "string" || !payload.sub) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

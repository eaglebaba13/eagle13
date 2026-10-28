import { timingSafeEqual } from "node:crypto";

const SECRET_HEADER = "x-morning-brief-secret";
const SECRET_FORMAT = /^[A-Za-z0-9_-]{32,256}$/;

export type MorningBriefCronAuthorization =
  | { readonly authorized: true }
  | { readonly authorized: false; readonly reason: "not_configured" | "unauthorized" };

export function authorizeMorningBriefCronRequest(request: Request): MorningBriefCronAuthorization {
  const expectedSecret = process.env.MORNING_BRIEF_CRON_SECRET ?? "";
  if (!SECRET_FORMAT.test(expectedSecret)) {
    return { authorized: false, reason: "not_configured" };
  }

  const providedSecret = request.headers.get(SECRET_HEADER) ?? "";
  if (!SECRET_FORMAT.test(providedSecret)) {
    return { authorized: false, reason: "unauthorized" };
  }

  const expectedBytes = Buffer.from(expectedSecret, "utf8");
  const providedBytes = Buffer.from(providedSecret, "utf8");
  if (expectedBytes.length !== providedBytes.length) {
    return { authorized: false, reason: "unauthorized" };
  }

  return timingSafeEqual(expectedBytes, providedBytes)
    ? { authorized: true }
    : { authorized: false, reason: "unauthorized" };
}

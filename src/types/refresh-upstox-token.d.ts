declare module "*scripts/refresh-upstox-token.mjs" {
  export function base32Decode(secret: string): Buffer;
  export function generateTotp(
    secret: string,
    stepSec?: number,
    digits?: number,
    timeMs?: number
  ): string;
  export function decodeJwtExp(jwt: string | null | undefined): {
    expSec: number;
    expDate: Date;
    sub: string;
    isPlusPlan: boolean;
  } | null;
}

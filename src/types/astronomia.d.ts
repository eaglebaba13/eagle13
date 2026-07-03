declare module "astronomia/planetposition" {
  export class Planet {
    constructor(data: unknown);
    position(jde: number): { lon: number; lat: number; range: number };
    position2000(jde: number): { lon: number; lat: number; range: number };
  }
  const _default: unknown;
  export default _default;
}
declare module "astronomia/julian" {
  export function CalendarGregorianToJD(y: number, m: number, d: number): number;
  const _default: unknown;
  export default _default;
}
declare module "astronomia/solar" {
  export function apparentLongitude(t: number): number;
  const _default: unknown;
  export default _default;
}
declare module "astronomia/moonposition" {
  export function position(jde: number): { lon: number; lat: number; range: number };
  const _default: unknown;
  export default _default;
}
declare module "astronomia/base" {
  export function J2000Century(jde: number): number;
  const _default: unknown;
  export default _default;
}
declare module "astronomia/data/*" {
  const data: { default?: unknown } & Record<string, unknown>;
  export default data;
}
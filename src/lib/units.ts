import type { Units } from './settings';

/**
 * Unit display + conversion.
 *
 * Events are stored in canonical metric units (ml, kg, cm, °C). These helpers
 * convert between the stored value and the user's preferred display unit.
 */

export const ML_PER_OZ = 29.5735295625;
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const round1 = (v: number): number => Math.round(v * 10) / 10;
export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Trim trailing zeros for display: 4.0 -> "4", 4.25 -> "4.25". */
function num(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export function volumeUnit(u: Units): string {
  return u === 'metric' ? 'ml' : 'oz';
}
export function weightUnit(u: Units): string {
  return u === 'metric' ? 'kg' : 'lb';
}
export function lengthUnit(u: Units): string {
  return u === 'metric' ? 'cm' : 'in';
}
export function tempUnit(u: Units): string {
  return u === 'metric' ? '°C' : '°F';
}

// --- display (canonical -> human string) -----------------------------------

export function fmtVolume(ml: number, u: Units): string {
  return u === 'metric' ? `${num(ml)} ml` : `${num(round1(ml / ML_PER_OZ))} oz`;
}
export function fmtWeight(kg: number, u: Units): string {
  return u === 'metric' ? `${num(kg)} kg` : `${num(round1(kg / KG_PER_LB))} lb`;
}
export function fmtLength(cm: number, u: Units): string {
  return u === 'metric' ? `${num(cm)} cm` : `${num(round1(cm / CM_PER_IN))} in`;
}
export function fmtTemp(c: number, u: Units): string {
  return u === 'metric' ? `${num(c)} °C` : `${num(round1(c * (9 / 5) + 32))} °F`;
}

// --- input (display value -> canonical) -------------------------------------

export function volumeToMl(v: number, u: Units): number {
  return u === 'metric' ? v : v * ML_PER_OZ;
}
export function weightToKg(v: number, u: Units): number {
  return u === 'metric' ? v : v * KG_PER_LB;
}
export function lengthToCm(v: number, u: Units): number {
  return u === 'metric' ? v : v * CM_PER_IN;
}
export function tempToC(v: number, u: Units): number {
  return u === 'metric' ? v : ((v - 32) * 5) / 9;
}

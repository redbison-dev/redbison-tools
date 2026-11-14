/**
 * Torsion of solid and hollow circular shafts (elastic, linear).
 *
 * Method (Gere and Goodno, Mechanics of Materials, ch. 3; Budynas and
 * Nisbett, Shigley's Mechanical Engineering Design, 11th ed., sec. 3-12):
 *   J = π (do⁴ − di⁴) / 32                      polar moment of area
 *   τmax = T (do/2) / J                           shear stress at the outer surface
 *   θ = T L / (G J)                               angle of twist, radians
 *   stepped shafts: θ = Σ Ti Li / (Gi Ji)          segment by segment
 *   T = P / ω                                     torque from power and speed
 *
 * All functions here work in SI base units (N·m, m, Pa, W, rad). The page
 * converts to and from the units the user picks.
 */
import { msg } from '../../msg';

/** Shear modulus presets, typical room-temperature values from Shigley's Table A-5 (11th ed.). */
export const SHAFT_MATERIALS = [
  { id: 'carbon-steel', label: msg('Carbon or alloy steel'), G: 79.3e9, E: 207e9, nu: 0.292 },
  { id: 'stainless', label: msg('Stainless steel 18-8'), G: 73.1e9, E: 190e9, nu: 0.305 },
  { id: 'aluminum', label: msg('Aluminium alloys'), G: 26.9e9, E: 71.7e9, nu: 0.333 },
  { id: 'titanium', label: msg('Titanium alloys'), G: 42.4e9, E: 114e9, nu: 0.34 },
  { id: 'brass', label: msg('Brass'), G: 40.1e9, E: 106e9, nu: 0.324 },
] as const;
export type ShaftMaterialId = (typeof SHAFT_MATERIALS)[number]['id'];

/** G = E / (2 (1 + ν)) for an isotropic material. */
export function shearModulus(E: number, nu: number): number {
  if (!(E > 0)) throw new Error(msg("Young's modulus must be greater than zero."));
  if (!(nu > -1 && nu < 0.5)) throw new Error(msg("Poisson's ratio must be between -1 and 0.5."));
  return E / (2 * (1 + nu));
}

/** Torque in N·m from power in W and speed in rpm (T = P / ω). */
export function torqueFromPower(powerW: number, rpm: number): number {
  if (!(rpm > 0)) throw new Error(msg('Speed must be greater than zero.'));
  if (!(powerW >= 0)) throw new Error(msg('Power cannot be negative.'));
  return powerW / ((rpm * 2 * Math.PI) / 60);
}

/** Polar moment of area of a solid (di = 0) or hollow round shaft, m⁴. */
export function polarMoment(outerD: number, innerD = 0): number {
  if (!(outerD > 0)) throw new Error(msg('Outer diameter must be greater than zero.'));
  if (!(innerD >= 0)) throw new Error(msg('Inner diameter cannot be negative.'));
  if (innerD >= outerD) throw new Error(msg('Inner diameter must be smaller than the outer diameter.'));
  return (Math.PI * (outerD ** 4 - innerD ** 4)) / 32;
}

export type ShaftSegment = {
  /** Segment length, m. */
  length: number;
  /** Outer diameter, m. */
  outerD: number;
  /** Bore, m (0 for a solid shaft). */
  innerD?: number;
  /** Internal torque carried by this segment, N·m (sign gives direction). */
  torque: number;
  /** Shear modulus, Pa. */
  G: number;
};

export type SegmentResult = {
  J: number;
  /** Polar section modulus J / (do/2), m³. */
  Zp: number;
  /** Shear stress at the outer surface, Pa (magnitude). */
  tauMax: number;
  /** Shear stress at the bore, Pa (0 for solid). */
  tauInner: number;
  /** Angle of twist, rad (signed with the torque). */
  twist: number;
  /** Torsional stiffness G J / L, N·m per rad. */
  stiffness: number;
};

export function torsionSegment(s: ShaftSegment): SegmentResult {
  if (!(s.length > 0)) throw new Error(msg('Length must be greater than zero.'));
  if (!(s.G > 0)) throw new Error(msg('Shear modulus must be greater than zero.'));
  if (!Number.isFinite(s.torque)) throw new Error(msg('Torque must be a number.'));
  const di = s.innerD ?? 0;
  const J = polarMoment(s.outerD, di);
  const T = Math.abs(s.torque);
  return {
    J,
    Zp: J / (s.outerD / 2),
    tauMax: (T * s.outerD) / 2 / J,
    tauInner: (T * di) / 2 / J,
    twist: (s.torque * s.length) / (s.G * J),
    stiffness: (s.G * J) / s.length,
  };
}

export type ShaftTorsionResult = {
  segments: SegmentResult[];
  /** Total angle of twist end to end, rad (signed sum). */
  totalTwist: number;
  totalTwistDeg: number;
  /** Largest outer-surface shear stress in any segment, Pa. */
  maxTau: number;
  /** Index of the segment with the largest stress. */
  maxTauSegment: number;
  totalLength: number;
};

/** One or more segments in series (a stepped shaft). */
export function shaftTorsion(segments: ShaftSegment[]): ShaftTorsionResult {
  if (segments.length === 0) throw new Error(msg('Add at least one segment.'));
  const res = segments.map(torsionSegment);
  let maxTauSegment = 0;
  res.forEach((r, k) => {
    if (r.tauMax > res[maxTauSegment].tauMax) maxTauSegment = k;
  });
  const totalTwist = res.reduce((a, r) => a + r.twist, 0);
  return {
    segments: res,
    totalTwist,
    totalTwistDeg: (totalTwist * 180) / Math.PI,
    maxTau: res[maxTauSegment].tauMax,
    maxTauSegment,
    totalLength: segments.reduce((a, s) => a + s.length, 0),
  };
}

/** Largest torque a uniform segment can carry within an allowable shear stress and, optionally, an allowable twist (rad). */
export function allowableTorque(s: Omit<ShaftSegment, 'torque'>, tauAllow: number, twistAllow?: number): { byStress: number; byTwist: number; governing: number; governedBy: 'stress' | 'twist' } {
  if (!(tauAllow > 0)) throw new Error(msg('Allowable shear stress must be greater than zero.'));
  const J = polarMoment(s.outerD, s.innerD ?? 0);
  const byStress = (tauAllow * J) / (s.outerD / 2);
  const byTwist = twistAllow && twistAllow > 0 ? (twistAllow * s.G * J) / s.length : Infinity;
  return byTwist < byStress ? { byStress, byTwist, governing: byTwist, governedBy: 'twist' } : { byStress, byTwist, governing: byStress, governedBy: 'stress' };
}

/**
 * Smallest outer diameter that keeps τmax at or below tauAllow, for a solid
 * shaft (ratio 0) or a hollow one with bore = ratio × outer diameter.
 * d = (16 T / (π τ (1 − k⁴)))^(1/3).
 */
export function requiredDiameterForStress(torque: number, tauAllow: number, ratio = 0): number {
  if (!(tauAllow > 0)) throw new Error(msg('Allowable shear stress must be greater than zero.'));
  if (!(ratio >= 0 && ratio < 1)) throw new Error(msg('Bore ratio must be between 0 and 1.'));
  return Math.cbrt((16 * Math.abs(torque)) / (Math.PI * tauAllow * (1 - ratio ** 4)));
}

/** Smallest outer diameter that keeps the twist of length L at or below twistAllow (rad). d = (32 T L / (π G θ (1 − k⁴)))^(1/4). */
export function requiredDiameterForTwist(torque: number, length: number, G: number, twistAllow: number, ratio = 0): number {
  if (!(twistAllow > 0)) throw new Error(msg('Allowable twist must be greater than zero.'));
  if (!(ratio >= 0 && ratio < 1)) throw new Error(msg('Bore ratio must be between 0 and 1.'));
  return Math.pow((32 * Math.abs(torque) * length) / (Math.PI * G * twistAllow * (1 - ratio ** 4)), 0.25);
}

/**
 * Photography and video calculators: depth of field, exposure value,
 * ND filters, star-trail limits (500 rule and NPF rule), field of view and
 * video file size. Pure functions shared by the pages and the MCP specs, so
 * both always give the same numbers. Lengths are millimetres unless a name
 * says otherwise.
 */
import { msg } from '../../msg';

export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const pos = (x: number) => Number.isFinite(x) && x > 0;

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

/** Diagonal of a 36 x 24 mm frame, the reference for crop factors. */
export const FULL_FRAME_DIAGONAL = Math.hypot(36, 24); // 43.2666 mm

export type SensorPreset = { id: string; label: string; width: number; height: number };

/** Common sensor formats, image area in mm (manufacturer specifications, rounded to 0.1 mm). */
export const SENSORS: SensorPreset[] = [
  { id: 'ff', label: msg('Full frame 35 mm (36 × 24 mm)'), width: 36, height: 24 },
  { id: 'apsc', label: msg('APS-C Nikon, Sony, Fujifilm (23.5 × 15.6 mm)'), width: 23.5, height: 15.6 },
  { id: 'apsc-canon', label: msg('APS-C Canon (22.3 × 14.9 mm)'), width: 22.3, height: 14.9 },
  { id: 'mft', label: msg('Micro Four Thirds (17.3 × 13 mm)'), width: 17.3, height: 13 },
  { id: '1in', label: msg('1-inch type (13.2 × 8.8 mm)'), width: 13.2, height: 8.8 },
  { id: '1-2.3', label: msg('1/2.3-inch type (6.17 × 4.55 mm)'), width: 6.17, height: 4.55 },
  { id: 'gfx', label: msg('Medium format 44 × 33 (43.8 × 32.9 mm)'), width: 43.8, height: 32.9 },
  { id: 'mf645', label: msg('Medium format 645 digital (53.4 × 40 mm)'), width: 53.4, height: 40 },
];

export function getSensor(id: string): SensorPreset | undefined {
  return SENSORS.find((s) => s.id === id);
}

export function sensorDiagonal(width: number, height: number): number {
  return Math.hypot(width, height);
}

/** Crop factor relative to 36 x 24 mm, by diagonal. */
export function cropFactor(width: number, height: number): number {
  return FULL_FRAME_DIAGONAL / sensorDiagonal(width, height);
}

/**
 * Circle of confusion from the sensor diagonal. The classic rule is d/1500
 * (0.029 mm for full frame, which tables round to 0.03 mm); Zeiss used d/1730.
 */
export function cocFromSensor(width: number, height: number, divisor = 1500): number {
  return sensorDiagonal(width, height) / divisor;
}

/** Pixel pitch in micrometres from sensor size and resolution (megapixels), assuming square pixels. */
export function pixelPitchUm(width: number, height: number, megapixels: number): number {
  return Math.sqrt((width * height) / (megapixels * 1e6)) * 1000;
}

// ---------------------------------------------------------------------------
// Depth of field
// ---------------------------------------------------------------------------

export type DofInput = {
  /** Focal length, mm. */
  focalMm: number;
  /** f-number N. */
  fNumber: number;
  /** Focus distance from the lens, mm. */
  distanceMm: number;
  /** Circle of confusion, mm. */
  cocMm: number;
};

export type DofResult = {
  hyperfocalMm: number;
  nearMm: number;
  /** Infinity when the focus distance is at or beyond the hyperfocal distance. */
  farMm: number;
  totalMm: number;
  frontMm: number;
  behindMm: number;
  /** Share of the zone in front of the subject (0..1); 0.5 means split evenly. */
  frontShare: number;
  /** Near limit when focused at the hyperfocal distance (H / 2). */
  hyperfocalNearMm: number;
  magnification: number;
};

/**
 * Thin-lens depth of field (the formulas used by DOFMaster and most
 * textbooks): H = f²/(N c) + f, Dn = s(H − f)/(H + s − 2f),
 * Df = s(H − f)/(H − s) for s < H, otherwise infinite.
 */
export function depthOfField(i: DofInput): Result<DofResult> {
  const { focalMm: f, fNumber: N, distanceMm: s, cocMm: c } = i;
  if (!pos(f) || f > 5000) return fail(msg('Focal length must be between 0 and 5000 mm.'));
  if (!pos(N) || N < 0.5 || N > 128) return fail(msg('Aperture must be between f/0.5 and f/128.'));
  if (!pos(c) || c > 1) return fail(msg('Circle of confusion must be between 0 and 1 mm.'));
  if (!pos(s)) return fail(msg('Focus distance must be greater than zero.'));
  if (s <= f) return fail(msg('The focus distance must be longer than the focal length.'));
  const H = (f * f) / (N * c) + f;
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s >= H ? Infinity : (s * (H - f)) / (H - s);
  const total = far - near;
  const front = s - near;
  const behind = far - s;
  return ok({
    hyperfocalMm: H,
    nearMm: near,
    farMm: far,
    totalMm: total,
    frontMm: front,
    behindMm: behind,
    frontShare: Number.isFinite(total) ? front / total : 0,
    hyperfocalNearMm: H / 2,
    magnification: f / (s - f),
  });
}

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

/** EV of a setting: log2(N²/t). */
export function settingEv(fNumber: number, seconds: number): number {
  return Math.log2((fNumber * fNumber) / seconds);
}

/** The scene brightness (EV at ISO 100) that the settings expose correctly: log2(N²/t) − log2(ISO/100). */
export function ev100(fNumber: number, seconds: number, iso: number): number {
  return settingEv(fNumber, seconds) - Math.log2(iso / 100);
}

export type ExposureSolveFor = 'shutter' | 'aperture' | 'iso';

/** Solve the missing setting for a target EV100, keeping the other two. */
export function solveExposure(
  targetEv100: number,
  known: { fNumber?: number; seconds?: number; iso?: number },
  solveFor: ExposureSolveFor,
): Result<number> {
  if (!Number.isFinite(targetEv100)) return fail(msg('Enter a valid exposure value.'));
  const { fNumber: N, seconds: t, iso } = known;
  if (solveFor !== 'aperture' && !(N && pos(N))) return fail(msg('Aperture must be greater than zero.'));
  if (solveFor !== 'shutter' && !(t && pos(t))) return fail(msg('Shutter speed must be greater than zero.'));
  if (solveFor !== 'iso' && !(iso && pos(iso))) return fail(msg('ISO must be greater than zero.'));
  if (solveFor === 'shutter') return ok((N! * N!) / Math.pow(2, targetEv100 + Math.log2(iso! / 100)));
  if (solveFor === 'aperture') return ok(Math.sqrt(t! * Math.pow(2, targetEv100 + Math.log2(iso! / 100))));
  return ok(100 * Math.pow(2, settingEv(N!, t!) - targetEv100));
}

/** Third-stop shutter speeds in seconds, from 1/8000 s to 30 s (nominal camera markings). */
export const SHUTTER_SPEEDS: { label: string; seconds: number }[] = [
  ...[8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 60, 50, 40, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3].map((d) => ({ label: `1/${d}`, seconds: 1 / d })),
  { label: '0.4"', seconds: 0.4 },
  { label: '0.5"', seconds: 0.5 },
  { label: '0.6"', seconds: 0.6 },
  { label: '0.8"', seconds: 0.8 },
  ...[1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30].map((s) => ({ label: `${s}"`, seconds: s })),
];

/** Third-stop f-numbers as marked on lenses. */
export const APERTURES = [1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32];

/** Third-stop ISO speeds. */
export const ISOS = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600, 51200, 102400];

/** Nearest value in a list on a log scale, and the gap in stops (positive = the nearest value is larger). */
export function nearestStop(value: number, list: number[], stopsPerDoubling = 1): { value: number; stops: number } {
  let best = list[0];
  for (const v of list) if (Math.abs(Math.log2(v / value)) < Math.abs(Math.log2(best / value))) best = v;
  return { value: best, stops: Math.log2(best / value) / stopsPerDoubling };
}

export function nearestShutter(seconds: number): { label: string; seconds: number; stops: number } {
  const n = nearestStop(seconds, SHUTTER_SPEEDS.map((s) => s.seconds));
  const s = SHUTTER_SPEEDS.find((x) => x.seconds === n.value)!;
  return { ...s, stops: n.stops };
}

/** Aperture gaps are in stops of light: one stop is a factor √2 in N. */
export function nearestAperture(fNumber: number): { value: number; stops: number } {
  return nearestStop(fNumber, APERTURES, 0.5);
}

/**
 * Parse a shutter speed: "1/250", "0.004", "2", "2s", '2"', "1m30s", "4m", "1:30".
 * Returns seconds, or NaN when the text is not a time.
 */
export function parseShutter(text: string): number {
  const s = String(text).trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
  if (!s) return NaN;
  let m = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?:s|sec)?$/);
  if (m) return Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : NaN;
  m = s.match(/^(\d+(?:\.\d+)?)(?:s|sec|"|″)?$/);
  if (m) return Number(m[1]);
  m = s.match(/^(?:(\d+)h)?(?:(\d+(?:\.\d+)?)(?:m|min))?(?:(\d+(?:\.\d+)?)(?:s|sec))?$/);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  m = s.match(/^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m && Number(m[3]) < 60) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return NaN;
}

/** Human shutter time: 1/250 s, 0.8 s, 30 s, 2 min 13 s, 1 h 4 min. */
export function formatShutter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'n/a';
  if (seconds < 0.3) {
    const d = 1 / seconds;
    const den = d >= 100 ? Math.round(d / 10) * 10 : d >= 10 ? Math.round(d) : Math.round(d * 10) / 10;
    return `1/${den} s`;
  }
  if (seconds < 10) return `${Number(seconds.toPrecision(2))} s`;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h} h ${m} min`;
  return sec ? `${m} min ${sec} s` : `${m} min`;
}

export type SceneEv = { id: string; label: string; ev: number; group: string };

/** Typical EV100 for scenes (Exposure value article, Wikipedia, after the ANSI PH2.7 exposure guide). Ranges use the midpoint. */
export const SCENE_EV: SceneEv[] = [
  { id: 'snow', group: msg('Daylight'), label: msg('Sand or snow in full sun'), ev: 16 },
  { id: 'sun', group: msg('Daylight'), label: msg('Full or slightly hazy sun, distinct shadows'), ev: 15 },
  { id: 'hazy', group: msg('Daylight'), label: msg('Hazy sun, soft shadows'), ev: 14 },
  { id: 'cloudy', group: msg('Daylight'), label: msg('Bright cloud cover, no shadows'), ev: 13 },
  { id: 'overcast', group: msg('Daylight'), label: msg('Heavy overcast'), ev: 12 },
  { id: 'shade', group: msg('Daylight'), label: msg('Open shade in clear sun'), ev: 12 },
  { id: 'sunset', group: msg('Daylight'), label: msg('At sunset'), ev: 12 },
  { id: 'after-sunset', group: msg('Daylight'), label: msg('Just after sunset'), ev: 10 },
  { id: 'gallery', group: msg('Indoor'), label: msg('Galleries'), ev: 9.5 },
  { id: 'stage', group: msg('Indoor'), label: msg('Sports events, stage shows'), ev: 8.5 },
  { id: 'office', group: msg('Indoor'), label: msg('Offices and work areas'), ev: 7.5 },
  { id: 'home', group: msg('Indoor'), label: msg('Home interiors'), ev: 6 },
  { id: 'signs', group: msg('Night'), label: msg('Neon and bright signs'), ev: 9.5 },
  { id: 'street-bright', group: msg('Night'), label: msg('Bright street scenes'), ev: 8 },
  { id: 'street', group: msg('Night'), label: msg('Night street scenes, window displays'), ev: 7.5 },
  { id: 'traffic', group: msg('Night'), label: msg('Night vehicle traffic'), ev: 5 },
  { id: 'floodlit', group: msg('Night'), label: msg('Floodlit buildings and monuments'), ev: 4 },
  { id: 'distant', group: msg('Night'), label: msg('Distant lighted buildings'), ev: 2 },
  { id: 'moon', group: msg('Moon and sky'), label: msg('The full moon itself (long lens)'), ev: 15 },
  { id: 'moonlit', group: msg('Moon and sky'), label: msg('Landscape under a full moon'), ev: -2.5 },
  { id: 'aurora', group: msg('Moon and sky'), label: msg('Bright aurora'), ev: -3.5 },
  { id: 'milky-way', group: msg('Moon and sky'), label: msg('Milky Way core'), ev: -10 },
];

// ---------------------------------------------------------------------------
// ND filters
// ---------------------------------------------------------------------------

export type NdFilter = { id: string; label: string; factor: number };

/** Filters by their usual "ND factor" names. Stops = log2(factor), optical density = log10(factor). */
export const ND_FILTERS: NdFilter[] = [
  { id: 'nd2', label: msg('ND2 (0.3, 1 stop)'), factor: 2 },
  { id: 'nd4', label: msg('ND4 (0.6, 2 stops)'), factor: 4 },
  { id: 'nd8', label: msg('ND8 (0.9, 3 stops)'), factor: 8 },
  { id: 'nd16', label: msg('ND16 (1.2, 4 stops)'), factor: 16 },
  { id: 'nd32', label: msg('ND32 (1.5, 5 stops)'), factor: 32 },
  { id: 'nd64', label: msg('ND64 (1.8, 6 stops)'), factor: 64 },
  { id: 'nd128', label: msg('ND128 (2.1, 7 stops)'), factor: 128 },
  { id: 'nd256', label: msg('ND256 (2.4, 8 stops)'), factor: 256 },
  { id: 'nd500', label: msg('ND500 (2.7, 9 stops)'), factor: 500 },
  { id: 'nd1000', label: msg('ND1000 (3.0, 10 stops)'), factor: 1000 },
  { id: 'nd4000', label: msg('ND4000 (3.6, 12 stops)'), factor: 4000 },
  { id: 'nd32000', label: msg('ND32000 (4.5, 15 stops)'), factor: 32000 },
  { id: 'nd100000', label: msg('ND100000 (5.0, 16.6 stops)'), factor: 100000 },
];

export const ndStopsFromFactor = (factor: number) => Math.log2(factor);
export const ndFactorFromStops = (stops: number) => Math.pow(2, stops);
export const ndDensityFromStops = (stops: number) => stops * Math.log10(2);
export const ndStopsFromDensity = (density: number) => density / Math.log10(2);

/** Light that gets through, as a percentage. */
export const ndTransmissionPct = (stops: number) => 100 / Math.pow(2, stops);

export type NdResult = {
  stops: number;
  factor: number;
  density: number;
  transmissionPct: number;
  /** Shutter time with the filter, seconds. */
  seconds: number;
  /** With film reciprocity correction when an exponent is given, else equal to seconds. */
  correctedSeconds: number;
};

/**
 * Shutter speed with ND filters. `stopsList` holds each stacked filter in
 * stops; they add. An optional reciprocity exponent p applies the power law
 * Tc = Tm^p for metered times over one second (film only).
 */
export function ndExposure(baseSeconds: number, stopsList: number[], reciprocityP?: number | null): Result<NdResult> {
  if (!pos(baseSeconds)) return fail(msg('Base shutter speed must be greater than zero.'));
  if (stopsList.length === 0 || stopsList.some((s) => !Number.isFinite(s) || s < 0 || s > 30)) return fail(msg('Each filter must be between 0 and 30 stops.'));
  if (reciprocityP != null && (!Number.isFinite(reciprocityP) || reciprocityP < 1 || reciprocityP > 2)) return fail(msg('The reciprocity exponent should be between 1 and 2.'));
  const stops = stopsList.reduce((a, b) => a + b, 0);
  const factor = ndFactorFromStops(stops);
  const seconds = baseSeconds * factor;
  const correctedSeconds = reciprocityP && seconds > 1 ? Math.pow(seconds, reciprocityP) : seconds;
  return ok({ stops, factor, density: ndDensityFromStops(stops), transmissionPct: ndTransmissionPct(stops), seconds, correctedSeconds });
}

/** ND strength needed to stretch a base shutter speed to a target, and the nearest stock filter at or above it. */
export function ndForTarget(baseSeconds: number, targetSeconds: number): Result<{ stops: number; factor: number; density: number; nearest: NdFilter | null }> {
  if (!pos(baseSeconds) || !pos(targetSeconds)) return fail(msg('Both shutter speeds must be greater than zero.'));
  if (targetSeconds <= baseSeconds) return fail(msg('The target time must be longer than the metered time.'));
  const stops = Math.log2(targetSeconds / baseSeconds);
  let nearest: NdFilter | null = null;
  for (const f of ND_FILTERS) {
    if (!nearest || Math.abs(ndStopsFromFactor(f.factor) - stops) < Math.abs(ndStopsFromFactor(nearest.factor) - stops)) nearest = f;
  }
  return ok({ stops, factor: ndFactorFromStops(stops), density: ndDensityFromStops(stops), nearest });
}

// ---------------------------------------------------------------------------
// Star trails: 500 rule and NPF rule
// ---------------------------------------------------------------------------

/** Sidereal day in seconds: the sky turns 360° in this time. */
export const SIDEREAL_DAY_S = 86164.0905;

export type StarInput = {
  focalMm: number;
  fNumber: number;
  /** Sensor size, mm. */
  sensorWidth: number;
  sensorHeight: number;
  /** Resolution in megapixels (for the pixel pitch). */
  megapixels: number;
  /** Declination of the target, degrees (0 = celestial equator, worst case). */
  declinationDeg: number;
  /** Rule constant for the "500 rule" family (500, 400, 300). */
  ruleConstant: number;
};

export type StarResult = {
  crop: number;
  pixelPitchUm: number;
  equivalentFocalMm: number;
  rule500s: number;
  npfSimpleS: number;
  /** NPF divided by cos(declination), declination capped at 85°. */
  npfDeclinationS: number;
  /** Star drift on the sensor, micrometres per second, at the declination given. */
  driftUmPerS: number;
  /** Trail length in pixels at each recommended time. */
  trailPx500: number;
  trailPxNpf: number;
};

/**
 * Maximum shutter time before stars streak.
 * 500 rule: t = K / (f × crop). NPF rule (Frédéric Michaud, Société
 * Astronomique du Havre), simple form: t = (35N + 30p) / f, with p the pixel
 * pitch in µm; stars away from the celestial equator move slower by cos δ.
 * Drift is exact geometry: f × ω × cos δ with ω = 2π / sidereal day.
 */
export function starTrailLimits(i: StarInput): Result<StarResult> {
  if (!pos(i.focalMm) || i.focalMm > 2000) return fail(msg('Focal length must be between 0 and 2000 mm.'));
  if (!pos(i.fNumber) || i.fNumber > 64) return fail(msg('Aperture must be between 0 and f/64.'));
  if (!pos(i.sensorWidth) || !pos(i.sensorHeight) || i.sensorWidth > 100 || i.sensorHeight > 100) return fail(msg('Sensor size must be between 0 and 100 mm.'));
  if (!pos(i.megapixels) || i.megapixels > 1000) return fail(msg('Resolution must be between 0 and 1000 megapixels.'));
  if (!Number.isFinite(i.declinationDeg) || Math.abs(i.declinationDeg) > 90) return fail(msg('Declination must be between −90° and 90°.'));
  if (!pos(i.ruleConstant) || i.ruleConstant > 1000) return fail(msg('Rule constant must be between 0 and 1000.'));
  const crop = cropFactor(i.sensorWidth, i.sensorHeight);
  const p = pixelPitchUm(i.sensorWidth, i.sensorHeight, i.megapixels);
  const rule500s = i.ruleConstant / (i.focalMm * crop);
  const npfSimpleS = (35 * i.fNumber + 30 * p) / i.focalMm;
  const dec = Math.min(Math.abs(i.declinationDeg), 85);
  const cosD = Math.cos((dec * Math.PI) / 180);
  const npfDeclinationS = npfSimpleS / cosD;
  const omega = (2 * Math.PI) / SIDEREAL_DAY_S;
  const driftUmPerS = i.focalMm * 1000 * omega * Math.cos((Math.abs(i.declinationDeg) * Math.PI) / 180);
  return ok({
    crop,
    pixelPitchUm: p,
    equivalentFocalMm: i.focalMm * crop,
    rule500s,
    npfSimpleS,
    npfDeclinationS,
    driftUmPerS,
    trailPx500: (driftUmPerS * rule500s) / p,
    trailPxNpf: (driftUmPerS * npfDeclinationS) / p,
  });
}

// ---------------------------------------------------------------------------
// Field of view
// ---------------------------------------------------------------------------

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export type FovResult = {
  horizontalDeg: number;
  verticalDeg: number;
  diagonalDeg: number;
  crop: number;
  equivalentFocalMm: number;
  /** Width, height and diagonal of the scene covered at the distance, in the distance's unit. */
  width: number | null;
  height: number | null;
  diagonal: number | null;
};

/**
 * Angle of view of a rectilinear lens focused at infinity: 2·atan(d / 2f)
 * for each sensor dimension d. Coverage at distance D is D·d/f.
 */
export function fieldOfView(focalMm: number, sensorWidth: number, sensorHeight: number, distance?: number | null): Result<FovResult> {
  if (!pos(focalMm) || focalMm > 5000) return fail(msg('Focal length must be between 0 and 5000 mm.'));
  if (!pos(sensorWidth) || !pos(sensorHeight) || sensorWidth > 200 || sensorHeight > 200) return fail(msg('Sensor size must be between 0 and 200 mm.'));
  if (distance != null && !pos(distance)) return fail(msg('Distance must be greater than zero.'));
  const diag = sensorDiagonal(sensorWidth, sensorHeight);
  const a = (d: number) => deg(2 * Math.atan(d / (2 * focalMm)));
  const crop = cropFactor(sensorWidth, sensorHeight);
  return ok({
    horizontalDeg: a(sensorWidth),
    verticalDeg: a(sensorHeight),
    diagonalDeg: a(diag),
    crop,
    equivalentFocalMm: focalMm * crop,
    width: distance != null ? (distance * sensorWidth) / focalMm : null,
    height: distance != null ? (distance * sensorHeight) / focalMm : null,
    diagonal: distance != null ? (distance * diag) / focalMm : null,
  });
}

/** Focal length that frames a scene `sceneWidth` wide at `distance` (same unit) on a sensor dimension. */
export function focalForCoverage(sceneSize: number, distance: number, sensorDimMm: number): Result<number> {
  if (!pos(sceneSize) || !pos(distance) || !pos(sensorDimMm)) return fail(msg('Scene size, distance and sensor size must be greater than zero.'));
  return ok((distance * sensorDimMm) / sceneSize);
}

/** Focal length for a given angle of view across a sensor dimension. */
export function focalForAngle(angleDeg: number, sensorDimMm: number): Result<number> {
  if (!Number.isFinite(angleDeg) || angleDeg <= 0 || angleDeg >= 180) return fail(msg('Angle must be between 0° and 180°.'));
  if (!pos(sensorDimMm)) return fail(msg('Sensor size must be greater than zero.'));
  return ok(sensorDimMm / (2 * Math.tan(rad(angleDeg) / 2)));
}

// ---------------------------------------------------------------------------
// Video file size
// ---------------------------------------------------------------------------

export type SizeUnit = 'MB' | 'GB' | 'MiB' | 'GiB' | 'TB';
const UNIT_BYTES: Record<SizeUnit, number> = { MB: 1e6, GB: 1e9, TB: 1e12, MiB: 1024 ** 2, GiB: 1024 ** 3 };
export const bytesIn = (value: number, unit: SizeUnit) => value * UNIT_BYTES[unit];
export const bytesTo = (bytes: number, unit: SizeUnit) => bytes / UNIT_BYTES[unit];

export type BitratePreset = { id: string; label: string; videoMbps: number; group: string };

/** YouTube recommended SDR upload bitrates (YouTube Help, "Recommended upload encoding settings") and Apple ProRes target rates at 1920 × 1080, 29.97 fps (Apple ProRes white paper). */
export const BITRATE_PRESETS: BitratePreset[] = [
  { id: 'yt-720', group: msg('YouTube upload (SDR)'), label: msg('720p, 24 to 30 fps: 5 Mbps'), videoMbps: 5 },
  { id: 'yt-720-60', group: msg('YouTube upload (SDR)'), label: msg('720p, 48 to 60 fps: 7.5 Mbps'), videoMbps: 7.5 },
  { id: 'yt-1080', group: msg('YouTube upload (SDR)'), label: msg('1080p, 24 to 30 fps: 8 Mbps'), videoMbps: 8 },
  { id: 'yt-1080-60', group: msg('YouTube upload (SDR)'), label: msg('1080p, 48 to 60 fps: 12 Mbps'), videoMbps: 12 },
  { id: 'yt-1440', group: msg('YouTube upload (SDR)'), label: msg('1440p, 24 to 30 fps: 16 Mbps'), videoMbps: 16 },
  { id: 'yt-2160', group: msg('YouTube upload (SDR)'), label: msg('4K, 24 to 30 fps: 45 Mbps (35 to 45)'), videoMbps: 45 },
  { id: 'yt-2160-60', group: msg('YouTube upload (SDR)'), label: msg('4K, 48 to 60 fps: 68 Mbps (53 to 68)'), videoMbps: 68 },
  { id: 'prores-proxy', group: msg('ProRes 1080p 29.97'), label: msg('ProRes 422 Proxy: 45 Mbps'), videoMbps: 45 },
  { id: 'prores-lt', group: msg('ProRes 1080p 29.97'), label: msg('ProRes 422 LT: 102 Mbps'), videoMbps: 102 },
  { id: 'prores-422', group: msg('ProRes 1080p 29.97'), label: msg('ProRes 422: 147 Mbps'), videoMbps: 147 },
  { id: 'prores-hq', group: msg('ProRes 1080p 29.97'), label: msg('ProRes 422 HQ: 220 Mbps'), videoMbps: 220 },
  { id: 'prores-4444', group: msg('ProRes 1080p 29.97'), label: msg('ProRes 4444: 330 Mbps'), videoMbps: 330 },
];

export type VideoSizeInput = {
  videoMbps: number;
  audioKbps: number;
  durationSec: number;
  /** Container overhead in percent (MP4 is usually under 1%). */
  overheadPct: number;
  /** Number of identical streams or cameras recording at once. */
  streams?: number;
};

export type VideoSizeResult = { totalMbps: number; bytes: number; bytesPerMinute: number; gbPerHour: number };

/** Size = (video + audio bitrate) × duration ÷ 8, plus container overhead. Decimal units (1 Mbps = 10⁶ bit/s). */
export function videoFileSize(i: VideoSizeInput): Result<VideoSizeResult> {
  if (!Number.isFinite(i.videoMbps) || i.videoMbps < 0 || i.videoMbps > 100000) return fail(msg('Video bitrate must be between 0 and 100,000 Mbps.'));
  if (!Number.isFinite(i.audioKbps) || i.audioKbps < 0 || i.audioKbps > 100000) return fail(msg('Audio bitrate must be between 0 and 100,000 kbps.'));
  if (i.videoMbps === 0 && i.audioKbps === 0) return fail(msg('Enter a video or audio bitrate.'));
  if (!pos(i.durationSec)) return fail(msg('Duration must be greater than zero.'));
  if (!Number.isFinite(i.overheadPct) || i.overheadPct < 0 || i.overheadPct > 50) return fail(msg('Overhead must be between 0 and 50%.'));
  const streams = i.streams ?? 1;
  if (!Number.isInteger(streams) || streams < 1 || streams > 100) return fail(msg('Streams must be a whole number from 1 to 100.'));
  const totalMbps = (i.videoMbps + i.audioKbps / 1000) * streams;
  const bitsPerSec = totalMbps * 1e6 * (1 + i.overheadPct / 100);
  const bytes = (bitsPerSec * i.durationSec) / 8;
  return ok({ totalMbps, bytes, bytesPerMinute: (bitsPerSec * 60) / 8, gbPerHour: (bitsPerSec * 3600) / 8 / 1e9 });
}

/** Video bitrate that fits a duration into a target size, after audio and overhead. */
export function bitrateForSize(targetBytes: number, durationSec: number, audioKbps: number, overheadPct: number): Result<{ videoMbps: number; totalMbps: number }> {
  if (!pos(targetBytes)) return fail(msg('Target size must be greater than zero.'));
  if (!pos(durationSec)) return fail(msg('Duration must be greater than zero.'));
  if (!Number.isFinite(audioKbps) || audioKbps < 0) return fail(msg('Audio bitrate cannot be negative.'));
  if (!Number.isFinite(overheadPct) || overheadPct < 0 || overheadPct > 50) return fail(msg('Overhead must be between 0 and 50%.'));
  const totalMbps = (targetBytes * 8) / durationSec / (1 + overheadPct / 100) / 1e6;
  const videoMbps = totalMbps - audioKbps / 1000;
  if (videoMbps <= 0) return fail(msg('The audio alone fills the target size. Lower the audio bitrate, shorten the clip or raise the target.'));
  return ok({ videoMbps, totalMbps });
}

/** Recording time that fits on storage of `capacityBytes` at a total bitrate. */
export function recordingTime(capacityBytes: number, videoMbps: number, audioKbps: number, overheadPct: number): Result<number> {
  if (!pos(capacityBytes)) return fail(msg('Storage capacity must be greater than zero.'));
  if (!(videoMbps >= 0) || !(audioKbps >= 0)) return fail(msg('Bitrates cannot be negative.'));
  const total = videoMbps + audioKbps / 1000;
  if (!Number.isFinite(total) || total <= 0) return fail(msg('Enter a bitrate greater than zero.'));
  if (!Number.isFinite(overheadPct) || overheadPct < 0 || overheadPct > 50) return fail(msg('Overhead must be between 0 and 50%.'));
  return ok((capacityBytes * 8) / (total * 1e6 * (1 + overheadPct / 100)));
}

/** Bits per pixel per frame, a rough quality yardstick for the same codec. */
export function bitsPerPixel(videoMbps: number, width: number, height: number, fps: number): number {
  if (!pos(width) || !pos(height) || !pos(fps) || !(videoMbps >= 0)) return NaN;
  return (videoMbps * 1e6) / (width * height * fps);
}

/** "1:30:00", "90:00", "45s", "2h", "90" (seconds) to seconds. NaN when invalid. */
export function parseDuration(text: string): number {
  const s = String(text).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return NaN;
  const hms = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?:in)?)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':');
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => /^\d+(?:\.\d+)?$/.test(p))) {
    const n = parts.map(Number);
    if (n.slice(1).some((x) => x >= 60)) return NaN;
    return n.reduce((acc, x) => acc * 60 + x, 0);
  }
  return NaN;
}

/** 5400 -> "1 h 30 min", 75 -> "1 min 15 s". */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return 'n/a';
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return s ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** Bytes to "1.23 GB" in decimal units (as cameras and card makers count). */
export function formatDecimalBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${i === 0 ? Math.round(v) : Number(v.toPrecision(v >= 100 ? 4 : 3))} ${units[i]}`;
}

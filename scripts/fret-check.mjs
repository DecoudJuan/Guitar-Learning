/**
 * Checks the fret-progression test with no camera and no photograph.
 *
 *   npm run fret-check
 *
 * The detector's whole problem is telling a fretboard from anything else in a
 * bedroom that has stripes on it, and the answer it now leans on is that frets
 * crowd towards the bridge by 2^(-n/12) while blankets, blinds and radiators
 * are evenly spaced. That claim is checkable without hardware: feed it the
 * positions a real neck produces, and the positions a striped thing produces,
 * and see which ones it accepts.
 */

import { fitFretProgression } from "../src/vision/NeckDetector.ts";

const fretAt = (n) => 1 - Math.pow(2, -n / 12);

/** Frets 1..count of a neck whose scale length is `scale` working pixels. */
function neck(count, scale = 300, nut = 40, noise = 0) {
  const out = [];
  for (let fret = 1; fret <= count; fret++) {
    out.push(nut + scale * fretAt(fret) + (Math.random() - 0.5) * 2 * noise);
  }
  return out;
}

/** Evenly spaced stripes: a blanket, a radiator, the slats of a blind. */
function stripes(count, gap = 14, from = 55) {
  return Array.from({ length: count }, (_, i) => from + i * gap);
}

let failures = 0;

function check(label, positions, nut, expect) {
  const fit = fitFretProgression(positions, nut);
  const got = fit ? `frets ${fit.frets.join(",")} score ${fit.score.toFixed(2)}` : "rejected";
  const ok = expect === "accept" ? Boolean(fit) : !fit;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(40)} ${got}`);
  return fit;
}

// What a guitar gives it.
check("frets 1-8, exact", neck(8), 40, "accept");
check("frets 1-8, 1px of noise", neck(8, 300, 40, 1), 40, "accept");
check("frets 1-4 only (light near the nut)", neck(4), 40, "accept");
const strays = check("frets 1-8 plus 3 stray lines", [...neck(8), 120, 175, 260], 40, "accept");
if (strays) {
  // Accepting it is not enough. What matters is the *scale*, because that is
  // what places every fret on the grid; a stray line that happens to sit on a
  // fret of the right scale is indistinguishable from a fret and harmless,
  // while a scale bought by strays reads eight frets as nineteen.
  const off = Math.abs(strays.scale - 300) / 300;
  const ok = off < 0.03;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${"strays did not stretch the scale".padEnd(40)} scale ${strays.scale.toFixed(1)} of 300`);
}
check("frets 1-12, short scale (150px)", neck(12, 150, 20), 20, "accept");
// The nut is found from where the strings stop, so it arrives a little off.
check("frets 1-8, nut estimated 4px late", neck(8), 44, "accept");

// What a room gives it.
check("6 even stripes, 14px apart", stripes(6), 55, "reject");
check("6 even stripes, 30px apart", stripes(6, 30), 55, "reject");
check("6 even stripes, 8px apart", stripes(6, 8), 55, "reject");
check("10 even stripes (a blind)", stripes(10), 55, "reject");
check("4 even stripes, wide", stripes(4, 45), 55, "reject");
check("3 random lines", [80, 132, 291], 40, "reject");

// The one that has to be right, not merely accepted: the number of frets the
// grid will be drawn over comes out of this fit.
const real = check("frets 1-9, does it read the count", neck(9), 40, "accept");
if (real) {
  const last = real.frets[real.frets.length - 1];
  const ok = last === 9;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${"furthest fret read as 9".padEnd(40)} got ${last}`);
}

// The finding that shaped the detector: fret positions are invariant to a
// shift of fret number, so wires alone cannot say which fret is which. Kept as
// a check so nobody writes the nut-free fit again.
const shifted = (() => {
  const k = 3;
  const a = neck(7, 300, 40);
  // Renumbering the frets n+k and multiplying the scale by 2^(k/12) — with the
  // nut moved to keep the constant term — reproduces the same positions.
  const scale = 300 * Math.pow(2, k / 12);
  const nut = 40 + 300 - scale;
  const b = Array.from({ length: 7 }, (_, i) => nut + scale * fretAt(i + 1 + k));
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
})();
{
  const ok = shifted < 1e-9;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${"frets 1-7 == frets 4-10, rescaled".padEnd(40)} worst difference ${shifted.toExponential(1)}`);
}

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

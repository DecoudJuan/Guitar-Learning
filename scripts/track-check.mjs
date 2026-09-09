/**
 * Checks the tracking maths without a camera.
 *
 *   npm run track-check
 *
 * A synthetic neck is warped by a known homography — the guitar shifting,
 * turning and tilting away — and the least-squares fit is asked to recover it
 * from the moved points, including some that are deliberately wrong the way a
 * hand across the strings makes them wrong.
 */

import { homographyFromMany, applyHomography, homographyFrom } from "../src/vision/homography.ts";

// A plausible camera view of a neck: shifted, rotated a little, and with the
// far end smaller than the near one.
const truth = homographyFrom(
  [
    { x: 0, y: -0.03 },
    { x: 0, y: 0.03 },
    { x: 0.5, y: 0.04 },
    { x: 0.5, y: -0.04 },
  ],
  [
    { x: 0.80, y: 0.42 },
    { x: 0.80, y: 0.52 },
    { x: 0.30, y: 0.60 },
    { x: 0.28, y: 0.36 },
  ],
);

// A dozen anchors spread over the fretboard, as the tracker lays them out.
const board = [];
for (let fret = 1; fret <= 6; fret++) {
  const x = (fret - 0.4) / 12;
  for (const y of [-0.02, 0, 0.02]) board.push({ x, y });
}

const clean = board.map((p) => applyHomography(truth, p));

function report(label, fitted, corrupted) {
  if (!fitted) {
    console.log(`${label.padEnd(34)} FAILED to fit`);
    return;
  }
  let worst = 0;
  for (const point of board) {
    const want = applyHomography(truth, point);
    const got = applyHomography(fitted, point);
    worst = Math.max(worst, Math.hypot(want.x - got.x, want.y - got.y));
  }
  // Expressed in pixels of a 1280-wide camera, which is what it has to mean.
  console.log(`${label.padEnd(34)} worst error ${(worst * 1280).toFixed(2)} px`);
}

report("exact points", homographyFromMany(board, clean));

// Sub-pixel matching noise, which is what patch tracking really returns.
const jittered = clean.map((p) => ({ x: p.x + (Math.random() - 0.5) * 0.002, y: p.y + (Math.random() - 0.5) * 0.002 }));
report("with matching jitter", homographyFromMany(board, jittered));

// Three anchors gone wrong: a hand landed on them and they matched something
// else nearby. Fitted naively, then with the trimmed refit the tracker uses.
const spoiled = jittered.map((p, i) => (i % 6 === 0 ? { x: p.x + 0.05, y: p.y - 0.04 } : p));
report("3 anchors wrong, naive fit", homographyFromMany(board, spoiled));

// What the tracker does: agree first, fit second.
const OUTLIER = 3 / 1280;
let bestInliers = [];
for (let attempt = 0; attempt < 60; attempt++) {
  const chosen = new Set();
  for (let guard = 0; guard < 40 && chosen.size < 4; guard++) chosen.add(Math.floor(Math.random() * board.length));
  if (chosen.size < 4) continue;
  const sample = [...chosen];
  const guess = homographyFrom(sample.map((i) => board[i]), sample.map((i) => spoiled[i]));
  if (!guess) continue;
  const inliers = [];
  for (let i = 0; i < board.length; i++) {
    const predicted = applyHomography(guess, board[i]);
    if (Math.hypot(predicted.x - spoiled[i].x, predicted.y - spoiled[i].y) <= OUTLIER) inliers.push(i);
  }
  if (inliers.length > bestInliers.length) bestInliers = inliers;
}
console.log(`  (consensus kept ${bestInliers.length} of ${board.length} anchors; 15 are good)`);
report(
  "3 anchors wrong, consensus fit",
  homographyFromMany(bestInliers.map((i) => board[i]), bestInliers.map((i) => spoiled[i])),
);

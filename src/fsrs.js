/* The math of the newer spaced-repetition scheduler (FSRS-6), written from the published description of the algorithm.
 * Every card has two hidden numbers:
 *   stability  (S): how many days until the chance of remembering falls to 90 %
 *   difficulty (D): 1 (easy) .. 10 (hard)
 * Works in the page and in node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FSRS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // the 21 default parameters of FSRS-6
  const DEFAULT_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
  const S_MIN = 0.001;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const clampD = (d) => clamp(d, 1, 10);

  const decay = (w) => -w[20];
  const factor = (w) => Math.pow(0.9, 1 / decay(w)) - 1;

  /** chance (0..1) that the card is remembered after t days */
  function retrievability(w, t, S) {
    return Math.pow(1 + (factor(w) * Math.max(0, t)) / S, decay(w));
  }

  /** days until the chance of remembering falls to r (for example 0.9) */
  function interval(w, S, r) {
    return (S / factor(w)) * (Math.pow(r, 1 / decay(w)) - 1);
  }

  const initS = (w, g) => Math.max(S_MIN, w[g - 1]);
  const initD = (w, g) => clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);

  function nextD(w, D, g) {
    const delta = -w[6] * (g - 3);
    const damped = D + (delta * (10 - D)) / 9;
    return clampD(w[7] * initD(w, 4) + (1 - w[7]) * damped);
  }

  /** after a successful review (hard, good or easy) */
  function recallS(w, D, S, R, g) {
    const hard = g === 2 ? w[15] : 1;
    const easy = g === 4 ? w[16] : 1;
    const inc = 1 + Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) * (Math.exp((1 - R) * w[10]) - 1) * hard * easy;
    return Math.max(S_MIN, S * inc);
  }

  /** after forgetting the card */
  function forgetS(w, D, S, R) {
    const next = w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp((1 - R) * w[14]);
    const cap = S / Math.exp(w[17] * w[18]);
    return Math.max(S_MIN, Math.min(next, cap));
  }

  /** a review on the same day as the last one (during learning steps) */
  function sameDayS(w, S, g) {
    let inc = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(S, -w[19]);
    if (g >= 2) inc = Math.max(inc, 1);
    return Math.max(S_MIN, S * inc);
  }

  /** a rough starting point for a card that comes from the older method: stability = its interval, difficulty from its ease */
  const fromClassic = (interval, ease) => ({ S: Math.max(0.1, interval || 1), D: clampD(10 - ((ease || 2.5) - 1.3) * 4) });

  return { DEFAULT_W, retrievability, interval, initS, initD, nextD, recallS, forgetS, sameDayS, fromClassic };
});

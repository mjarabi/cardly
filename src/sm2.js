/* Spaced-repetition scheduling. The classic method is similar to Anki (modified SM-2);
 * the optional new method lives in fsrs.js. Works in the app (browser) and in tests (node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fsrs'));
  else root.SM2 = factory(root.FSRS);
})(typeof self !== 'undefined' ? self : this, function (FSRS) {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;

  const DEFAULTS = {
    learningSteps: [1, 10], // minutes
    relearnSteps: [10],
    graduatingInterval: 1, // days
    easyInterval: 4,
    startEase: 2.5,
    minEase: 1.3,
    easyBonus: 1.3,
    hardInterval: 1.2,
    intervalModifier: 1,
    maxInterval: 36500,
    lapseNewInterval: 0,
    rolloverHour: 4,
    learnAheadMin: 20,
    scheduler: 'classic', // 'classic' (the older rule) or 'fsrs' (the newer, per-card method)
    desiredRetention: 0.9 // only used by 'fsrs'
  };

  // ---------- time ----------

  function studyDayStart(now, rolloverHour) {
    const d = new Date(now);
    d.setHours(rolloverHour, 0, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  function addDays(ts, days) {
    const d = new Date(ts);
    d.setDate(d.getDate() + days);
    return d.getTime();
  }

  function nextDayStart(now, rolloverHour) {
    return addDays(studyDayStart(now, rolloverHour), 1);
  }

  function dayKey(now, rolloverHour) {
    const d = new Date(studyDayStart(now, rolloverHour));
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // ---------- card ----------

  function scheduleFields(cfg) {
    return {
      state: 'new', // new | learn | review | relearn
      step: 0,
      due: 0,
      interval: 0,
      ease: (cfg || DEFAULTS).startEase,
      reps: 0,
      lapses: 0,
      last: 0
    };
  }

  function isDue(card, now, cfg) {
    const c = cfg || DEFAULTS;
    if (card.state === 'new') return true;
    if (card.state === 'review') return card.due < nextDayStart(now, c.rolloverHour);
    return card.due <= now;
  }

  function clampInterval(n, cfg) {
    return Math.min(cfg.maxInterval, Math.max(1, Math.round(n)));
  }

  function hardDelay(steps, i) {
    // delay for "Hard" during the learning steps
    if (i === 0) {
      if (steps.length > 1) return (steps[0] + steps[1]) / 2;
      return steps[0] * 1.5;
    }
    return steps[i];
  }

  function toReview(card, interval, now, cfg) {
    card.state = 'review';
    card.step = 0;
    card.interval = clampInterval(interval, cfg);
    card.due = addDays(studyDayStart(now, cfg.rolloverHour), card.interval);
  }

  /** Result of answering a card. rating: 1 Again, 2 Hard, 3 Good, 4 Easy. The original card is not modified. */
  function answer(card, rating, now, config) {
    const cfg = Object.assign({}, DEFAULTS, config);
    if (cfg.scheduler === 'fsrs') return answerFsrs(card, rating, now, cfg);
    const c = Object.assign({}, card);
    const prevState = card.state;

    if (c.state === 'new' || c.state === 'learn' || c.state === 'relearn') {
      const isRelearn = c.state === 'relearn';
      const steps = (isRelearn ? cfg.relearnSteps : cfg.learningSteps).filter((x) => x > 0);
      const i = c.state === 'new' ? 0 : Math.min(c.step, Math.max(0, steps.length - 1));
      if (c.state === 'new') c.state = 'learn';

      const graduate = (interval) => toReview(c, interval, now, cfg);

      if (!steps.length) {
        // no learning steps: go straight to review
        if (isRelearn) graduate(c.interval || 1);
        else graduate(rating === 4 ? cfg.easyInterval : cfg.graduatingInterval);
      } else if (rating === 1) {
        c.step = 0;
        c.due = now + steps[0] * MIN;
      } else if (rating === 2) {
        c.step = i;
        c.due = now + hardDelay(steps, i) * MIN;
      } else if (rating === 3) {
        if (i + 1 < steps.length) {
          c.step = i + 1;
          c.due = now + steps[i + 1] * MIN;
        } else {
          graduate(isRelearn ? c.interval || 1 : cfg.graduatingInterval);
        }
      } else {
        graduate(isRelearn ? Math.max((c.interval || 1) + 1, cfg.easyInterval) : cfg.easyInterval);
      }
    } else {
      // review
      const late = Math.max(0, Math.round((studyDayStart(now, cfg.rolloverHour) - c.due) / DAY));
      const base = c.interval || 1;
      const mod = cfg.intervalModifier;
      const hard = clampInterval(Math.max(base + 1, (base + late / 4) * cfg.hardInterval * mod), cfg);
      const good = clampInterval(Math.max(hard + 1, (base + late / 2) * c.ease * mod), cfg);
      const easy = clampInterval(Math.max(good + 1, (base + late) * c.ease * cfg.easyBonus * mod), cfg);

      if (rating === 1) {
        c.lapses += 1;
        c.ease = Math.max(cfg.minEase, c.ease - 0.2);
        c.interval = clampInterval(base * cfg.lapseNewInterval, cfg);
        const steps = cfg.relearnSteps.filter((x) => x > 0);
        if (steps.length) {
          c.state = 'relearn';
          c.step = 0;
          c.due = now + steps[0] * MIN;
        } else {
          toReview(c, c.interval, now, cfg);
        }
      } else if (rating === 2) {
        c.ease = Math.max(cfg.minEase, c.ease - 0.15);
        toReview(c, hard, now, cfg);
      } else if (rating === 3) {
        toReview(c, good, now, cfg);
      } else {
        c.ease = c.ease + 0.15;
        toReview(c, easy, now, cfg);
      }
    }

    c.reps += 1;
    c.last = now;
    return { card: c, prevState };
  }


  // ---------- the newer method (FSRS) ----------
  // Learning steps stay the same as before (minutes); what changes is how far apart the reviews are after a card graduates.

  /** the two hidden numbers of a card; cards that came from the older method get a starting guess */
  function memoryOf(c) {
    if (c.stab > 0 && c.diff > 0) return { S: c.stab, D: c.diff };
    return FSRS.fromClassic(c.interval, c.ease);
  }

  const fsrsDays = (S, cfg) => clampInterval(FSRS.interval(FSRS.DEFAULT_W, S, cfg.desiredRetention), cfg);

  function answerFsrs(card, rating, now, cfg) {
    const w = FSRS.DEFAULT_W;
    const prevState = card.state;
    if (prevState === 'new' || prevState === 'learn' || prevState === 'relearn') {
      // the steps are decided by the older code; then the hidden numbers and the first long interval are set
      const { card: c } = answer(card, rating, now, Object.assign({}, cfg, { scheduler: 'classic' }));
      let S;
      let D;
      if (prevState === 'new' || !(card.stab > 0)) {
        S = FSRS.initS(w, rating);
        D = FSRS.initD(w, rating);
      } else {
        S = FSRS.sameDayS(w, card.stab, rating);
        D = FSRS.nextD(w, card.diff, rating);
      }
      c.stab = S;
      c.diff = D;
      if (c.state === 'review') {
        c.interval = fsrsDays(S, cfg);
        c.due = addDays(studyDayStart(now, cfg.rolloverHour), c.interval);
      }
      return { card: c, prevState };
    }

    // a review card
    const c = Object.assign({}, card);
    const m = memoryOf(c);
    const late = Math.max(0, Math.round((studyDayStart(now, cfg.rolloverHour) - c.due) / DAY));
    const elapsed = Math.max(1, (c.interval || 1) + late); // days since the last review
    const R = FSRS.retrievability(w, elapsed, m.S);
    const D = FSRS.nextD(w, m.D, rating);
    c.diff = D;

    if (rating === 1) {
      const S = FSRS.forgetS(w, m.D, m.S, R);
      c.stab = S;
      c.lapses += 1;
      c.ease = Math.max(cfg.minEase, c.ease - 0.2);
      c.interval = fsrsDays(S, cfg);
      const steps = cfg.relearnSteps.filter((x) => x > 0);
      if (steps.length) {
        c.state = 'relearn';
        c.step = 0;
        c.due = now + steps[0] * MIN;
      } else {
        toReview(c, c.interval, now, cfg);
      }
    } else {
      // the three answers must give three different, growing intervals
      const days = [2, 3, 4].map((g) => fsrsDays(FSRS.recallS(w, m.D, m.S, R, g), cfg));
      const hard = days[0];
      const good = Math.max(days[1], hard + 1);
      const easy = Math.max(days[2], good + 1);
      const pick = rating === 2 ? hard : rating === 3 ? good : easy;
      c.stab = FSRS.recallS(w, m.D, m.S, R, rating);
      if (rating === 2) c.ease = Math.max(cfg.minEase, c.ease - 0.15);
      if (rating === 4) c.ease = c.ease + 0.15;
      toReview(c, pick, now, cfg);
    }
    c.reps += 1;
    c.last = now;
    return { card: c, prevState };
  }

  /** Preview of the next time for each of the four buttons */
  function preview(card, now, config) {
    const out = [];
    for (let r = 1; r <= 4; r++) {
      const { card: n } = answer(card, r, now, config);
      out.push({
        rating: r,
        due: n.due,
        ms: Math.max(0, n.due - now),
        days: n.state === 'review' ? n.interval : null
      });
    }
    return out;
  }

  /** Builds the study queue: today's cards, respecting the daily limits */
  function buildQueue(cards, now, opts) {
    const cfg = Object.assign({}, DEFAULTS, opts && opts.config);
    const newLeft = Math.max(0, ((opts && opts.newLimit) || 0) - ((opts && opts.newDone) || 0));
    const revLeft = Math.max(0, ((opts && opts.reviewLimit) || 0) - ((opts && opts.reviewDone) || 0));
    const learn = [];
    const review = [];
    const fresh = [];
    for (const c of cards) {
      if (c.suspended) continue; // put aside by the user (or brought over from Anki)
      if (c.state === 'new') fresh.push(c);
      else if (c.state === 'review') {
        if (c.due < nextDayStart(now, cfg.rolloverHour)) review.push(c);
      } else if (c.due <= now + cfg.learnAheadMin * MIN) learn.push(c);
    }
    learn.sort((a, b) => a.due - b.due);
    review.sort((a, b) => a.due - b.due);
    fresh.sort((a, b) => (a.created || 0) - (b.created || 0));
    return {
      learn,
      review: review.slice(0, revLeft),
      fresh: fresh.slice(0, newLeft),
      counts: {
        learn: learn.length,
        review: Math.min(review.length, revLeft),
        fresh: Math.min(fresh.length, newLeft)
      }
    };
  }

  return { DEFAULTS, MIN, DAY, studyDayStart, nextDayStart, addDays, dayKey, scheduleFields, isDue, answer, preview, buildQueue };
});

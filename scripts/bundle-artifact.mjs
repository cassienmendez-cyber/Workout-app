import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bundle `dist/` into one self-contained HTML page for hosting as an Artifact.
 *
 * The Artifact host supplies <!doctype>, <head> and <body>, so this emits page
 * content only. Everything is inlined because the host CSP blocks external
 * requests.
 *
 * The demo panel appended at the end exists only in this build — it is not part
 * of the app and never ships in `src/`.
 */

const DIST = 'dist';
const OUT = 'artifact/adaptive-strength.html';

const assets = readdirSync(join(DIST, 'assets'));
const jsName = assets.find((f) => f.endsWith('.js'));
const cssName = assets.find((f) => f.endsWith('.css'));
if (!jsName || !cssName) throw new Error('Build output not found — run `npm run build` first.');

const js = readFileSync(join(DIST, 'assets', jsName), 'utf8');
const css = readFileSync(join(DIST, 'assets', cssName), 'utf8');

// Inlining a script breaks if the payload contains a closing script tag.
if (/<\/script/i.test(js)) throw new Error('Bundle contains </script — cannot inline safely.');

const demoStyles = `
/* Demo-only affordance. Not part of the app. */
#demo-tab {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 70;
  writing-mode: vertical-rl;
  appearance: none;
  font-family: var(--font);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 12px 5px;
  border: 1px dashed var(--border-strong);
  border-left: none;
  border-radius: 0 8px 8px 0;
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}
#demo-panel {
  position: fixed;
  inset: 0;
  z-index: 71;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgb(0 0 0 / 0.45);
}
#demo-panel[data-open='true'] { display: flex; }
#demo-panel .card { max-width: 380px; width: 100%; }
#demo-panel h2 { margin: 0 0 4px; font-size: 19px; letter-spacing: -0.02em; }
`;

const demoScript = `
(function () {
  var KEY = 'adaptive-strength.state.v1';
  var iso = function (d) { return d.toISOString().slice(0, 10); };

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }

  function seed() {
    var st = read();
    if (!st || !st.user || !st.user.onboardingComplete) {
      alert('Finish the short setup first, then load the sample history.');
      return;
    }
    var templates = st.workouts.filter(function (w) { return w.status === 'scheduled'; });
    if (templates.length === 0) return;

    var past = [];
    for (var i = 12; i >= 1; i--) {
      var src = templates[i % templates.length];
      var d = new Date();
      d.setDate(d.getDate() - i * 2);
      var date = iso(d);
      var growth = 1 + (12 - i) * 0.035;
      var w = JSON.parse(JSON.stringify(src));
      w.id = 'demo_' + i;
      w.plannedDate = date;
      w.actualDate = date;
      w.status = 'completed';
      w.completedAt = date + 'T12:00:00.000Z';
      w.durationSeconds = 2280 + i * 20;
      w.exercises = w.exercises.map(function (we, xi) {
        var load = Math.round(95 * growth);
        return Object.assign({}, we, {
          id: 'demo_' + i + '_' + xi,
          feedback: { difficulty: i % 3 === 0 ? 'easy' : 'just_right' },
          sets: we.sets.map(function (s, si) {
            return Object.assign({}, s, {
              id: 'demo_' + i + '_' + xi + '_' + si,
              actualLoad: load,
              actualReps: we.targetRepRange.min + (i % 3),
              completed: true,
              timestamp: date + 'T12:00:00.000Z'
            });
          })
        });
      });
      past.push(w);
    }

    var metrics = [];
    for (var m = 12; m >= 0; m--) {
      var md = new Date();
      md.setDate(md.getDate() - m * 3);
      metrics.push({
        id: 'demo_m' + m,
        date: iso(md),
        bodyWeight: Math.round((182 - (12 - m) * 0.35) * 10) / 10,
        waist: Math.round((34.5 - (12 - m) * 0.07) * 10) / 10
      });
    }

    st.workouts = past.concat(st.workouts.filter(function (w) {
      return w.status !== 'completed' || String(w.id).indexOf('demo_') !== 0;
    }));
    st.metrics = metrics;
    st.achievements = [
      { id: 'demo_a1', type: 'first_workout', earnedDate: metrics[0].date },
      { id: 'demo_a2', type: 'workouts_10', earnedDate: metrics[8].date },
      { id: 'demo_a3', type: 'first_pr', earnedDate: metrics[4].date }
    ];
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
      location.reload();
    } catch (e) {
      alert('Storage is blocked in this frame, so sample history cannot be loaded here.');
    }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  }

  var tab = document.createElement('button');
  tab.id = 'demo-tab';
  tab.type = 'button';
  tab.textContent = 'Demo';

  var panel = document.createElement('div');
  panel.id = 'demo-panel';
  panel.innerHTML =
    '<div class="card">' +
    '<h2>Demo tools</h2>' +
    '<p class="muted" style="margin-top:0">Not part of the app — these only exist in this hosted preview so you can see the adaptive behaviour without training for a fortnight.</p>' +
    '<div class="stack" style="margin-top:16px">' +
    '<button type="button" class="btn btn--primary btn--block" data-act="seed">Load 12 sessions of history</button>' +
    '<button type="button" class="btn btn--block" data-act="reset">Start over from setup</button>' +
    '<button type="button" class="btn btn--ghost btn--block" data-act="close">Close</button>' +
    '</div></div>';

  tab.addEventListener('click', function () { panel.setAttribute('data-open', 'true'); });
  panel.addEventListener('click', function (e) {
    var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
    if (e.target === panel || act === 'close') panel.removeAttribute('data-open');
    if (act === 'seed') seed();
    if (act === 'reset') reset();
  });

  document.body.appendChild(tab);
  document.body.appendChild(panel);
})();
`;

const page = `<title>Adaptive Strength</title>
<style>
${css}
${demoStyles}
</style>

<div id="root"></div>

<script type="module">
${js}
</script>

<script>
${demoScript}
</script>
`;

mkdirSync('artifact', { recursive: true });
writeFileSync(OUT, page);
console.log(`Wrote ${OUT} — ${(page.length / 1024).toFixed(0)} KB`);

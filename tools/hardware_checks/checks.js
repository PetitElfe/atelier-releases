'use strict';
const token = document.querySelector('[name=test-token]').content;
const canvas = document.querySelector('canvas'), strokes = [];
const ink = AtelierStudio.ink(canvas, strokes, {width: 900, height: 450});
let samples = 0, minimum = 1, maximum = 0, priorStrokes = 0, hydrated = false;
for (const kind of ['pointerdown', 'pointermove']) canvas.addEventListener(kind, e => {
  if (e.pointerType !== 'pen' || !e.isTrusted || e.buttons === 0) return;
  const batch = e.getCoalescedEvents?.();
  for (const p of batch?.length ? batch : [e]) {
    if (p.pressure > 0 && samples < 100000) {
      samples++;
      minimum = Math.min(minimum, p.pressure);
      maximum = Math.max(maximum, p.pressure);
    }
  }
  document.getElementById('pen').textContent = samples + ' mesures de pression reçues · ' +
    (samples ? minimum : 0).toFixed(3) + ' à ' + maximum.toFixed(3) +
    '. Le parcours dans l’album reste à vérifier.';
});
document.getElementById('clear').onclick = () => {
  strokes.length = 0; priorStrokes = 0; samples = 0; minimum = 1; maximum = 0; ink.paint();
  document.getElementById('pen').textContent = 'Aucun événement de stylet reçu.';
};
const audio = document.getElementById('audio');
let clipURL = null, decoded = false;
document.getElementById('clip').onchange = e => {
  audio.pause(); decoded = false;
  if (clipURL) URL.revokeObjectURL(clipURL);
  audio.removeAttribute('src'); audio.load();
  const f = e.target.files[0];
  if (f) {
    clipURL = URL.createObjectURL(f); audio.src = clipURL;
    document.getElementById('audioState').textContent = 'Fichier local sélectionné : lance l’écoute.';
  } else document.getElementById('audioState').textContent = 'Aucun son testé.';
};
audio.ontimeupdate = () => {
  decoded = decoded || audio.currentTime > .1;
  document.getElementById('audioState').textContent = decoded ?
    'Lecture décodée. L’écoute physique et le parcours dans Goblin restent à confirmer.' : 'Lecture à vérifier.';
};
audio.onerror = () => {
  decoded = false;
  document.getElementById('audioState').textContent = 'Lecture impossible : le son n’est pas validé.';
};
const status = document.getElementById('status');
async function request(path, body) {
  const options = {headers: {'X-Test-Token': token}};
  if (body !== undefined) Object.assign(options, {method: 'POST',
    headers: {...options.headers, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const r = await fetch(path, options);
  if (!r.ok) throw Error('Opération refusée : vérifie la page locale et l’adresse HTTPS .ts.net.');
  return r.json();
}
document.getElementById('refresh').onclick = async () => {
  status.textContent = 'Lecture des observations…';
  try {
    const report = await request('/observations');
    document.getElementById('report').textContent = JSON.stringify(report, null, 2);
    if (!hydrated) {
      const saved = report.participant;
      if (saved && Object.keys(saved).length) {
        samples = saved.pen_samples || 0; minimum = samples ? saved.pen_min : 1;
        maximum = saved.pen_max || 0; priorStrokes = saved.strokes || 0;
        document.getElementById('xp_pen_used').checked = saved.xp_pen_used === true;
        for (const input of document.querySelectorAll('[data-check]'))
          input.value = saved.checks?.[input.dataset.check] || 'not_tested';
        document.getElementById('pen').textContent = samples + ' mesures précédemment enregistrées (dessin non conservé dans le rapport).';
        decoded = saved.audio_decoded === true;
        if (decoded) document.getElementById('audioState').textContent = 'Décodage observé avant rechargement ; fichier sonore non conservé.';
      }
      hydrated = true;
    }
    status.textContent = 'Observations recueillies ; validation réelle encore à examiner.';
  } catch (e) { status.textContent = e.message; }
};
document.getElementById('configureTailnet').onclick = async () => {
  try {
    await request('/tailnet', {url: document.getElementById('tailnet').value.trim()});
    document.getElementById('tailnet').value = '';
    document.getElementById('refresh').click();
  } catch (e) { status.textContent = e.message; }
};
document.getElementById('save').onclick = async () => {
  const checks = {};
  for (const input of document.querySelectorAll('[data-check]')) checks[input.dataset.check] = input.value;
  const data = {pen_samples: samples, pen_min: samples ? minimum : 0, pen_max: maximum,
    strokes: priorStrokes + strokes.length, audio_decoded: decoded,
    xp_pen_used: document.getElementById('xp_pen_used').checked, checks};
  try {
    await request('/observations', data);
    status.textContent = 'Observations enregistrées. Le résultat reste à examiner avant toute mise à jour du master.';
  } catch (e) { status.textContent = e.message; }
};
document.getElementById('refresh').click();

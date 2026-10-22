// /api/extraire — Cloudflare Pages Function.
// GET  : indique que le serveur est présent (la page d'import active alors la récupération automatique).
// POST { url } : renvoie la recette trouvée derrière le lien (voir lib/extraction.js).
import { checkUrl, extractRecipe } from '../../lib/extraction.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export function onRequestGet() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Requête invalide.' }, 400); }
  const url = checkUrl(body && body.url);
  if (!url) return json({ error: 'Ce lien n\'est pas une adresse web publique valide.' }, 400);
  try {
    return json(await extractRecipe(url));
  } catch (e) {
    return json({ error: e.message || 'Impossible de lire ce lien.' }, 502);
  }
}

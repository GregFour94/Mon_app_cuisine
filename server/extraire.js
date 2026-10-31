// /api/extraire — appelée par le Worker (server/worker.js).
// GET  : indique que le serveur est présent (la page d'import active alors la récupération automatique).
// POST { url } : renvoie la recette trouvée derrière le lien (voir extraction.js).
//   Quand la page ne donne que du texte (description d'une publication), l'IA le range
//   en ingrédients, étapes et notes si la clé est configurée ; sinon le navigateur le découpe.
import { checkUrl, extractRecipe } from './extraction.js';
import { lectureDisponible, lireTexte } from './lecture-photo.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export function onRequestGet() {
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Requête invalide.' }, 400); }
  const url = checkUrl(body && body.url);
  if (!url) return json({ error: 'Ce lien n\'est pas une adresse web publique valide.' }, 400);
  let result;
  try {
    result = await extractRecipe(url);
  } catch (e) {
    return json({ error: e.message || 'Impossible de lire ce lien.' }, 502);
  }
  if (result.found === 'texte' && lectureDisponible(env)) {
    try {
      const recipe = await lireTexte(env, result.text, { site: result.siteName, auteur: result.author, titre: result.title });
      // Le texte d'origine reste disponible pour le navigateur si l'IA n'a rien trouvé d'utile.
      result = { ...result, ...recipe, title: recipe.title || result.title, found: 'recette', ai: true };
    } catch (e) {
      result.aiError = e.message;
    }
  }
  return json(result);
}

// /api/lire-photo — appelée par le Worker (server/worker.js).
// GET  : indique si la lecture par l'IA est disponible (clé ANTHROPIC_API_KEY configurée).
// POST { data, type } : envoie la photo (JPEG, PNG, WebP…) ou le PDF à Claude, qui en tire
//   une recette complète : nom, catégorie, saisons, repas, portions, temps, ingrédients, étapes.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 10 * 1024 * 1024;

const CATEGORIES = ['Entrée', 'Plat', 'Dessert', 'Boisson', 'Sauce', 'Accompagnement', 'Petit-déjeuner', 'Autre'];
const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];

// Forme exacte de la réponse attendue (sortie structurée).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lisible', 'message', 'titre', 'categorie', 'saisons', 'toute_annee', 'repas',
    'portions', 'preparation_min', 'cuisson_min', 'ingredients', 'etapes', 'notes'],
  properties: {
    lisible: { type: 'boolean', description: 'false si le document ne contient pas de recette lisible' },
    message: { type: 'string', description: 'Si lisible est false : pourquoi, en une phrase. Sinon chaîne vide.' },
    titre: { type: 'string' },
    categorie: { type: 'string', enum: CATEGORIES },
    saisons: { type: 'array', items: { type: 'string', enum: SEASONS } },
    toute_annee: { type: 'boolean' },
    repas: { type: 'array', items: { type: 'string', enum: ['midi', 'soir'] } },
    portions: { type: 'integer', description: '0 si inconnu' },
    preparation_min: { type: 'integer', description: '0 si inconnu' },
    cuisson_min: { type: 'integer', description: '0 si inconnu' },
    ingredients: { type: 'array', items: { type: 'string' } },
    etapes: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' }
  }
};

const SYSTEM = `Tu lis des recettes de cuisine à partir de photos (livre, fiche, écran, carnet manuscrit) ou de documents, pour l'application « Mon App Cuisine ».

Recopie fidèlement ce qui est écrit, en français :
- titre : le nom de la recette.
- ingredients : un ingrédient par élément, avec sa quantité et son unité telles qu'écrites (ex. « 200 g de farine », « 3 œufs », « 1 c. à soupe d'huile d'olive »).
- etapes : une étape par élément, dans l'ordre, sans numéro au début.
- portions, preparation_min, cuisson_min : les valeurs indiquées (temps convertis en minutes), 0 si rien n'est indiqué.
- notes : les conseils, variantes ou remarques présents sur le document ; chaîne vide sinon.

Déduis aussi, car le document ne le dit généralement pas :
- categorie : la catégorie qui convient le mieux.
- saisons : les saisons où les ingrédients principaux sont de saison en France (ex. potiron → Automne et Hiver ; tomates fraîches, courgettes → Été). Si la recette convient toute l'année (ingrédients de garde ou disponibles toute l'année), mets toute_annee à true et saisons à [].
- repas : « midi », « soir » ou les deux. Plat complet ou rapide à emporter → plutôt midi ; plat mijoté, soupe ou repas convivial → plutôt soir ; mets les deux quand la recette convient aux deux. Pour un dessert, une boisson ou un petit-déjeuner, mets les deux.

N'invente ni ingrédient ni étape. Si une partie est illisible, recopie ce qui est lisible et signale-le dans notes. Si le document ne contient pas de recette, mets lisible à false et explique pourquoi dans message.`;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export function onRequestGet({ env }) {
  return json({ ok: Boolean(env && env.ANTHROPIC_API_KEY) });
}

// Remet la réponse de Claude dans le format des recettes de l'application.
export function toRecipe(r) {
  const n = v => (Number.isInteger(v) && v > 0 ? String(v) : '');
  return {
    title: String(r.titre || '').trim(),
    category: CATEGORIES.includes(r.categorie) ? r.categorie : 'Autre',
    seasons: r.toute_annee ? [] : SEASONS.filter(s => (r.saisons || []).includes(s)),
    allYear: Boolean(r.toute_annee) || !(r.saisons || []).length,
    meals: ['midi', 'soir'].filter(m => (r.repas || []).includes(m)),
    servings: n(r.portions),
    prep: n(r.preparation_min),
    cook: n(r.cuisson_min),
    ingredients: (r.ingredients || []).map(i => String(i).trim()).filter(Boolean),
    steps: (r.etapes || []).map(s => String(s).trim()).filter(Boolean),
    notes: String(r.notes || '').trim()
  };
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.ANTHROPIC_API_KEY) {
    return json({ error: 'La lecture par l\'IA n\'est pas configurée : ajoute la clé ANTHROPIC_API_KEY dans Cloudflare.' }, 503);
  }
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Requête invalide.' }, 400); }
  const type = String(body && body.type || '');
  const data = String(body && body.data || '').replace(/^data:[^,]*,/, '');
  const isPdf = type === 'application/pdf';
  if (!isPdf && !IMAGE_TYPES.includes(type)) return json({ error: 'Format non pris en charge : envoie une photo (JPEG, PNG, WebP) ou un PDF.' }, 415);
  if (!data || data.length * 0.75 > MAX_BYTES) return json({ error: 'Fichier vide ou trop lourd (10 Mo au maximum).' }, 413);

  const source = { type: 'base64', media_type: type, data };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          isPdf ? { type: 'document', source } : { type: 'image', source },
          { type: 'text', text: 'Lis cette recette et remplis tous les champs.' }
        ]
      }]
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'La clé ANTHROPIC_API_KEY est refusée : vérifie-la dans Cloudflare.' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Trop de lectures en même temps : réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ error: 'L\'IA n\'a pas pu ouvrir ce fichier : ' + e.message }, 400);
    if (e instanceof Anthropic.APIConnectionError) return json({ error: 'Impossible de joindre le service d\'IA : réessaie.' }, 502);
    if (e instanceof Anthropic.APIError) return json({ error: 'Le service d\'IA a répondu avec une erreur (' + e.status + ').' }, 502);
    throw e;
  }

  if (response.stop_reason === 'refusal') return json({ error: 'L\'IA a refusé de lire ce document.' }, 422);
  if (response.stop_reason === 'max_tokens') return json({ error: 'La recette est trop longue pour être lue en une fois.' }, 422);
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return json({ error: 'La réponse de l\'IA est incomplète : réessaie.' }, 502); }
  if (!parsed.lisible) return json({ error: parsed.message || 'Aucune recette trouvée sur ce document.' }, 422);
  return json({ recipe: toRecipe(parsed) });
}

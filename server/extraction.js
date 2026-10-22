// Lecture d'une recette à partir d'un lien, côté serveur (Cloudflare Workers).
// 1. Sites de cuisine : la plupart décrivent leur recette au format schema.org « Recipe »
//    (balise <script type="application/ld+json">), qu'on lit directement.
// 2. TikTok et YouTube : leur service oEmbed public donne le titre (souvent la légende),
//    l'auteur et la vignette.
// 3. Sinon : les balises Open Graph (og:title, og:description, og:image) de la page,
//    qui contiennent la légende des publications Instagram ou Facebook quand elles sont publiques.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Instagram et Facebook ne renvoient leurs balises Open Graph qu'aux robots d'aperçu de liens.
const PREVIEW_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const MAX_HTML = 3 * 1024 * 1024;
const TIMEOUT = 10000;

// Refuse ce qui n'est pas une adresse web publique (adresses IP, réseau local…).
export function checkUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch (e) { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || /\.(local|localhost|internal|lan|home)$/.test(host)) return null;
  if (/^[\d.]+$/.test(host) || host.startsWith('[')) return null;
  return url;
}

export function platformOf(url) {
  const host = url.hostname.replace(/^www\./, '');
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('tiktok.com') || host.endsWith('tiktokv.com')) return 'tiktok';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('facebook.com') || host === 'fb.watch') return 'facebook';
  if (host.includes('pinterest.') || host === 'pin.it') return 'pinterest';
  return 'site';
}

const SITE_NAMES = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', pinterest: 'Pinterest' };

export function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', ugrave: 'ù', oelig: 'œ', rsquo: '’', lsquo: '‘', hellip: '…', laquo: '«', raquo: '»', deg: '°' };
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

const stripTags = html => decodeEntities(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

// Durée ISO 8601 (« PT1H30M », « P0DT0H20M ») en minutes.
export function isoMinutes(value) {
  const m = String(value || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i);
  if (!m) return '';
  const total = (Number(m[1]) || 0) * 1440 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  return total ? String(total) : '';
}

const first = v => Array.isArray(v) ? v[0] : v;
const asText = v => typeof v === 'string' ? v : v && typeof v === 'object' ? (v.name || v.text || v['@id'] || '') : '';

function imageOf(value) {
  const v = first(value);
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.url || v.contentUrl || v['@id'] || '';
}

function authorOf(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map(asText).filter(Boolean).join(', ');
}

function yieldOf(value) {
  const list = Array.isArray(value) ? value : [value];
  for (const v of list) {
    const m = String(v ?? '').match(/\d+/);
    if (m) return m[0];
  }
  return '';
}

// Étapes : texte, liste de textes, HowToStep ou HowToSection (qui regroupe des étapes).
function stepsOf(value) {
  if (!value) return [];
  if (typeof value === 'string') return stripTags(value).split(/\n+|(?<=\.)\s+(?=\d+[.)]\s)/).map(s => s.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(stepsOf);
  if (typeof value === 'object') {
    if (value.itemListElement) return stepsOf(value.itemListElement);
    return stepsOf(value.text || value.name || '');
  }
  return [];
}

function isRecipe(node) {
  const t = node && node['@type'];
  return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe';
}

function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n); if (r) return r; }
    return null;
  }
  if (isRecipe(node)) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const r = findRecipe(node[key]);
    if (r) return r;
  }
  return null;
}

// Lit la recette schema.org d'une page HTML, ou null s'il n'y en a pas.
export function recipeFromJsonLd(html) {
  const blocks = String(html).match(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    let data;
    try { data = JSON.parse(json); } catch (e) {
      try { data = JSON.parse(json.replace(/[\u0000-\u001f]+/g, ' ')); } catch (e2) { continue; }
    }
    const r = findRecipe(data);
    if (!r) continue;
    return {
      title: stripTags(asText(r.name)),
      ingredients: (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : r.recipeIngredient ? [r.recipeIngredient] : r.ingredients || [])
        .map(i => stripTags(String(i))).filter(Boolean),
      steps: stepsOf(r.recipeInstructions),
      servings: yieldOf(r.recipeYield),
      prep: isoMinutes(r.prepTime),
      cook: isoMinutes(r.cookTime),
      image: imageOf(r.image),
      author: authorOf(r.author),
      category: stripTags(asText(first(r.recipeCategory))),
      description: stripTags(asText(r.description))
    };
  }
  return null;
}

// Balises <meta> utiles (Open Graph, Twitter, description).
export function metaOf(html) {
  const meta = {};
  (String(html).match(/<meta\s[^>]*>/gi) || []).forEach(tag => {
    const key = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i) || [])[1];
    if (key && content !== undefined && !(key.toLowerCase() in meta)) meta[key.toLowerCase()] = decodeEntities(content);
  });
  const title = (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  if (title) meta.title = decodeEntities(title).trim();
  return meta;
}

// « 1 234 likes, 56 comments - chef.maison on March 3, 2024: "Ma recette…" » → auteur + légende.
export function instagramCaption(description) {
  const text = String(description || '').trim();
  const m = text.match(/-\s*([\w.]+)\s+(?:on|le)\s+[^:]+?\s*:\s*["“«]\s*([\s\S]*?)\s*["”»]\s*\.?$/);
  if (m) return { author: '@' + m[1], caption: m[2].trim() };
  return { author: '', caption: text };
}

async function fetchWithLimit(url, options = {}, limit = MAX_HTML) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT), ...options });
  if (!res.ok) throw new Error('Le site a répondu avec une erreur (' + res.status + ').');
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); break; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  chunks.forEach(c => { bytes.set(c, offset); offset += c.length; });
  return { res, text: new TextDecoder('utf-8').decode(bytes) };
}

async function oembed(platform, url) {
  const endpoint = platform === 'tiktok' ? 'https://www.tiktok.com/oembed?url='
    : platform === 'youtube' ? 'https://www.youtube.com/oembed?format=json&url=' : '';
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint + encodeURIComponent(url), { signal: AbortSignal.timeout(TIMEOUT), headers: { 'User-Agent': BROWSER_UA } });
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}

// Résultat : { found: 'recette' | 'texte' | 'rien', title, ingredients, steps, servings, prep, cook,
//   text, image, author, siteName, platform }
export async function extractRecipe(url) {
  const platform = platformOf(url);
  const result = { found: 'rien', title: '', ingredients: [], steps: [], servings: '', prep: '', cook: '', text: '', image: '', author: '', siteName: SITE_NAMES[platform] || url.hostname.replace(/^www\./, ''), platform };

  const embed = await oembed(platform, url.href);
  if (embed) {
    result.text = String(embed.title || '').trim();
    result.author = embed.author_unique_id ? '@' + embed.author_unique_id : embed.author_name || '';
    result.image = embed.thumbnail_url || '';
  }

  let html = '';
  try {
    const ua = platform === 'instagram' || platform === 'facebook' ? PREVIEW_UA : BROWSER_UA;
    ({ text: html } = await fetchWithLimit(url.href, { headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.6' } }));
  } catch (e) {
    if (!embed) {
      throw new Error(e.name === 'TimeoutError' ? 'Le site met trop de temps à répondre.'
        : e.message && e.message.startsWith('Le site') ? e.message : 'Impossible d\'ouvrir ce lien : le site est injoignable ou refuse la connexion.');
    }
  }

  const meta = html ? metaOf(html) : {};
  if (meta['og:site_name'] && platform === 'site') result.siteName = meta['og:site_name'];
  const recipe = html && recipeFromJsonLd(html);
  if (recipe && (recipe.ingredients.length || recipe.steps.length)) {
    return { ...result, ...recipe, found: 'recette', text: '', image: recipe.image || result.image || meta['og:image'] || '', author: recipe.author || result.author };
  }

  result.image = result.image || meta['og:image'] || meta['twitter:image'] || '';
  let text = result.text || meta['og:description'] || meta['twitter:description'] || meta.description || '';
  if (platform === 'instagram') {
    const ig = instagramCaption(text);
    text = ig.caption;
    result.author = result.author || ig.author;
  }
  result.title = recipe && recipe.title ? recipe.title : platform === 'site' ? (meta['og:title'] || meta.title || '') : '';
  result.text = text.trim();
  result.found = result.text ? 'texte' : 'rien';
  return result;
}

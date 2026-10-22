// Données et utilitaires communs aux pages cuisine.
// Tout est stocké dans le navigateur (localStorage), partagé entre les pages du site.
const Cuisine = (() => {
  const KEYS = {
    recipes: 'mon-app-cuisine-recettes',
    history: 'mon-app-cuisine-historique',
    draft: 'mon-app-cuisine-menu-brouillon',
    pending: 'mon-app-cuisine-a-valider',
    importMode: 'mon-app-cuisine-mode-import'
  };
  const CATEGORIES = ['Entrée', 'Plat', 'Dessert', 'Boisson', 'Sauce', 'Accompagnement', 'Petit-déjeuner', 'Autre'];
  const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
  const MEALS = { midi: 'Midi', soir: 'Soir' };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      alert("Impossible d'enregistrer dans ce navigateur. Pense à exporter tes données.");
      return false;
    }
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function lines(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  }

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  }

  // Remet une recette (saisie, ancienne version ou import) dans un format propre.
  function cleanRecipe(r) {
    return {
      id: r.id ? String(r.id) : newId(),
      title: String(r.title || '').trim(),
      category: CATEGORIES.includes(r.category) ? r.category : 'Autre',
      seasons: Array.isArray(r.seasons) ? r.seasons.filter(s => SEASONS.includes(s)) : [],
      meals: Array.isArray(r.meals) ? Object.keys(MEALS).filter(m => r.meals.includes(m)) : [],
      servings: r.servings ? String(r.servings) : '',
      prep: r.prep ? String(r.prep) : '',
      cook: r.cook ? String(r.cook) : '',
      ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(String) : lines(r.ingredients),
      steps: Array.isArray(r.steps) ? r.steps.map(String) : lines(r.steps),
      source: r.source ? String(r.source) : '',
      notes: r.notes ? String(r.notes) : '',
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || undefined
    };
  }

  function getRecipes() {
    const data = read(KEYS.recipes, []);
    return Array.isArray(data) ? data.filter(r => r && r.title).map(cleanRecipe) : [];
  }
  const saveRecipes = recipes => write(KEYS.recipes, recipes);

  function getHistory() {
    const data = read(KEYS.history, []);
    return Array.isArray(data) ? data.filter(m => m && Array.isArray(m.items)) : [];
  }
  const saveHistory = history => write(KEYS.history, history);

  const getDraft = () => read(KEYS.draft, null);
  const saveDraft = draft => draft ? write(KEYS.draft, draft) : localStorage.removeItem(KEYS.draft);

  // Saison météorologique : printemps = mars-mai, été = juin-août, etc.
  function seasonOf(date) {
    const m = date.getMonth();
    if (m >= 2 && m <= 4) return 'Printemps';
    if (m >= 5 && m <= 7) return 'Été';
    if (m >= 8 && m <= 10) return 'Automne';
    return 'Hiver';
  }

  function fitsSeason(recipe, season) {
    return !recipe.seasons.length || recipe.seasons.includes(season);
  }

  function seasonsLabel(recipe) {
    return recipe.seasons.length && recipe.seasons.length < SEASONS.length ? recipe.seasons.join(', ') : 'Toute l\'année';
  }

  // Repas : aucune case cochée = la recette convient au midi comme au soir.
  function fitsMeal(recipe, meal) {
    return !recipe.meals || !recipe.meals.length || recipe.meals.includes(meal);
  }

  function mealsLabel(recipe) {
    return recipe.meals && recipe.meals.length === 1 ? MEALS[recipe.meals[0]] : 'Midi et soir';
  }

  function totalTime(recipe) {
    return (Number(recipe.prep) || 0) + (Number(recipe.cook) || 0);
  }

  // Lundi de la semaine à venir (toujours strictement après la date donnée).
  function nextMonday(from = new Date()) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const diff = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseIsoDate(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function formatDate(d, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
    return d.toLocaleDateString('fr-FR', opts);
  }

  function plural(n, word) {
    return n + ' ' + word + (n > 1 ? 's' : '');
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  // Contenu de la fiche détaillée d'une recette (pour les fenêtres de consultation).
  function recipeDetail(r) {
    const parts = [
      el('h2', { textContent: r.title }),
      el('div', { className: 'meta', textContent: [r.category, seasonsLabel(r), mealsLabel(r), r.servings ? r.servings + ' personnes' : '',
        r.prep ? 'préparation ' + r.prep + ' min' : '', r.cook ? 'cuisson ' + r.cook + ' min' : ''].filter(Boolean).join(' · ') })
    ];
    if (r.ingredients.length) {
      parts.push(el('h3', { textContent: 'Ingrédients' }), el('ul', {}, r.ingredients.map(i => el('li', { textContent: i }))));
    }
    if (r.steps.length) {
      parts.push(el('h3', { textContent: 'Étapes' }), el('ol', {}, r.steps.map(s => el('li', { textContent: s }))));
    }
    if (r.source) {
      parts.push(el('h3', { textContent: 'Source' }), /^https?:\/\//i.test(r.source)
        ? el('a', { href: r.source, target: '_blank', rel: 'noopener', textContent: r.source })
        : el('p', { textContent: r.source }));
    }
    if (r.notes) {
      parts.push(el('h3', { textContent: 'Notes' }), el('p', { className: 'notes', textContent: r.notes }));
    }
    return parts;
  }

  // ---- Recettes importées en attente de validation ----
  // Chaque élément : { id, origin: 'fichier' | 'lien' | 'compte', platform, fileName, preview,
  //   collection, importedAt, allYear, recipe } ; recipe suit le format de cleanRecipe.
  function getPending() {
    const data = read(KEYS.pending, []);
    return Array.isArray(data) ? data.filter(p => p && p.recipe) : [];
  }
  const savePending = items => write(KEYS.pending, items);

  function addPending(items) {
    const pending = getPending();
    const now = new Date().toISOString();
    items.forEach(it => pending.push({
      id: newId(), origin: it.origin, platform: it.platform || '', fileName: it.fileName || '',
      preview: it.preview || '', collection: it.collection || '', note: it.note || '',
      importedAt: now, allYear: false,
      recipe: { ...cleanRecipe({ category: 'Plat', ...it.recipe }), seasons: [], meals: [] }
    }));
    return savePending(pending);
  }

  // Une recette importée est prête quand le nom, la saison et le repas ont été choisis.
  function pendingMissing(p) {
    const missing = [];
    if (!p.recipe.title.trim()) missing.push('nom');
    if (!p.allYear && !p.recipe.seasons.length) missing.push('saison');
    if (!p.recipe.meals.length) missing.push('repas');
    return missing;
  }

  const getImportMode = () => read(KEYS.importMode, '');
  const saveImportMode = mode => write(KEYS.importMode, mode);

  const PLATFORMS = {
    instagram: { label: 'Instagram', hosts: ['instagram.com'], post: /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/[\w-]+/i },
    tiktok: { label: 'TikTok', hosts: ['tiktok.com', 'tiktokv.com'], post: /tiktok(?:v)?\.com\/.*(?:video|share)\/\w+|vm\.tiktok\.com\/\w+/i },
    pinterest: { label: 'Pinterest', hosts: ['pinterest.', 'pin.it'], post: /pinterest\.[a-z.]+\/pin\/[\w-]+|pin\.it\/\w+/i },
    facebook: { label: 'Facebook', hosts: ['facebook.com', 'fb.watch'], post: /facebook\.com\/.+|fb\.watch\/\w+/i },
    youtube: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'], post: /youtube\.com\/(?:watch|shorts)|youtu\.be\/\w+/i }
  };

  function platformOf(url) {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
    const key = Object.keys(PLATFORMS).find(k => PLATFORMS[k].hosts.some(h => host.includes(h)));
    return key || 'site';
  }

  function platformLabel(key, url) {
    if (PLATFORMS[key]) return PLATFORMS[key].label;
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'Site web'; }
  }

  // Devine un nom de recette à partir de l'adresse d'un site (ex. .../recette_tarte-tatin_12345.aspx).
  function titleFromUrl(url) {
    let path = '';
    try { path = decodeURIComponent(new URL(url).pathname); } catch (e) { return ''; }
    const parts = path.split('/').filter(Boolean)
      .map(p => p.replace(/\.(html?|aspx|php)$/i, '').replace(/^recettes?[_-]/i, '').replace(/^\d+[_-]/, '').replace(/[_-]\d+$/, ''))
      .filter(p => /[a-z]/i.test(p) && !/^\d+$/.test(p) && !/^(recettes?|recipes?|fr|en|www)$/i.test(p));
    const slug = parts.sort((a, b) => b.length - a.length)[0] || '';
    const words = slug.replace(/[-_+]+/g, ' ').trim();
    return words.length > 3 ? words.charAt(0).toUpperCase() + words.slice(1) : '';
  }

  // Durée en minutes à partir d'un texte comme « 1 h 30 », « 45 min » ou « 1h ».
  function minutesIn(text) {
    const m = String(text).match(/(\d+)\s*h(?:eures?)?\s*(\d+)?|(\d+)\s*min/i);
    if (!m) return '';
    return m[3] ? m[3] : String(Number(m[1]) * 60 + (Number(m[2]) || 0));
  }

  // Lit une recette écrite en texte libre : titre, portions, temps, ingrédients et étapes.
  function parseRecipeText(text) {
    const all = String(text || '').split(/\r?\n/).map(l => l.trim());
    const rows = all.filter(Boolean);
    const recipe = { title: (rows[0] || '').replace(/^#+\s*/, '').slice(0, 120), ingredients: [], steps: [], notes: '' };
    let section = '';
    const clean = l => l.replace(/^([-•*·–]|\d+[.)]|étape\s*\d+\s*[:.-]?)\s*/i, '').trim();
    rows.slice(1).forEach(line => {
      const bare = line.replace(/^#+\s*/, '').replace(/[:：]\s*$/, '');
      if (/^ingr[ée]dients?\b/i.test(bare) && bare.length < 40) { section = 'ingredients'; return; }
      if (/^(pr[ée]paration|[ée]tapes?|instructions?|m[ée]thode|d[ée]roul[ée]|recette)\b/i.test(bare) && bare.length < 40 && !/\d/.test(bare)) { section = 'steps'; return; }
      const serv = line.match(/(?:pour|portions?\s*:?)\s*(\d+)\s*(?:pers|personnes|parts|portions)?/i);
      if (serv && !recipe.servings && line.length < 60) { recipe.servings = serv[1]; if (!section) return; }
      if (/^pr[ée]paration\s*:?\s*\d/i.test(line)) { recipe.prep = minutesIn(line); return; }
      if (/^cuisson\s*:?\s*\d/i.test(line)) { recipe.cook = minutesIn(line); return; }
      if (section === 'ingredients') recipe.ingredients.push(clean(line));
      else if (section === 'steps') recipe.steps.push(clean(line));
      else recipe.notes += (recipe.notes ? '\n' : '') + line;
    });
    recipe.ingredients = recipe.ingredients.filter(Boolean);
    recipe.steps = recipe.steps.filter(Boolean);
    return recipe;
  }

  // Lit l'export de données d'un réseau social (JSON ou HTML) et en sort les liens de publications,
  // regroupés par collection quand le fichier les indique (cas d'Instagram).
  function parseSocialExport(text, platform) {
    const conf = PLATFORMS[platform];
    const found = [];
    const seen = new Set();
    const add = (url, collection) => {
      const u = url.replace(/[?#].*$/, '');
      if (conf && !conf.post.test(u)) return;
      if (!conf && !/^https?:\/\//.test(u)) return;
      if (seen.has(u)) return;
      seen.add(u);
      found.push({ url: u, collection: collection || '' });
    };
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (data) {
      let current = '';
      const walk = node => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== 'object') {
          if (typeof node === 'string' && /^https?:\/\//.test(node)) add(node, current);
          return;
        }
        const name = node.string_map_data && node.string_map_data.Name;
        if (name && name.value && !name.href) current = name.value;
        Object.values(node).forEach(walk);
      };
      walk(data);
    } else {
      (String(text).match(/https?:\/\/[^\s"'<>]+/g) || []).forEach(u => add(u, ''));
    }
    return found;
  }

  // Réduit une photo pour qu'elle tienne dans le stockage du navigateur.
  function shrinkImage(file, max = 900) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }

  return {
    CATEGORIES, SEASONS, MEALS, PLATFORMS, newId, lines, normalize, cleanRecipe,
    getRecipes, saveRecipes, getHistory, saveHistory, getDraft, saveDraft,
    getPending, savePending, addPending, pendingMissing, getImportMode, saveImportMode,
    platformOf, platformLabel, titleFromUrl, parseRecipeText, parseSocialExport, shrinkImage,
    seasonOf, fitsSeason, fitsMeal, seasonsLabel, mealsLabel, totalTime, nextMonday, isoDate, parseIsoDate, formatDate,
    plural, el, recipeDetail
  };
})();

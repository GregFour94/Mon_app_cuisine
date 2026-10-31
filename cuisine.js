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

  // ---- Ingrédients découpés : { text, quantity, unit, name } ----
  // text garde la ligne telle qu'elle a été écrite ; quantity est un nombre (ou null),
  // unit une unité normalisée (ou '') et name le reste (« farine », « huile d'olive »).
  const NUMBER_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, demi: 0.5, 'demie': 0.5 };
  const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  // [unité affichée, expression qui la reconnaît]
  const UNITS = [
    ['kg', /^(kg|kilos?|kilogrammes?)\b/i],
    ['mg', /^mg\b/i],
    ['g', /^(g|gr|grammes?)\b\.?/i],
    ['cl', /^cl\b/i],
    ['ml', /^ml\b/i],
    ['dl', /^dl\b/i],
    ['l', /^(l|litres?)\b/i],
    ['c. à soupe', /^(c\.?\s*à\s*s(oupe)?\.?|c\.?\s*a\s*s(oupe)?\.?|càs|cas|cs|cuil(l[eè]re)?s?\.?\s*à\s*soupe|cuillères?\s+à\s+soupe)(?=\s|$|\b)/i],
    ['c. à café', /^(c\.?\s*à\s*c(afé)?\.?|c\.?\s*a\s*c(afe)?\.?|càc|cac|cc|cuil(l[eè]re)?s?\.?\s*à\s*café|cuillères?\s+à\s+café)(?=\s|$|\b)/i],
    ['pincée', /^pincées?\b/i], ['sachet', /^sachets?\b/i], ['tranche', /^tranches?\b/i],
    ['gousse', /^gousses?\b/i], ['boîte', /^bo[iî]tes?\b/i], ['pot', /^pots?\b/i],
    ['verre', /^verres?\b/i], ['bol', /^bols?\b/i], ['botte', /^bottes?\b/i],
    ['brin', /^brins?\b/i], ['feuille', /^feuilles?\b/i], ['tasse', /^tasses?\b/i],
    ['poignée', /^poignées?\b/i], ['branche', /^branches?\b/i], ['bouquet', /^bouquets?\b/i],
    ['cube', /^cubes?\b/i], ['paquet', /^paquets?\b/i], ['rouleau', /^rouleaux?\b/i],
    ['barquette', /^barquettes?\b/i], ['filet', /^filets?\b/i], ['noix', /^noix\b/i],
    ['morceau', /^morceaux?\b/i], ['cuillère', /^cuill[eè]res?\b/i]
  ];

  function parseIngredient(line) {
    const text = String(line || '').replace(/^[-•*·–]\s*/, '').trim();
    let rest = text;
    let quantity = null;
    const num = rest.match(/^(\d+(?:[.,]\d+)?)(?:\s*([½¼¾⅓⅔⅛])|\s+(\d+)\/(\d+)|\/(\d+))?(?:\s*(?:-|à)\s*\d+(?:[.,]\d+)?)?\s*/);
    if (num) {
      quantity = parseFloat(num[1].replace(',', '.'));
      if (num[2]) quantity += FRACTIONS[num[2]];
      if (num[3]) quantity += Number(num[3]) / Number(num[4]);
      if (num[5]) quantity = quantity / Number(num[5]);
      rest = rest.slice(num[0].length);
    } else if (FRACTIONS[rest[0]]) {
      quantity = FRACTIONS[rest[0]];
      rest = rest.slice(1).trim();
    } else {
      const word = rest.match(/^(une?\s+demie?|[a-zéè]+)\s+/i);
      const key = word && normalize(word[1]).replace(/\s+/g, ' ');
      if (word && (key === 'un demi' || key === 'une demie' || key === 'une demi')) { quantity = 0.5; rest = rest.slice(word[0].length); }
      else if (word && NUMBER_WORDS[key] !== undefined) { quantity = NUMBER_WORDS[key]; rest = rest.slice(word[0].length); }
    }
    let unit = '';
    if (quantity !== null) {
      for (const [label, re] of UNITS) {
        const m = rest.match(re);
        if (m) { unit = label; rest = rest.slice(m[0].length).trim(); break; }
      }
    }
    const name = rest.replace(/^(de\s+|d['’]\s*)/i, '').trim();
    return { text, quantity, unit, name: name || text };
  }

  function cleanIngredient(i) {
    if (i && typeof i === 'object') {
      const parsed = parseIngredient(i.text || [i.quantity, i.unit, i.name].filter(x => x !== null && x !== undefined && x !== '').join(' '));
      return {
        text: parsed.text,
        quantity: typeof i.quantity === 'number' && isFinite(i.quantity) ? i.quantity : parsed.quantity,
        unit: typeof i.unit === 'string' ? i.unit : parsed.unit,
        name: i.name ? String(i.name) : parsed.name
      };
    }
    return parseIngredient(i);
  }

  const ingredientTexts = recipe => recipe.ingredients.map(i => i.text);

  // Quantité lisible : 0,5 → ½ ; 1,25 → 1 ¼ ; 333,3 g → 335 g.
  function formatQuantity(q, unit) {
    if (q === null || q === undefined) return '';
    if (['g', 'ml', 'mg'].includes(unit) && q >= 20) return String(Math.round(q / 5) * 5);
    const whole = Math.floor(q);
    const frac = q - whole;
    const known = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']].find(([v]) => Math.abs(frac - v) < 0.04);
    if (!['kg', 'l', 'cl', 'dl'].includes(unit) && q < 20 && known) return (whole ? whole + ' ' : '') + known[1];
    if (frac < 0.04 || frac > 0.96) return String(Math.round(q));
    return String(Math.round(q * 10) / 10).replace('.', ',');
  }

  // Quantité affichée d'un ingrédient (avec son unité) pour factor fois la recette.
  // Renvoie '' quand l'ingrédient n'a pas de quantité (« sel, poivre »).
  function ingredientAmount(ing, factor = 1) {
    if (ing.quantity === null) return '';
    let q = ing.quantity * factor;
    let unit = ing.unit;
    // 1000 g → 1 kg, 100 cl → 1 l, 1000 ml → 1 l
    const up = { g: [1000, 'kg'], ml: [1000, 'l'], cl: [100, 'l'] }[unit];
    if (up && q >= up[0]) { q /= up[0]; unit = up[1]; }
    if (unit && !/^(k?g|mg|c?l|ml|dl|c\. à .+|noix)$/.test(unit) && q > 1 && !/[sx]$/.test(unit)) unit += unit.endsWith('eau') ? 'x' : 's';
    return formatQuantity(q, unit) + (unit ? ' ' + unit : '');
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
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : lines(r.ingredients))
        .map(cleanIngredient).filter(i => i.text),
      steps: Array.isArray(r.steps) ? r.steps.map(String) : lines(r.steps),
      source: r.source ? String(r.source) : '',
      sourcePlatform: r.sourcePlatform ? String(r.sourcePlatform) : '',
      sourceAuthor: r.sourceAuthor ? String(r.sourceAuthor) : '',
      importedAt: r.importedAt || undefined,
      image: Boolean(r.image),
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
    const parts = [];
    if (r.image) {
      const img = el('img', { className: 'detail-photo', alt: 'Photo de ' + r.title });
      fillImage(img, r.id);
      parts.push(img);
    }
    parts.push(
      el('h2', { textContent: r.title }),
      el('div', { className: 'meta', textContent: [r.category, seasonsLabel(r), mealsLabel(r), r.servings ? r.servings + ' personnes' : '',
        r.prep ? 'préparation ' + r.prep + ' min' : '', r.cook ? 'cuisson ' + r.cook + ' min' : ''].filter(Boolean).join(' · ') })
    );
    if (r.ingredients.length) {
      const base = Number(r.servings) || 0;
      const list = el('ul', { className: 'ingredients' });
      const renderList = people => list.replaceChildren(...r.ingredients.map(i => {
        const amount = ingredientAmount(i, base && people ? people / base : 1);
        const link = i.unit ? (/^[aeiouyhéèêâîôûœ]/i.test(i.name) ? " d'" : ' de ') : ' ';
        return el('li', {}, amount ? [el('b', { textContent: amount }), link + i.name] : [i.text]);
      }));
      const head = [el('h3', { textContent: 'Ingrédients' })];
      if (base && r.ingredients.some(i => i.quantity !== null)) {
        let people = base;
        const count = el('b', { textContent: people });
        const step = d => () => { people = Math.max(1, people + d); count.textContent = people; renderList(people); };
        head.push(el('div', { className: 'portions' }, [
          'Pour ',
          el('button', { type: 'button', className: 'btn small', textContent: '−', ariaLabel: 'Une personne de moins', onclick: step(-1) }),
          count,
          el('button', { type: 'button', className: 'btn small', textContent: '+', ariaLabel: 'Une personne de plus', onclick: step(1) }),
          ' personnes'
        ]));
      }
      renderList(base);
      parts.push(...head, list);
    }
    if (r.steps.length) {
      parts.push(el('h3', { textContent: 'Étapes' }), el('ol', {}, r.steps.map(s => el('li', { textContent: s }))));
    }
    if (r.source || r.sourceAuthor || r.sourcePlatform) {
      const info = [r.sourcePlatform, r.sourceAuthor, r.importedAt ? 'importée le ' + formatDate(new Date(r.importedAt), { day: 'numeric', month: 'long', year: 'numeric' }) : '']
        .filter(Boolean).join(' · ');
      parts.push(el('h3', { textContent: 'Source' }));
      if (info) parts.push(el('p', { className: 'meta', textContent: info }));
      if (r.source) parts.push(/^https?:\/\//i.test(r.source)
        ? el('a', { href: r.source, target: '_blank', rel: 'noopener', className: 'source-link', textContent: r.source })
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

  // La photo d'une recette en attente est rangée sous la clé « attente:<id> ».
  const pendingImageKey = id => 'attente:' + id;

  async function addPending(items) {
    const pending = getPending();
    const now = new Date().toISOString();
    const added = items.map(it => ({
      id: newId(), origin: it.origin, platform: it.platform || '', fileName: it.fileName || '',
      hasImage: Boolean(it.image), collection: it.collection || '', note: it.note || '',
      importedAt: now, allYear: Boolean(it.aiFilled && it.allYear), aiFilled: Boolean(it.aiFilled),
      // La saison et le repas ne sont repris que s'ils viennent de la lecture par l'IA ;
      // sinon ils restent à choisir à la validation.
      recipe: { ...cleanRecipe({ category: 'Plat', ...it.recipe }),
        ...(it.aiFilled ? {} : { seasons: [], meals: [] }) }
    }));
    pending.push(...added);
    if (!savePending(pending)) return null;
    await Promise.all(added.map((p, i) => items[i].image ? images.put(pendingImageKey(p.id), items[i].image) : null));
    return added;
  }

  // Récupère le contenu de plusieurs recettes en attente (3 liens à la fois).
  // onProgress(faites, total) est appelé après chaque lien ; renvoie le nombre de réussites.
  async function fillPendingMany(ids, onProgress) {
    const queue = ids.slice();
    let done = 0;
    let ok = 0;
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        const p = getPending().find(x => x.id === id);
        if (p && p.recipe.source) {
          try {
            await fillPendingFromLink(p);
            ok++;
          } catch (e) {
            p.note = 'Récupération automatique impossible : ' + e.message + ' Complète la recette à la main.';
          }
          const fresh = getPending();
          const i = fresh.findIndex(x => x.id === id);
          if (i >= 0) { fresh[i] = p; savePending(fresh); }
        }
        done++;
        if (onProgress) onProgress(done, ids.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return ok;
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

  // ---- Découpage d'une recette écrite en texte libre (fichier .txt, description de publication) ----
  // Chaque ligne est rangée en ingrédient, étape ou note, d'après les titres de section quand il y en a
  // (même décorés : « 🛒 INGRÉDIENTS 👇 ») et sinon d'après sa forme. Le texte parasite des
  // réseaux sociaux (hashtags, mentions, « abonne-toi », « lien en bio »…) est écarté.

  // Verbes qui commencent une étape (infinitif, impératif ou présent).
  const STEP_VERBS = new RegExp('^(?:' + [
    'ajout', 'arros', 'assaisonn', 'badigeonn', 'beurr', 'cisel', 'coup', 'couvr', 'decoup', 'depos', 'dispos',
    'egoutt', 'emiett', 'eminc', 'epluch', 'etal', 'enfourn', 'enrob', 'epaiss', 'fouett', 'grill', 'hach',
    'incorpor', 'laiss', 'lav', 'melang', 'mix', 'napp', 'parsem', 'passe', 'pass', 'plac', 'poel', 'poivr',
    'prechauff', 'prepar', 'rajout', 'reserv', 'remu', 'retir', 'rissol', 'saupoudr', 'tranch', 'vers',
    'zest', 'chauff', 'fond', 'press', 'roul', 'form', 'decor', 'garn', 'remplis', 'repart', 'arrang', 'sal',
    'dor', 'blanch', 'farc', 'rot', 'petr', 'serv', 'cuis', 'fai', 'met', 'bat', 'port', 'travaill', 'tamis',
    'mesur', 'pes', 'rinc', 'trempe', 'egrain', 'gratt', 'presse', 'assembl', 'decoup', 'filtr', 'refroid'
  ].join('|') + ')(?:er|ez|e|es|ir|issez|is|it|re|ons|ent|s|ant)?\\b|^(?:faire|faites|fais|mettre|mettez|mets|cuire|cuisez|battre|battez|bats|servir|servez|sers|puis|ensuite|enfin|une fois|pendant|quand|lorsque|des que|au bout de|a la sortie|dans (?:un|une|le|la|les) )\\b');

  const decor = str => String(str || '')
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
    .replace(/[ \t]+/g, ' ').trim();
  const keycapNumber = /^\s*(\d{1,2})️?⃣/;
  const bullet = /^([-–—•·▪▫◦●○*✓✔→➡>]+|\d{1,2}\s*[.)/:\-–]\s+(?=\D)|[ée]tape\s*\d+\s*[:.)\-–]?)\s*/i;
  const quantityStart = /^(\d+([.,/]\d+)?|[½¼¾⅓⅔⅛]|une?\s|deux\s|trois\s|quatre\s|cinq\s|six\s|dix\s|douze\s|quelques\s|une poign|une pinc|un filet|un peu|du\s|de la\s|des\s|sel\b|poivre\b)/i;
  const NOISE = /(abonne|follow|lien en bio|link in bio|code promo|commente|identifie|tague?\s+(un|une|tes|ton|ta|quelqu)|n'?oublie pas|enregistre(?:-la| la| cette| ce)? ?(recette|post|video|reel)?\s*$|partage(?:-la| la| cette)? ?(recette|video|post|reel)|dis[- ]moi|en commentaire|like|sponsoris|partenariat|collab|#\w)/;

  function parseRecipeText(text) {
    let raw = String(text || '').replace(/\r/g, '');
    // Description écrite sur une seule ligne : on recrée les retours à la ligne.
    if ((raw.match(/\n/g) || []).length < 3 && raw.length > 150) {
      raw = raw
        .replace(/\s+(?=(?:[\p{Extended_Pictographic}️‍]+\s*)?(?:ingr[ée]dients?|pr[ée]paration|[ée]tapes?|la recette|instructions?|astuces?|conseils?)\s*[:：(])/giu, '\n')
        .replace(/\s+[•▪◦●·]\s*/g, '\n')
        .replace(/\s+[-–]\s+/g, '\n- ')
        .replace(/\s+(?=\d{1,2}\s*[.)]\s+\p{Lu})/gu, '\n')
        .replace(/\s*(?=\d️?⃣)/g, '\n');
    }
    const recipe = { title: '', ingredients: [], steps: [], notes: '' };
    const notes = [];
    let section = '';
    let group = '';

    const headingOf = h => {
      const bare = normalize(h).replace(/[:：!.]+$/, '').replace(/\s*\(.*\)\s*$/, '').trim();
      if (/^(les |mes )?(ingredients?|liste des courses|courses|il (vous|te|nous) faut|ce qu'?il (vous|te|nous) faut|ce dont (vous|tu) (avez|as) besoin)\b/.test(bare)) return 'ingredients';
      if (/^(la |les )?(preparation|etapes?|instructions?|methode|deroule|realisation|recette|comment (faire|on (le |la |les )?fait|je (la |le |les )?(fais|prepare|realise))|procede|marche a suivre|c'?est parti|a vos fourneaux)\b/.test(bare) && !/\d+\s*(min|h\b|heure)/.test(bare)) return 'steps';
      if (/^(mes |nos )?(astuces?|conseils?|tips?|notes?|remarques?|variantes?|bon a savoir|conservation|a savoir|suggestions?|pour accompagner|accompagnement)\b/.test(bare)) return 'notes';
      return '';
    };

    String(raw).split('\n').forEach(original => {
      const keycap = original.match(keycapNumber);
      let line = decor(original.replace(keycapNumber, ''))
        .replace(/(\s+[#@][\p{L}\p{N}_.]+)+\s*$/u, '').trim();
      if (!line || /^([#@][\p{L}\p{N}_.]+\s*)+$/u.test(line)) return;
      const n = normalize(line);

      // Durées : « Préparation : 20 min » n'est pas un titre de section.
      if (/^(temps de )?pr[ée]paration\s*:?\s*\d/i.test(n)) { recipe.prep = minutesIn(line); return; }
      if (/^(temps de )?cuisson\s*:?\s*\d/i.test(n)) { recipe.cook = minutesIn(line); return; }
      if (/^temps total\s*:?\s*\d/i.test(n)) return;
      // Titres de section (le reste de la ligne, s'il y en a, appartient à la section).
      const head = line.match(/^([^:：]{2,45})[:：]\s*(.*)$/) || [null, line, ''];
      const kind = headingOf(head[1]) || (line.length < 45 ? headingOf(line) : '');
      if (kind) {
        section = kind;
        group = '';
        const time = minutesIn(line);
        if (kind === 'steps' && time && /pr[ée]paration/i.test(head[1])) recipe.prep = recipe.prep || time;
        const serv = line.match(/(\d+)\s*(pers|personnes|parts|portions)/i);
        if (serv && !recipe.servings) recipe.servings = serv[1];
        if (head[2] && head[1] !== line) {
          head[2].split(/\s*[,;]\s+(?=\d|[½¼¾]|une?\s)|\s*[•·]\s*/).forEach(part => place(part, false));
        }
        return;
      }
      if (/^bon app[ée]tit/i.test(n) || (NOISE.test(n) && !quantityStart.test(line))) return;
      // Autre titre (court, terminé par « : » ou une flèche) : la section en cours s'arrête là,
      // la suite sera rangée d'après sa forme.
      if (section && line.length <= 40 && !quantityStart.test(line) && !/^pour\s/i.test(line) && /([:：]|[⬇👇↓]️?)\s*$/u.test(original.trim())) {
        section = '';
        group = '';
        return;
      }

      // Informations générales : portions, temps.
      const serv = line.match(/^(?:pour|portions?\s*:?|quantit[ée]s? pour)\s*(\d+)\s*(pers|personnes|parts|portions|gourmands)?/i);
      if (serv && line.length < 60) { recipe.servings = recipe.servings || serv[1]; return; }

      if (!recipe.title && !section) {
        const beforeEmoji = original.split(/[\p{Extended_Pictographic}]/u)[0].trim();
        recipe.title = (beforeEmoji.length >= 4 ? decor(beforeEmoji) : line).replace(/[:：!,.\-–]+$/, '').trim().slice(0, 120);
        return;
      }
      place(line, Boolean(keycap));
    });

    // Range une ligne de contenu selon sa forme et la section en cours.
    function place(line, numbered) {
      const text = line.replace(bullet, '').trim();
      if (!text) return;
      const n = normalize(text);
      const isNumbered = numbered || /^(\d{1,2}\s*[.)/:\-–]\s+\D|[ée]tape\s*\d+)/i.test(line);
      const looksStep = isNumbered || STEP_VERBS.test(n) || text.length > 90 || /[.!]$/.test(text) && text.split(' ').length > 6;
      const looksIngredient = !isNumbered && (quantityStart.test(text) || (text.length <= 60 && !STEP_VERBS.test(n) && !/[.!?]$/.test(text)));
      // Sous-titre d'un groupe d'ingrédients : « Pour la pâte : ».
      const groupMatch = text.match(/^pour (?:la |le |les |l'|l’)?(.{2,30}?)\s*[:：]?$/i);
      if (groupMatch && !quantityStart.test(text.replace(/^pour\s+/i, '')) && (section === 'ingredients' || /[:：]$/.test(text))) {
        section = 'ingredients';
        group = groupMatch[1].trim();
        return;
      }
      if (section === 'notes') { notes.push(text); return; }
      if (section === 'ingredients' && !(looksStep && !quantityStart.test(text))) {
        recipe.ingredients.push(group ? text + ' (' + group + ')' : text);
        return;
      }
      if (section === 'steps' || looksStep) { section = section === 'notes' ? 'notes' : 'steps'; recipe.steps.push(text); return; }
      if (looksIngredient) { recipe.ingredients.push(group ? text + ' (' + group + ')' : text); return; }
      notes.push(text);
    }

    recipe.notes = notes.join('\n');
    return recipe;
  }

  // Lit l'export de données d'un réseau social (JSON ou HTML) et en sort les liens de publications,
  // regroupés par collection quand le fichier les indique (cas d'Instagram).
  function parseSocialExport(text, platform) {
    const conf = PLATFORMS[platform];
    const found = [];
    const seen = new Set();
    const add = (url, collection, author) => {
      const u = url.replace(/[?#].*$/, '');
      if (conf && !conf.post.test(u)) return;
      if (!conf && !/^https?:\/\//.test(u)) return;
      if (seen.has(u)) return;
      seen.add(u);
      found.push({ url: u, collection: collection || '', author: author || '' });
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
        if (name && name.href && name.value) add(name.href, current, name.value);
        Object.values(node).forEach(walk);
      };
      walk(data);
    } else {
      (String(text).match(/https?:\/\/[^\s"'<>]+/g) || []).forEach(u => add(u, ''));
    }
    return found;
  }

  // ---- Photos : rangées dans IndexedDB, qui a beaucoup plus de place que localStorage ----
  // Clé = id de la recette (ou « attente:<id> » pour une recette importée pas encore validée).
  const images = (() => {
    let opening = null;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('mon-app-cuisine', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
    const run = (mode, action) => open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode);
      const req = action(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    }));
    return {
      get: key => run('readonly', st => st.get(key)).catch(() => null),
      put: (key, dataUrl) => run('readwrite', st => st.put(dataUrl, key)).then(() => true).catch(() => false),
      remove: key => run('readwrite', st => st.delete(key)).catch(() => null),
      async move(from, to) {
        const data = await this.get(from);
        if (!data) return false;
        await this.put(to, data);
        await this.remove(from);
        return true;
      }
    };
  })();

  // Affiche la photo rangée sous cette clé dans l'élément <img> (masqué s'il n'y en a pas).
  function fillImage(img, key) {
    images.get(key).then(data => {
      if (data) img.src = data;
      else img.hidden = true;
    });
    return img;
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

  // ---- Conversion automatique d'un lien par le serveur (Cloudflare Workers, voir server/worker.js) ----
  let serverCheck = null;
  // true si le site tourne avec son serveur (/api/extraire répond), false sinon
  // (fichier ouvert en local, GitHub Pages…).
  function serverAvailable() {
    if (!serverCheck) {
      serverCheck = location.protocol.startsWith('http')
        ? fetch('api/extraire', { headers: { Accept: 'application/json' } })
          .then(r => r.ok ? r.json() : null).then(d => Boolean(d && d.ok)).catch(() => false)
        : Promise.resolve(false);
    }
    return serverCheck;
  }

  // Catégorie d'un site (« Plat principal », « Desserts »…) ramenée aux nôtres, ou '' si inconnue.
  function categoryFrom(label) {
    const l = normalize(label);
    if (!l) return '';
    const map = [['entree', 'Entrée'], ['apero', 'Entrée'], ['plat', 'Plat'], ['dessert', 'Dessert'], ['gateau', 'Dessert'],
      ['boisson', 'Boisson'], ['cocktail', 'Boisson'], ['sauce', 'Sauce'], ['accompagnement', 'Accompagnement'],
      ['petit-dej', 'Petit-déjeuner'], ['petit dej', 'Petit-déjeuner'], ['brunch', 'Petit-déjeuner']];
    const hit = map.find(([k]) => l.includes(k));
    return hit ? hit[1] : '';
  }

  // Demande au serveur le contenu de la recette derrière un lien, et sa photo.
  // Renvoie { recipe, image, author, siteName, found } ou lève une erreur lisible.
  async function extractFromLink(url) {
    const res = await fetch('api/extraire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Le serveur n\'a pas pu lire ce lien.');
    const recipe = {
      title: data.title || '',
      ingredients: data.ingredients || [],
      steps: data.steps || [],
      servings: data.servings || '',
      prep: data.prep || '',
      cook: data.cook || '',
      category: CATEGORIES.includes(data.category) ? data.category : categoryFrom(data.category),
      notes: data.ai ? data.notes || '' : ''
    };
    // Rangée par l'IA (publication de réseau social) : saison et repas sont proposés aussi.
    const season = data.ai ? { seasons: data.seasons || [], meals: data.meals || [], allYear: Boolean(data.allYear) } : null;
    // Sinon, la recette est souvent dans la légende : le navigateur la découpe lui-même.
    if (!data.ai && data.text && !recipe.ingredients.length && !recipe.steps.length) {
      const parsed = parseRecipeText(data.text);
      Object.assign(recipe, { title: recipe.title || parsed.title, ingredients: parsed.ingredients, steps: parsed.steps, servings: recipe.servings || parsed.servings || '',
        prep: recipe.prep || parsed.prep || '', cook: recipe.cook || parsed.cook || '', notes: parsed.notes });
      if (!parsed.ingredients.length && !parsed.steps.length) recipe.notes = data.text;
    }
    let image = '';
    if (data.image) {
      try {
        const img = await fetch('api/image?url=' + encodeURIComponent(data.image));
        if (img.ok) image = await shrinkImage(await img.blob());
      } catch (e) { image = ''; }
    }
    return { recipe, image, season, ai: Boolean(data.ai), aiError: data.aiError || '', author: data.author || '', siteName: data.siteName || '', found: data.found || '' };
  }

  // Remplit une recette en attente avec ce que le serveur a trouvé, sans écraser ce qui est déjà saisi.
  async function fillPendingFromLink(p) {
    const got = await extractFromLink(p.recipe.source);
    const r = p.recipe;
    const cleaned = cleanRecipe({ ...got.recipe, category: r.category });
    if (got.recipe.category && !p.categoryChosen) r.category = got.recipe.category;
    if (!r.title.trim() && cleaned.title) r.title = cleaned.title;
    ['ingredients', 'steps'].forEach(k => { if (!r[k].length) r[k] = cleaned[k]; });
    ['servings', 'prep', 'cook'].forEach(k => { if (!r[k]) r[k] = cleaned[k]; });
    if (!r.notes && cleaned.notes) r.notes = cleaned.notes;
    // Saison et repas proposés par l'IA, seulement s'ils n'ont pas encore été choisis.
    if (got.season && !r.seasons.length && !p.allYear) {
      r.seasons = SEASONS.filter(x => got.season.seasons.includes(x));
      p.allYear = got.season.allYear || !r.seasons.length;
    }
    if (got.season && !r.meals.length) r.meals = Object.keys(MEALS).filter(m => got.season.meals.includes(m));
    if (!r.sourceAuthor && got.author) r.sourceAuthor = got.author;
    if (got.siteName) p.siteName = got.siteName;
    if (got.image && !p.hasImage && await images.put(pendingImageKey(p.id), got.image)) p.hasImage = true;
    p.note = got.ai
      ? 'Description de la publication rangée par l\'IA (ingrédients, étapes, notes, saison et repas) : vérifie-la avant de valider.'
      : got.found === 'recette'
        ? 'Recette récupérée automatiquement' + (got.siteName ? ' depuis ' + got.siteName : '') + ' : vérifie-la avant de valider.'
        : got.found === 'texte'
          ? 'Texte de la publication découpé automatiquement' + (got.aiError ? ' (IA indisponible : ' + got.aiError + ')' : '') + ' : vérifie que les ingrédients et les étapes sont bien rangés.'
          : 'Le lien a été lu mais aucune recette n\'y a été trouvée : complète-la à la main.';
    p.fetched = true;
    return got.found;
  }

  // ---- Lecture d'une photo ou d'un PDF de recette par l'IA (Claude, côté serveur) ----
  let photoReaderCheck = null;
  // true si le serveur répond et que la clé d'IA est configurée.
  function photoReaderAvailable() {
    if (!photoReaderCheck) {
      photoReaderCheck = location.protocol.startsWith('http')
        ? fetch('api/lire-photo', { headers: { Accept: 'application/json' } })
          .then(r => r.ok ? r.json() : null).then(d => Boolean(d && d.ok)).catch(() => false)
        : Promise.resolve(false);
    }
    return photoReaderCheck;
  }

  const readAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  // Envoie la photo (agrandie jusqu'à 1600 px pour que le texte reste lisible) ou le PDF au serveur.
  // Renvoie { recipe, allYear } au format de l'application, ou lève une erreur lisible.
  async function readRecipeFile(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const data = isPdf ? await readAsDataUrl(file) : await shrinkImage(file, 1600);
    if (!data) throw new Error('Cette photo n\'a pas pu être ouverte par le navigateur (format HEIC ?). Essaie en JPEG.');
    const res = await fetch('api/lire-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: isPdf ? 'application/pdf' : 'image/jpeg', data })
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.recipe) throw new Error(out.error || 'La lecture par l\'IA a échoué.');
    const { allYear, ...recipe } = out.recipe;
    return { recipe, allYear };
  }

  // Les recettes enregistrées avant le découpage des ingrédients sont converties une fois.
  (function migrate() {
    const raw = read(KEYS.recipes, null);
    if (Array.isArray(raw) && raw.some(r => r && Array.isArray(r.ingredients) && r.ingredients.some(i => typeof i === 'string'))) {
      write(KEYS.recipes, raw.filter(r => r && r.title).map(cleanRecipe));
    }
    const pending = read(KEYS.pending, null);
    if (Array.isArray(pending) && pending.some(p => p && (p.preview || (p.recipe && (p.recipe.ingredients || []).some(i => typeof i === 'string'))))) {
      const moves = [];
      const cleaned = pending.filter(p => p && p.recipe).map(p => {
        const { preview, ...rest } = p;
        if (preview) { moves.push([rest.id, preview]); rest.hasImage = true; }
        return { ...rest, recipe: { ...cleanRecipe(rest.recipe), seasons: rest.recipe.seasons || [], meals: rest.recipe.meals || [] } };
      });
      write(KEYS.pending, cleaned);
      moves.forEach(([id, data]) => images.put(pendingImageKey(id), data));
    }
  })();

  return {
    CATEGORIES, SEASONS, MEALS, PLATFORMS, newId, lines, normalize, cleanRecipe,
    parseIngredient, ingredientTexts, ingredientAmount, formatQuantity,
    images, fillImage, pendingImageKey, serverAvailable, extractFromLink, fillPendingFromLink, fillPendingMany,
    photoReaderAvailable, readRecipeFile,
    getRecipes, saveRecipes, getHistory, saveHistory, getDraft, saveDraft,
    getPending, savePending, addPending, pendingMissing, getImportMode, saveImportMode,
    platformOf, platformLabel, titleFromUrl, parseRecipeText, parseSocialExport, shrinkImage,
    seasonOf, fitsSeason, fitsMeal, seasonsLabel, mealsLabel, totalTime, nextMonday, isoDate, parseIsoDate, formatDate,
    plural, el, recipeDetail
  };
})();

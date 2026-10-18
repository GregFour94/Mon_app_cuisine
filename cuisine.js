// Données et utilitaires communs aux pages cuisine.
// Tout est stocké dans le navigateur (localStorage), partagé entre les pages du site.
const Cuisine = (() => {
  const KEYS = {
    recipes: 'mon-app-cuisine-recettes',
    history: 'mon-app-cuisine-historique',
    draft: 'mon-app-cuisine-menu-brouillon'
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
      el('div', { className: 'meta', textContent: [r.category, seasonsLabel(r), r.servings ? r.servings + ' personnes' : '',
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

  return {
    CATEGORIES, SEASONS, MEALS, newId, lines, normalize, cleanRecipe,
    getRecipes, saveRecipes, getHistory, saveHistory, getDraft, saveDraft,
    seasonOf, fitsSeason, seasonsLabel, totalTime, nextMonday, isoDate, parseIsoDate, formatDate,
    plural, el, recipeDetail
  };
})();

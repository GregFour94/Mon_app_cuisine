// Point d'entrée du Worker Cloudflare (voir wrangler.jsonc).
// Les pages du site (HTML, CSS, JS) sont servies directement comme fichiers statiques ;
// seules les adresses /api/… arrivent ici.
import * as extraire from './extraire.js';
import * as image from './image.js';
import * as lecturePhoto from './lecture-photo.js';

const routes = {
  '/api/extraire': { GET: extraire.onRequestGet, POST: extraire.onRequestPost },
  '/api/image': { GET: image.onRequestGet },
  '/api/lire-photo': { GET: lecturePhoto.onRequestGet, POST: lecturePhoto.onRequestPost }
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const route = routes[pathname];
    if (route) {
      const handler = route[request.method];
      if (!handler) return new Response('Méthode non autorisée.', { status: 405, headers: { Allow: Object.keys(route).join(', ') } });
      return handler({ request, env });
    }
    if (pathname.startsWith('/api/')) return new Response('Adresse inconnue.', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};

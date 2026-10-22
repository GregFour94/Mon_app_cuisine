// /api/image?url=… — appelée par le Worker (server/worker.js).
// Récupère la photo d'une recette sur le site d'origine et la renvoie depuis notre propre domaine :
// le navigateur peut alors la réduire et la garder (il n'en a pas le droit sur un autre domaine).
import { checkUrl } from './extraction.js';

const MAX_IMAGE = 8 * 1024 * 1024;

export async function onRequestGet({ request }) {
  const url = checkUrl(new URL(request.url).searchParams.get('url'));
  if (!url) return new Response('Adresse invalide.', { status: 400 });
  let res;
  try {
    res = await fetch(url.href, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonAppCuisine/1.0)', 'Accept': 'image/*' }
    });
  } catch (e) {
    return new Response('Image injoignable.', { status: 502 });
  }
  const type = res.headers.get('Content-Type') || '';
  if (!res.ok || !type.startsWith('image/')) return new Response('Ce lien ne mène pas à une image.', { status: 415 });
  if (Number(res.headers.get('Content-Length')) > MAX_IMAGE) return new Response('Image trop lourde.', { status: 413 });
  const data = await res.arrayBuffer();
  if (data.byteLength > MAX_IMAGE) return new Response('Image trop lourde.', { status: 413 });
  return new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } });
}

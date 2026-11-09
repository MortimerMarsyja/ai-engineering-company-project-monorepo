/**
 * Licensed stock photography used as a temporary stand-in for real
 * Brasaland photography (visual refresh — see ../IMAGE_CREDITS.md for
 * provenance and what each one should be replaced with).
 *
 * Centralizing the Unsplash CDN URL builder here (instead of repeating
 * `https://images.unsplash.com/photo-...?auto=format&fit=crop&w=...&q=...`
 * inline at every call site) keeps the query params consistent and makes
 * swapping a placeholder for a real, locally-hosted photo later a
 * one-line change per entry.
 */

const UNSPLASH_BASE = "https://images.unsplash.com";

function unsplashUrl(photoId: string, width: number, quality = 75): string {
  return `${UNSPLASH_BASE}/${photoId}?auto=format&fit=crop&w=${width}&q=${quality}`;
}

export const STOCK_PHOTOS = {
  heroGrillSpread: "photo-1555939594-58d7cb561ad1",
  churrascoMedellin: "photo-1432139509613-5c4255815697",
  churrascoBogota: "photo-1544025162-d76694265947",
  churrascoMiami: "photo-1529692236671-f1f6cf9683ba",
  ourStoryGrilledMeats: "photo-1558030006-450675393462",
} as const;

export { unsplashUrl };

const FIGHTER_PROFILE = /\/fightcenter\/fighters\/\d+-/;

/**
 * A Tapology fighter page only resolves when the path includes the numeric id
 * (`/fightcenter/fighters/86018-aaron-pico`). Slug-only URLs redirect to
 * `/fightcenter`, so those become a fighter search instead.
 * Stored URLs are left unchanged for id matching.
 */
export function tapologyProfileHref(fighter: { name: string; tapologyUrl?: string | null }): string {
  const stored = fighter.tapologyUrl?.trim() ?? "";
  if (stored && isDirectFighterProfile(stored)) return stored;
  const term = encodeURIComponent(fighter.name);
  return `https://www.tapology.com/search?term=${term}&search=Submit&mainSearchFilter=fighters`;
}

export function isTapologyFighterProfile(href: string): boolean {
  return isDirectFighterProfile(href);
}

function isDirectFighterProfile(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host !== "tapology.com" && host !== "www.tapology.com") return false;
  return FIGHTER_PROFILE.test(url.pathname);
}

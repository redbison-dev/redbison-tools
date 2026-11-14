/**
 * Bookmarked tools, kept in this browser's localStorage only (see /privacy).
 * Every access is guarded: private windows may refuse storage entirely.
 */
const KEY = 'redbison-tools.bookmarks';

export function getBookmarks(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function toggleBookmark(toolId: string): string[] {
  const list = getBookmarks();
  const next = list.includes(toolId) ? list.filter((id) => id !== toolId) : [...list, toolId];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the toggle is a no-op */
  }
  return next;
}

export const isBookmarked = (toolId: string): boolean => getBookmarks().includes(toolId);

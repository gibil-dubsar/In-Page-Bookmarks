import { Bookmark } from './bookmarks';

export type SaveBookmarkMessage = {
  action: 'saveBookmark';
  data: {
    name?: string;
    scrollPosition?: number;
    url?: string;
  };
  tabId?: number;
};

export type GetBookmarksMessage = {
  action: 'getBookmarks';
  url?: string;
};

export type DeleteBookmarkMessage = {
  action: 'deleteBookmark';
  bookmarkId?: string;
  url?: string;
};

export type RuntimeMessage = SaveBookmarkMessage | GetBookmarksMessage | DeleteBookmarkMessage;

export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const STORAGE_PREFIX = 'bookmarks:';

export function storageKey(url: string): string {
  return `${STORAGE_PREFIX}${url}`;
}

export function generateId(): string {
  const cryptoObj = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function getBookmarksForUrl(storage: StorageAdapter, url: string): Promise<Bookmark[]> {
  const key = storageKey(url);
  const stored = await storage.get<Bookmark[]>(key);
  return Array.isArray(stored) ? stored : [];
}

export async function handleMessage(
  message: RuntimeMessage,
  storage: StorageAdapter
): Promise<{ success?: boolean; error?: string; bookmarks?: Bookmark[]; bookmark?: Bookmark }> {
  if (!message || !message.action) {
    return { success: false, error: 'Missing action' };
  }

  switch (message.action) {
    case 'saveBookmark': {
      const data = message.data || {};
      const url = data.url;
      if (!url) {
        return { success: false, error: 'Missing url' };
      }

      const bookmarks = await getBookmarksForUrl(storage, url);
      const bookmark: Bookmark = {
        id: generateId(),
        name: data.name || 'Untitled',
        scrollPosition: Number(data.scrollPosition) || 0,
        url: url,
        timestamp: new Date().toISOString()
      };

      bookmarks.push(bookmark);
      await storage.set(storageKey(url), bookmarks);

      return { success: true, bookmark };
    }
    case 'getBookmarks': {
      const url = message.url;
      if (!url) {
        return { bookmarks: [] };
      }

      const bookmarks = await getBookmarksForUrl(storage, url);
      return { bookmarks };
    }
    case 'deleteBookmark': {
      const url = message.url;
      const bookmarkId = message.bookmarkId;
      if (!url || !bookmarkId) {
        return { success: false, error: 'Missing url or bookmarkId' };
      }

      const bookmarks = await getBookmarksForUrl(storage, url);
      const next = bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
      await storage.set(storageKey(url), next);
      return { success: true };
    }
    default:
      return { success: false, error: 'Unknown action' };
  }
}

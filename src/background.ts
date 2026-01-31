interface Bookmark {
  id: string;
  name: string;
  scrollPosition: number;
  url: string;
  timestamp: string;
}

type SaveBookmarkMessage = {
  action: 'saveBookmark';
  data: {
    name?: string;
    scrollPosition?: number;
    url?: string;
  };
  tabId?: number;
};

type GetBookmarksMessage = {
  action: 'getBookmarks';
  url?: string;
};

type DeleteBookmarkMessage = {
  action: 'deleteBookmark';
  bookmarkId?: string;
  url?: string;
};

type RuntimeMessage = SaveBookmarkMessage | GetBookmarksMessage | DeleteBookmarkMessage;

const STORAGE_PREFIX = 'bookmarks:';

function storageKey(url: string): string {
  return `${STORAGE_PREFIX}${url}`;
}

function generateId(): string {
  if (self.crypto && typeof self.crypto.randomUUID === 'function') {
    return self.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getStorage<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve: (value?: T) => void) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

function setStorage(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

async function getBookmarksForUrl(url: string): Promise<Bookmark[]> {
  const key = storageKey(url);
  const stored = await getStorage<Bookmark[]>(key);
  return Array.isArray(stored) ? stored : [];
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  (async () => {
    if (!message || !message.action) {
      sendResponse({ success: false, error: 'Missing action' });
      return;
    }

    switch (message.action) {
      case 'saveBookmark': {
        const data = message.data || {};
        const url = data.url;
        if (!url) {
          sendResponse({ success: false, error: 'Missing url' });
          return;
        }

        const bookmarks = await getBookmarksForUrl(url);
        const bookmark = {
          id: generateId(),
          name: data.name || 'Untitled',
          scrollPosition: Number(data.scrollPosition) || 0,
          url: url,
          timestamp: new Date().toISOString()
        };

        bookmarks.push(bookmark);
        await setStorage(storageKey(url), bookmarks);

        sendResponse({ success: true, bookmark });
        return;
      }
      case 'getBookmarks': {
        const url = message.url;
        if (!url) {
          sendResponse({ bookmarks: [] });
          return;
        }

        const bookmarks = await getBookmarksForUrl(url);
        sendResponse({ bookmarks });
        return;
      }
      case 'deleteBookmark': {
        const url = message.url;
        const bookmarkId = message.bookmarkId;
        if (!url || !bookmarkId) {
          sendResponse({ success: false, error: 'Missing url or bookmarkId' });
          return;
        }

        const bookmarks = await getBookmarksForUrl(url);
        const next = bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
        await setStorage(storageKey(url), next);
        sendResponse({ success: true });
        return;
      }
      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return;
    }
  })().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    sendResponse({ success: false, error: message });
  });

  return true;
});

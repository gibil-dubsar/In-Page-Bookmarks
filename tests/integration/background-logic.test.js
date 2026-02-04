const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMessage, storageKey } = require('../../extension/lib/background-logic.js');

function createMemoryStorage() {
  const store = new Map();
  return {
    async get(key) {
      return store.get(key);
    },
    async set(key, value) {
      store.set(key, value);
    },
    _store: store
  };
}

test('handleMessage saves and retrieves bookmarks', async () => {
  const storage = createMemoryStorage();
  const url = 'https://example.com';

  const saveResponse = await handleMessage(
    {
      action: 'saveBookmark',
      data: { name: 'Test', scrollPosition: 123, url }
    },
    storage
  );

  assert.equal(saveResponse.success, true);
  assert.ok(saveResponse.bookmark);

  const getResponse = await handleMessage(
    {
      action: 'getBookmarks',
      url
    },
    storage
  );

  assert.equal(getResponse.bookmarks.length, 1);
  assert.equal(getResponse.bookmarks[0].name, 'Test');

  const stored = storage._store.get(storageKey(url));
  assert.equal(stored.length, 1);
});

test('handleMessage deletes bookmarks', async () => {
  const storage = createMemoryStorage();
  const url = 'https://example.com';

  const saveResponse = await handleMessage(
    {
      action: 'saveBookmark',
      data: { name: 'To delete', scrollPosition: 10, url }
    },
    storage
  );

  const bookmarkId = saveResponse.bookmark.id;

  const deleteResponse = await handleMessage(
    {
      action: 'deleteBookmark',
      url,
      bookmarkId
    },
    storage
  );

  assert.equal(deleteResponse.success, true);

  const getResponse = await handleMessage(
    {
      action: 'getBookmarks',
      url
    },
    storage
  );

  assert.equal(getResponse.bookmarks.length, 0);
});

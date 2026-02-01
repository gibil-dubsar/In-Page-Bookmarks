const test = require('node:test');
const assert = require('node:assert/strict');
const { sortBookmarksByTimestamp, formatRelativeTime } = require('../../extension/lib/bookmarks.js');

test('sortBookmarksByTimestamp orders newest first', () => {
  const bookmarks = [
    { id: '1', name: 'A', scrollPosition: 0, url: 'u', timestamp: '2024-01-01T00:00:00.000Z' },
    { id: '2', name: 'B', scrollPosition: 0, url: 'u', timestamp: '2024-02-01T00:00:00.000Z' }
  ];

  const sorted = sortBookmarksByTimestamp(bookmarks);
  assert.equal(sorted[0].id, '2');
  assert.equal(sorted[1].id, '1');
});

test('formatRelativeTime formats minutes/hours/days', () => {
  const now = new Date('2024-02-01T12:00:00.000Z');

  assert.equal(formatRelativeTime('2024-02-01T12:00:00.000Z', now), 'Just now');
  assert.equal(formatRelativeTime('2024-02-01T11:30:00.000Z', now), '30m ago');
  assert.equal(formatRelativeTime('2024-02-01T10:00:00.000Z', now), '2h ago');
  assert.equal(formatRelativeTime('2024-01-30T12:00:00.000Z', now), '2d ago');
});

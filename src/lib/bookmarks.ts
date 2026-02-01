export interface Bookmark {
  id: string;
  name: string;
  scrollPosition: number;
  url: string;
  timestamp: string;
}

export function sortBookmarksByTimestamp(bookmarks: Bookmark[]): Bookmark[] {
  return [...bookmarks].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function formatRelativeTime(timestamp: string, now: Date = new Date()): string {
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

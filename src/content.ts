type ScrollMessage = {
  action: 'scrollToPosition';
  scrollPosition?: number;
};

chrome.runtime.onMessage.addListener((message: ScrollMessage, _sender, sendResponse): boolean => {
  if (!message || message.action !== 'scrollToPosition') {
    return false;
  }

  const position = Number(message.scrollPosition) || 0;
  window.scrollTo({ top: position, behavior: 'smooth' });
  sendResponse({ success: true });
  return true;
});

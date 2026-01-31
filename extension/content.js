chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.action !== 'scrollToPosition') {
        return false;
    }
    const position = Number(message.scrollPosition) || 0;
    window.scrollTo({ top: position, behavior: 'smooth' });
    sendResponse({ success: true });
    return true;
});

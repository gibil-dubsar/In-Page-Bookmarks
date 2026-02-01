import { handleMessage, RuntimeMessage, StorageAdapter } from './lib/background-logic';

const storage: StorageAdapter = {
  get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve: (value?: T) => void) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] as T | undefined);
      });
    });
  },
  set(key: string, value: unknown): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }
};

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleMessage(message, storage)
    .then((response) => sendResponse(response))
    .catch((error) => {
      const message = error && error.message ? error.message : String(error);
      sendResponse({ success: false, error: message });
    });

  return true;
});

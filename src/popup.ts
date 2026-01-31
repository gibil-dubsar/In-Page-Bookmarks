/**
 * Popup Script for In-Page Bookmarks Chrome Extension
 * 
 * This script manages the extension's popup interface, handling user interactions,
 * bookmark management, and communication with the background script and content scripts.
 * It provides the main user interface for saving, viewing, and jumping to bookmarks.
 * 
 * @fileoverview Popup interface script for Chrome extension
 * @author In-Page Bookmarks Extension
 * @version 1.0.0
 */

/**
 * Global variables for popup state management
 * @type {Object|null} currentTab - Currently active tab information
 * @type {Array} bookmarks - Array of bookmarks for the current page
 */
interface Bookmark {
  id: string;
  name: string;
  scrollPosition: number;
  url: string;
  timestamp: string;
}

interface Window {
  jumpToBookmark: (bookmarkId: string) => void;
  deleteBookmark: (bookmarkId: string) => void;
  testScroll: (position: number) => void;
  scrollToPosition: (position: number) => void;
  PDFViewerApplication?: {
    page: number;
    pagesCount: number;
    currentScale: number;
    pdfDocument?: unknown;
  };
}

type NotificationType = 'info' | 'success' | 'error';
type DebugMethods = Record<string, unknown>;

let currentTab: chrome.tabs.Tab | null = null;
let bookmarks: Bookmark[] = [];

/**
 * Jump to a specific bookmark position
 * 
 * This function handles jumping to a saved bookmark position. It first tries
 * to use script injection (most reliable method), then falls back to content
 * script messaging if injection fails.
 * 
 * @param {string} bookmarkId - The unique ID of the bookmark to jump to
 * 
 * @example
 * // Jump to bookmark with ID "1234567890"
 * jumpToBookmark("1234567890");
 */
function jumpToBookmark(bookmarkId: string) {
  console.log('=== JUMP FUNCTION CALLED ===');
  console.log('Jumping to bookmark:', bookmarkId);
  console.log('Available bookmarks:', bookmarks);
  console.log('Current tab:', currentTab);
  
  // Find the bookmark in the current bookmarks array
  const bookmark = bookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) {
    console.error('Bookmark not found:', bookmarkId);
    return;
  }

  console.log('Found bookmark:', bookmark);

  // Try injection first (most reliable method), then fallback to content script
  scrollToPositionViaInjection(currentTab!.id as number, bookmark.scrollPosition)
    .then(() => {
      console.log('Scroll injection successful');
    })
    .catch((injectionError) => {
      console.warn('Injection failed, trying content script:', injectionError);
      (chrome.tabs.sendMessage(currentTab!.id as number, {
        action: 'scrollToPosition',
        scrollPosition: bookmark.scrollPosition
      }) as unknown as Promise<void>)
      .then(() => {
        console.log('Content script scroll successful');
      })
      .catch((contentError) => {
        console.error('Both injection and content script failed:', contentError);
      });
    });
}

/**
 * Delete a bookmark by ID
 * 
 * This function removes a bookmark from storage and updates the UI.
 * It communicates with the background script to perform the deletion.
 * 
 * @param {string} bookmarkId - The unique ID of the bookmark to delete
 * 
 * @example
 * // Delete bookmark with ID "1234567890"
 * deleteBookmark("1234567890");
 */
function deleteBookmark(bookmarkId: string) {
  console.log('=== DELETE FUNCTION CALLED ===');
  console.log('Deleting bookmark:', bookmarkId);
  console.log('Available bookmarks:', bookmarks);

  (chrome.runtime.sendMessage({
    action: 'deleteBookmark',
    bookmarkId: bookmarkId,
    url: currentTab?.url
  }) as unknown as Promise<{ success: boolean }>)
  .then((response) => {
    console.log('Delete response:', response);
    loadBookmarks();
  })
  .catch((error) => {
    console.error('Error deleting bookmark:', error);
  });
}

/**
 * Make functions globally available for event delegation
 * These functions need to be accessible from event handlers
 */
window.jumpToBookmark = jumpToBookmark;
window.deleteBookmark = deleteBookmark;

/**
 * Console testing function for scroll functionality
 * 
 * This function is available in the browser console for testing
 * scroll functionality during development.
 * 
 * @param {number} position - The scroll position to test
 * 
 * @example
 * // Test scrolling to position 1500px
 * window.testScroll(1500);
 */
window.testScroll = function(position: number) {
  console.log('Testing scroll to position:', position);
  scrollToPositionViaInjection(currentTab!.id as number, position)
    .then(() => console.log('Scroll test successful'))
    .catch(err => console.error('Scroll test failed:', err));
};

/**
 * Direct scroll function for console testing
 * 
 * This function provides a direct way to test scrolling from the console
 * without going through the bookmark system.
 * 
 * @param {number} position - The scroll position to test
 * 
 * @example
 * // Direct scroll to position 1500px
 * window.scrollToPosition(1500);
 */
window.scrollToPosition = function(position: number) {
  console.log('Direct scroll to position:', position);
  (chrome.scripting.executeScript({
    target: { tabId: currentTab!.id as number },
    func: ((pos: number) => {
      window.scrollTo({ top: pos, behavior: 'smooth' });
      console.log('Scrolled to:', pos);
    }) as unknown as () => void,
    args: [position]
  }) as unknown as Promise<unknown>).then(() => console.log('Direct scroll successful'))
    .catch(err => console.error('Direct scroll failed:', err));
};

/**
 * Initialize popup when DOM is loaded
 * 
 * This event listener ensures the popup is properly initialized
 * after the DOM is fully loaded and ready for interaction.
 */
document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
  await initializePopup();
  setupEventListeners();
});

/**
 * Initialize the popup interface
 * 
 * This function sets up the popup by getting the current tab,
 * checking for restricted pages, loading bookmarks, and getting
 * the current scroll position.
 * 
 * @returns {Promise<void>} Promise that resolves when initialization is complete
 * 
 * @example
 * // Initialize popup
 * await initializePopup();
 */
async function initializePopup(): Promise<void> {
  try {
    // Get current active tab
    const tabs = await (chrome.tabs.query({ active: true, currentWindow: true }) as Promise<chrome.tabs.Tab[]>);
    currentTab = tabs[0];

    if (!currentTab) {
      console.error('No active tab found');
      return;
    }

    console.log('Current tab:', currentTab.url);

    // Check if we're on a restricted page (chrome://, extension://, etc.)
    if (currentTab.url.startsWith('chrome://') ||
        currentTab.url.startsWith('chrome-extension://') ||
        currentTab.url.startsWith('moz-extension://') ||
        currentTab.url.startsWith('edge://') ||
        currentTab.url.startsWith('about:')) {
      console.warn('This extension cannot be used on browser internal pages');
      return;
    }

    // Load bookmarks for current page
    await loadBookmarks();
    
    // Get current scroll position
    await getCurrentScrollPosition();
    
    // Show a helpful message if we can't get scroll position
    setTimeout(() => {
      const saveBtn = document.getElementById('saveBookmarkBtn') as HTMLButtonElement | null;
      if (saveBtn && saveBtn.textContent!.includes('Save Position (0px)')) {
        console.log('Content script may not be loaded, but extension will still work');
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error initializing popup:', error);
  }
}

/**
 * Setup event listeners for user interactions
 * 
 * This function attaches event listeners to form elements and implements
 * event delegation for dynamically created bookmark buttons.
 * 
 * @example
 * // Setup all event listeners
 * setupEventListeners();
 */
function setupEventListeners(): void {
  const saveBtn = document.getElementById('saveBookmarkBtn') as HTMLButtonElement;
  const nameInput = document.getElementById('bookmarkName') as HTMLInputElement;
  
  // Save button click handler
  saveBtn.addEventListener('click', saveCurrentPosition);
  
  // Enter key handler for name input
  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveCurrentPosition();
    }
  });

  // Event delegation for dynamically created bookmark buttons
  document.addEventListener('click', (e) => {
    // Handle jump button clicks
    if ((e.target as Element).closest('.btn-jump')) {
      const button = (e.target as Element).closest('.btn-jump') as HTMLElement;
      const bookmarkId = button.getAttribute('data-bookmark-id');
      console.log('Jump button clicked for:', bookmarkId);
      jumpToBookmark(bookmarkId as string);
    }
    
    // Handle delete button clicks
    if ((e.target as Element).closest('.btn-delete')) {
      const button = (e.target as Element).closest('.btn-delete') as HTMLElement;
      const bookmarkId = button.getAttribute('data-bookmark-id');
      console.log('Delete button clicked for:', bookmarkId);
      deleteBookmark(bookmarkId as string);
    }
  });
}

/**
 * Get current scroll position from the active tab
 * 
 * This function attempts to get the current scroll position using
 * script injection (most reliable method) and updates the UI display.
 * 
 * @returns {Promise<void>} Promise that resolves when position is retrieved
 * 
 * @example
 * // Get current scroll position
 * await getCurrentScrollPosition();
 */
async function getCurrentScrollPosition(): Promise<void> {
  try {
    // Check if we can access the tab
    if (!currentTab || !currentTab.id) {
      console.error('No valid tab found');
      return;
    }

    // Try to get scroll position via injection first (more reliable)
    const scrollPosition = await getScrollViaInjection(currentTab.id as number);
    updateScrollPositionDisplay(scrollPosition);
    
  } catch (error) {
    console.error('Error getting scroll position:', error);
    // Fallback: show default button text
    updateScrollPositionDisplay(0);
  }
}

/**
 * Update the scroll position display in the save button
 * 
 * This function updates the save button's content to show the current
 * scroll position and appropriate icon.
 * 
 * @param {number} scrollPosition - The current scroll position in pixels
 * 
 * @example
 * // Update display with current position
 * updateScrollPositionDisplay(1500);
 */
function updateScrollPositionDisplay(scrollPosition: number): void {
  const saveBtn = document.getElementById('saveBookmarkBtn') as HTMLButtonElement;
  saveBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  `;
}

/**
 * Save the current scroll position as a bookmark
 * 
 * This function validates the bookmark name, gets the current scroll position,
 * and saves the bookmark to storage via the background script.
 * 
 * @returns {Promise<void>} Promise that resolves when bookmark is saved
 * 
 * @example
 * // Save current position as bookmark
 * await saveCurrentPosition();
 */
async function saveCurrentPosition(): Promise<void> {
  try {
    const nameInput = document.getElementById('bookmarkName') as HTMLInputElement;
    const bookmarkName = nameInput.value.trim();
    
    // Validate bookmark name
    if (!bookmarkName) {
      console.warn('Please enter a bookmark name');
      nameInput.focus();
      return;
    }

    if (!currentTab || !currentTab.id) {
      console.error('No active tab found');
      return;
    }

    // Get current scroll position using injection (most reliable method)
    const scrollPosition = await getScrollViaInjection(currentTab.id as number);

    // Save bookmark via background script
    const saveResponse = await (chrome.runtime.sendMessage({
      action: 'saveBookmark',
      data: {
        name: bookmarkName,
        scrollPosition: scrollPosition,
        url: currentTab.url
      },
      tabId: currentTab.id as number
    }) as Promise<{ success?: boolean }>);

    if (saveResponse && saveResponse.success) {
      // Clear input and reload bookmarks
      nameInput.value = '';
      await loadBookmarks();
    }
    
  } catch (error) {
    console.error('Error saving bookmark:', error);
  }
}

/**
 * Load bookmarks for the current page
 * 
 * This function retrieves all bookmarks for the current page from storage
 * and updates the UI to display them.
 * 
 * @returns {Promise<void>} Promise that resolves when bookmarks are loaded
 * 
 * @example
 * // Load bookmarks for current page
 * await loadBookmarks();
 */
async function loadBookmarks(): Promise<void> {
  try {
    const response = await (chrome.runtime.sendMessage({
      action: 'getBookmarks',
      url: currentTab?.url
    }) as Promise<{ bookmarks?: Bookmark[] }>);

    if (response && response.bookmarks) {
      bookmarks = response.bookmarks;
      renderBookmarks();
    }
  } catch (error) {
    console.error('Error loading bookmarks:', error);
  }
}

/**
 * Render the bookmarks list in the UI
 * 
 * This function creates the HTML for displaying bookmarks in the popup,
 * including sorting by creation time and handling the empty state.
 * 
 * @example
 * // Render all bookmarks
 * renderBookmarks();
 */
function renderBookmarks(): void {
  const bookmarksList = document.getElementById('bookmarksList') as HTMLElement;
  const bookmarkCount = document.getElementById('bookmarkCount') as HTMLElement;
  
  // Update bookmark count
  bookmarkCount.textContent = String(bookmarks.length);
  
  // Handle empty state
  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = `
      <div class="no-bookmarks">
        <div class="no-bookmarks-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <p>No bookmarks saved yet</p>
        <p class="hint">Scroll to a position and save it as a bookmark</p>
      </div>
    `;
    return;
  }

  // Sort bookmarks by creation time (newest first)
  const sortedBookmarks = [...bookmarks].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Generate HTML for each bookmark
  bookmarksList.innerHTML = sortedBookmarks.map(bookmark => `
    <div class="bookmark-item" data-id="${bookmark.id}">
      <div class="bookmark-info">
        <div class="bookmark-name">${escapeHtml(bookmark.name)}</div>
        <div class="bookmark-position">${Math.round(bookmark.scrollPosition)}px</div>
      </div>
      <div class="bookmark-actions">
        <button class="btn-small btn-jump" data-bookmark-id="${bookmark.id}" title="Jump to this position">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        </button>
        <button class="btn-small btn-delete" data-bookmark-id="${bookmark.id}" title="Delete bookmark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Utility function to escape HTML characters
 * 
 * This function prevents XSS attacks by escaping HTML characters
 * in user input before displaying it in the DOM.
 * 
 * @param {string} text - The text to escape
 * @returns {string} The escaped HTML string
 * 
 * @example
 * // Escape user input
 * const safeText = escapeHtml('<script>alert("xss")</script>');
 * // Returns: "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format timestamp into human-readable relative time
 * 
 * This function converts a timestamp into a user-friendly relative time
 * format (e.g., "2h ago", "3d ago", "Just now").
 * 
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted relative time string
 * 
 * @example
 * // Format timestamp
 * const timeStr = formatDate("2024-01-15T10:30:00.000Z");
 * // Returns: "2h ago" (if current time is 12:30)
 */
function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
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

/**
 * Show an error notification
 * 
 * @param {string} message - The error message to display
 * 
 * @example
 * // Show error message
 * showError('Failed to save bookmark');
 */
function showError(message: string): void {
  showNotification(message, 'error');
}

/**
 * Show a success notification
 * 
 * @param {string} message - The success message to display
 * 
 * @example
 * // Show success message
 * showSuccess('Bookmark saved successfully!');
 */
function showSuccess(message: string): void {
  showNotification(message, 'success');
}

/**
 * Show a notification to the user
 * 
 * This function creates and displays a temporary notification
 * in the popup with appropriate styling based on the type.
 * 
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('info', 'success', 'error')
 * 
 * @example
 * // Show info notification
 * showNotification('Processing...', 'info');
 */
function showNotification(message: string, type: NotificationType = 'info'): void {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);

  // Auto remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

/**
 * Get scroll position by injecting a script into the active tab
 * 
 * This is the most reliable method for getting scroll position as it
 * runs directly in the page context and can access all scroll properties.
 * Enhanced for PDF support with multiple detection and scroll methods.
 * 
 * @param {number} tabId - The ID of the tab to get scroll position from
 * @returns {Promise<number>} Promise that resolves to the scroll position
 * 
 * @example
 * // Get scroll position via injection
 * const position = await getScrollViaInjection(123);
 * console.log(position); // 1500
 */
async function getScrollViaInjection(tabId: number): Promise<number> {
  try {
    const [{ result } = {}] = await (chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Comprehensive PDF detection and scroll position retrieval
        const debugInfo: {
          url: string;
          isPDF: boolean;
          detectionMethods: Record<string, boolean>;
          scrollMethods: DebugMethods;
          foundPosition: number;
        } = {
          url: window.location.href,
          isPDF: false,
          detectionMethods: {},
          scrollMethods: {},
          foundPosition: 0
        };

        // PDF detection function with comprehensive checks
        function detectPDF() {
          const checks = {
            urlCheck: window.location.href.includes('.pdf') || window.location.href.includes('application/pdf'),
            embedCheck: !!document.querySelector('embed[type="application/pdf"]'),
            chromePdfCheck: !!document.querySelector('embed[type="application/x-google-chrome-pdf"]'),
            objectCheck: !!document.querySelector('object[type="application/pdf"]'),
            pluginCheck: !!document.querySelector('#plugin'),
            iframeCheck: !!document.querySelector('iframe[src*="pdf"]'),
            pdfjsGlobal: !!(window.PDFViewerApplication),
            pdfjsViewer: !!document.querySelector('.pdfViewer'),
            viewerId: !!document.querySelector('#viewer'),
            chromeExtension: window.location.href.startsWith('chrome-extension://') && window.location.href.includes('pdf')
          };

          debugInfo.detectionMethods = checks;
          return Object.values(checks).some(v => v === true);
        }

        // Find the main scrollable element on the page
        function findMainScrollableElement() {
          // First check if window itself is scrollable and has scroll
          const windowScrollY = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
          const windowScrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
          const windowClientHeight = window.innerHeight || document.documentElement.clientHeight || 0;

          // If window has significant scroll position, it's likely the main scroller
          if (windowScrollY > 50 && windowScrollHeight > windowClientHeight) {
            return null; // null indicates use window scroll
          }

          // Find all potentially scrollable elements
          const allElements = document.querySelectorAll('*');
          const scrollableElements = [];

          for (const element of allElements) {
            // Skip if not an element node
            if (element.nodeType !== 1) continue;

            const style = window.getComputedStyle(element);
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;

            // Check if element has scrollable overflow
            if (overflowY === 'auto' || overflowY === 'scroll' || overflowX === 'auto' || overflowX === 'scroll') {
              const scrollHeight = element.scrollHeight;
              const clientHeight = element.clientHeight;
              const scrollTop = element.scrollTop;

              // Only consider elements that have scrollable content
              if (scrollHeight > clientHeight) {
                const scrollableArea = scrollHeight - clientHeight;
                const rect = element.getBoundingClientRect();

                scrollableElements.push({
                  element: element,
                  scrollHeight: scrollHeight,
                  clientHeight: clientHeight,
                  scrollTop: scrollTop,
                  scrollableArea: scrollableArea,
                  width: rect.width,
                  height: rect.height,
                  area: rect.width * rect.height,
                  score: 0
                });
              }
            }
          }

          if (scrollableElements.length === 0) {
            return null; // Use window scroll
          }

          // Score each scrollable element
          for (const item of scrollableElements) {
            let score = 0;

            // Prefer elements with larger scrollable area (max 100 points)
            score += Math.min(100, (item.scrollableArea / 100));

            // Prefer elements currently being scrolled (max 200 points)
            if (item.scrollTop > 0) {
              score += Math.min(200, (item.scrollTop / 10));
            }

            // Prefer larger elements (max 100 points)
            score += Math.min(100, (item.area / 10000));

            // Prefer elements that take up significant viewport (max 50 points)
            const viewportArea = window.innerWidth * window.innerHeight;
            const viewportPercentage = (item.area / viewportArea) * 100;
            score += Math.min(50, viewportPercentage);

            item.score = score;
          }

          // Sort by score (highest first)
          scrollableElements.sort((a, b) => b.score - a.score);

          // Return the highest scoring element if it has a meaningful score
          if (scrollableElements[0].score > 50) {
            return scrollableElements[0].element;
          }

          return null; // Use window scroll
        }

        const isPDF = detectPDF();
        debugInfo.isPDF = isPDF;
        
        if (isPDF) {
          console.log('=== PDF DETECTED - Debug Info ===', debugInfo);
          
          // Method 1: PDF.js viewer (Chrome's built-in PDF viewer)
          if (window.PDFViewerApplication) {
            console.log('PDFViewerApplication found:', {
              page: window.PDFViewerApplication.page,
              pagesCount: window.PDFViewerApplication.pagesCount,
              currentScale: window.PDFViewerApplication.currentScale,
              pdfDocument: !!window.PDFViewerApplication.pdfDocument
            });
            
            const page = window.PDFViewerApplication.page;
            const viewer = document.querySelector('.pdfViewer') || 
                          document.querySelector('#viewer') ||
                          document.querySelector('[id="viewer"]') ||
                          document.querySelector('[class*="viewer"]');
            
            if (viewer) {
              const scrollTop = viewer.scrollTop || 0;
              const scrollHeight = viewer.scrollHeight || 0;
              const clientHeight = viewer.clientHeight || 0;
              
              debugInfo.scrollMethods.pdfjs = {
                page: page,
                viewerScrollTop: scrollTop,
                scrollHeight: scrollHeight,
                clientHeight: clientHeight,
                viewerFound: true
              };
              
              console.log('PDF.js viewer found:', {
                element: viewer.tagName,
                id: viewer.id,
                className: viewer.className,
                scrollTop: scrollTop,
                scrollHeight: scrollHeight
              });
              
              // Combine page number and scroll position for accurate positioning
              const combinedPosition = (page - 1) * 10000 + scrollTop;
              debugInfo.foundPosition = combinedPosition;
              console.log('PDF.js scroll position:', combinedPosition, 'page:', page, 'scroll:', scrollTop);
              return combinedPosition;
            } else {
              console.warn('PDFViewerApplication found but viewer element not found');
            }
          }
          
          // Method 2: Chrome's PDF embed (application/x-google-chrome-pdf)
          // Chrome PDFs scroll the body/window, not the embed itself
          const chromePdfEmbed = document.querySelector('embed[type="application/x-google-chrome-pdf"]');
          if (chromePdfEmbed) {
            const scroll = document.body.scrollTop ||
                          document.documentElement.scrollTop ||
                          window.pageYOffset ||
                          window.scrollY || 0;
            debugInfo.scrollMethods.chromePdf = {
              embedFound: true,
              bodyScrollTop: document.body.scrollTop,
              htmlScrollTop: document.documentElement.scrollTop,
              windowScrollY: window.scrollY,
              finalScroll: scroll
            };
            console.log('Chrome PDF embed found, using body/window scroll:', scroll);
            if (scroll > debugInfo.foundPosition) {
              debugInfo.foundPosition = scroll;
            }
            // Always return for Chrome PDFs, even if 0
            if (scroll >= 0) {
              console.log('=== PDF SCROLL DEBUG SUMMARY ===', debugInfo);
              console.log('Final position:', debugInfo.foundPosition);
              return debugInfo.foundPosition;
            }
          }

          // Method 3: Check all possible scrollable containers
          const possibleContainers = [
            '#viewer',
            '.pdfViewer',
            '#plugin',
            '[id*="viewer"]',
            '[class*="viewer"]',
            '[class*="pdf"]',
            'embed',
            'object',
            'iframe',
            'body',
            'html'
          ];
          
          for (const selector of possibleContainers) {
            const elements = document.querySelectorAll(selector);
            for (const elem of elements) {
              const scrollTop = elem.scrollTop || 0;
              const scrollHeight = elem.scrollHeight || 0;
              const clientHeight = elem.clientHeight || 0;
              
              if (scrollHeight > clientHeight && scrollTop > 0) {
                debugInfo.scrollMethods[selector] = {
                  scrollTop: scrollTop,
                  scrollHeight: scrollHeight,
                  clientHeight: clientHeight
                };
                console.log(`Found scrollable element (${selector}):`, {
                  tagName: elem.tagName,
                  id: elem.id,
                  className: elem.className,
                  scrollTop: scrollTop,
                  scrollHeight: scrollHeight
                });
                
                if (scrollTop > debugInfo.foundPosition) {
                  debugInfo.foundPosition = scrollTop;
                }
              }
            }
          }
          
          // Method 4: Other PDF embed/object scroll
          const pdfEmbed = document.querySelector('embed[type="application/pdf"]') ||
                          document.querySelector('object[type="application/pdf"]');
          if (pdfEmbed) {
            try {
              const pdfObject = pdfEmbed as HTMLObjectElement;
              const pdfDoc = pdfObject.contentDocument || pdfObject.contentWindow?.document;
              if (pdfDoc) {
                const scroll = pdfDoc.documentElement.scrollTop ||
                             pdfDoc.body.scrollTop ||
                             pdfDoc.defaultView?.pageYOffset || 0;
                if (scroll > 0) {
                  debugInfo.scrollMethods.embed = { scroll: scroll };
                  console.log('PDF embed scroll position:', scroll);
                  if (scroll > debugInfo.foundPosition) {
                    debugInfo.foundPosition = scroll;
                  }
                }
              }
            } catch (e) {
              debugInfo.scrollMethods.embed = { error: e.message };
              console.log('PDF embed access error:', e.message);
            }
          }

          // Method 5: Try window scroll as fallback
          const windowScroll = window.pageYOffset ||
                              window.scrollY ||
                              document.documentElement.scrollTop ||
                              document.body.scrollTop || 0;
          debugInfo.scrollMethods.window = { scroll: windowScroll };

          if (windowScroll > debugInfo.foundPosition) {
            debugInfo.foundPosition = windowScroll;
          }
          
          console.log('=== PDF SCROLL DEBUG SUMMARY ===', debugInfo);
          console.log('Final position:', debugInfo.foundPosition);

          return debugInfo.foundPosition;
        }

        // Auto-detect main scrollable element (for SPAs like Claude, ChatGPT, etc.)
        const scrollElement = findMainScrollableElement();

        if (scrollElement) {
          // Use the detected custom scroll element
          const scrollY = scrollElement.scrollTop || 0;
          console.log('Custom scroll element detected, position:', scrollY);
          return scrollY;
        } else {
          // Regular page scroll methods
          const scrollY = window.pageYOffset ||
                         window.scrollY ||
                         document.documentElement.scrollTop ||
                         document.body.scrollTop || 0;
          console.log('Regular page scroll position:', scrollY);
          return scrollY;
        }
      }
    }) as Promise<Array<{ result?: unknown }>>);
    
    const position = typeof result === 'number' ? result : 0;
    console.log('Retrieved scroll position:', position);
    
    // If result is an object (debug info), log it
    if (typeof result === 'object' && result !== null) {
      console.log('Debug info received:', result);
      return (result as { foundPosition?: number }).foundPosition || 0;
    }
    
    return position;
  } catch (e) {
    console.warn('Script injection failed:', e);
    // If it's a restricted page error, return 0 silently
    if ((e as Error).message && (e as Error).message.includes('Cannot access a chrome:// URL')) {
      console.log('Cannot access restricted page, using position 0');
      return 0;
    }
    return 0;
  }
}

/**
 * Scroll to position using script injection
 * 
 * This is the most reliable method for scrolling as it runs directly
 * in the page context and can access all scroll methods. Enhanced for PDF support.
 * 
 * @param {number} tabId - The ID of the tab to scroll
 * @param {number} scrollPosition - The position to scroll to
 * @returns {Promise<void>} Promise that resolves when scroll is complete
 * 
 * @example
 * // Scroll to position 1500px
 * await scrollToPositionViaInjection(123, 1500);
 */
async function scrollToPositionViaInjection(tabId: number, scrollPosition: number): Promise<void> {
  try {
    console.log('Attempting to scroll to position:', scrollPosition);

    await (chrome.scripting.executeScript({
      target: { tabId },
      func: ((pos: number) => {
        console.log('Injected script received position:', pos);

        // PDF detection function
        function detectPDF() {
          const pdfViewer = document.querySelector('embed[type="application/pdf"]') ||
                           document.querySelector('embed[type="application/x-google-chrome-pdf"]') ||
                           document.querySelector('object[type="application/pdf"]') ||
                           document.querySelector('#plugin') ||
                           document.querySelector('iframe[src*="pdf"]');
          const urlIsPDF = window.location.href.includes('.pdf') ||
                           window.location.href.includes('application/pdf');
          const hasPDFJS = window.PDFViewerApplication ||
                           document.querySelector('.pdfViewer') ||
                           document.querySelector('#viewer');
          return !!(pdfViewer || urlIsPDF || hasPDFJS);
        }

        // Find the main scrollable element on the page
        function findMainScrollableElement() {
          // First check if window itself is scrollable and has scroll
          const windowScrollY = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0;
          const windowScrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
          const windowClientHeight = window.innerHeight || document.documentElement.clientHeight || 0;

          // If window has significant scroll position, it's likely the main scroller
          if (windowScrollY > 50 && windowScrollHeight > windowClientHeight) {
            return null; // null indicates use window scroll
          }

          // Find all potentially scrollable elements
          const allElements = document.querySelectorAll('*');
          const scrollableElements = [];

          for (const element of allElements) {
            // Skip if not an element node
            if (element.nodeType !== 1) continue;

            const style = window.getComputedStyle(element);
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;

            // Check if element has scrollable overflow
            if (overflowY === 'auto' || overflowY === 'scroll' || overflowX === 'auto' || overflowX === 'scroll') {
              const scrollHeight = element.scrollHeight;
              const clientHeight = element.clientHeight;
              const scrollTop = element.scrollTop;

              // Only consider elements that have scrollable content
              if (scrollHeight > clientHeight) {
                const scrollableArea = scrollHeight - clientHeight;
                const rect = element.getBoundingClientRect();

                scrollableElements.push({
                  element: element,
                  scrollHeight: scrollHeight,
                  clientHeight: clientHeight,
                  scrollTop: scrollTop,
                  scrollableArea: scrollableArea,
                  width: rect.width,
                  height: rect.height,
                  area: rect.width * rect.height,
                  score: 0
                });
              }
            }
          }

          if (scrollableElements.length === 0) {
            return null; // Use window scroll
          }

          // Score each scrollable element
          for (const item of scrollableElements) {
            let score = 0;

            // Prefer elements with larger scrollable area (max 100 points)
            score += Math.min(100, (item.scrollableArea / 100));

            // Prefer elements currently being scrolled (max 200 points)
            if (item.scrollTop > 0) {
              score += Math.min(200, (item.scrollTop / 10));
            }

            // Prefer larger elements (max 100 points)
            score += Math.min(100, (item.area / 10000));

            // Prefer elements that take up significant viewport (max 50 points)
            const viewportArea = window.innerWidth * window.innerHeight;
            const viewportPercentage = (item.area / viewportArea) * 100;
            score += Math.min(50, viewportPercentage);

            item.score = score;
          }

          // Sort by score (highest first)
          scrollableElements.sort((a, b) => b.score - a.score);

          // Return the highest scoring element if it has a meaningful score
          if (scrollableElements[0].score > 50) {
            return scrollableElements[0].element;
          }

          return null; // Use window scroll
        }

        const isPDF = detectPDF();
        
        if (isPDF) {
          // Method 1: PDF.js viewer (Chrome's built-in PDF viewer)
          if (window.PDFViewerApplication && window.PDFViewerApplication.page !== undefined) {
            const viewer = document.querySelector('.pdfViewer') || document.querySelector('#viewer');
            if (viewer) {
              // Extract page number if using combined position
              const pageNum = Math.floor(pos / 10000) + 1;
              const pageScroll = pos % 10000;
              
              // Navigate to page if needed
              if (window.PDFViewerApplication.page !== pageNum) {
                window.PDFViewerApplication.page = pageNum;
              }
              
              // Scroll within the page after a short delay to ensure page is loaded
              setTimeout(() => {
                viewer.scrollTop = pageScroll;
                console.log('PDF.js scrolled to page:', pageNum, 'position:', pageScroll);
              }, 200);
              return;
            }
          }
          
          // Method 2: Chrome's PDF embed (application/x-google-chrome-pdf)
          // Chrome PDFs scroll the body/window, not the embed itself
          const chromePdfEmbed = document.querySelector('embed[type="application/x-google-chrome-pdf"]');
          if (chromePdfEmbed) {
            // For Chrome PDFs, scroll the window
            console.log('Chrome PDF detected, scrolling window to position:', pos);
            window.scrollTo({
              top: pos,
              behavior: 'smooth'
            });
            return;
          }

          // Method 3: Other PDF embed/object scroll
          const pdfEmbed = document.querySelector('embed[type="application/pdf"]') ||
                          document.querySelector('object[type="application/pdf"]');
          if (pdfEmbed) {
            try {
              const pdfObject = pdfEmbed as HTMLObjectElement;
              const pdfDoc = pdfObject.contentDocument || pdfObject.contentWindow?.document;
              if (pdfDoc) {
                pdfDoc.documentElement.scrollTop = pos;
                console.log('PDF embed scrolled to position:', pos);
                return;
              }
            } catch (e) {
              // Cross-origin access denied
            }
          }

          // Method 4: PDF viewer container
          const viewerContainer = document.querySelector('#viewer') ||
                                 document.querySelector('.pdfViewer') ||
                                 document.querySelector('#plugin');
          if (viewerContainer) {
            viewerContainer.scrollTop = pos;
            console.log('PDF viewer container scrolled to position:', pos);
            return;
          }

          // Method 5: Try to find and scroll PDF elements
          const scrollableElements = document.querySelectorAll('[class*="page"], [id*="page"], [class*="viewer"]');
          for (const elem of scrollableElements) {
            if (elem.scrollHeight > elem.clientHeight) {
              elem.scrollTop = pos;
              console.log('Scrolled PDF element to position:', pos);
              return;
            }
          }
        }

        // Auto-detect main scrollable element (for SPAs like Claude, ChatGPT, etc.)
        const scrollElement = findMainScrollableElement();

        if (scrollElement) {
          // Use the detected custom scroll element
          console.log('Scrolling custom element to position:', pos);
          scrollElement.scrollTo({
            top: pos,
            behavior: 'smooth'
          });
        } else {
          // Regular page scrolling methods
          if (window.scrollTo) {
            window.scrollTo({
              top: pos,
              behavior: 'smooth'
            });
          } else if (document.documentElement.scrollTop !== undefined) {
            document.documentElement.scrollTop = pos;
          } else if (document.body.scrollTop !== undefined) {
            document.body.scrollTop = pos;
          }
        }

        // Verify the scroll worked
        setTimeout(() => {
          const currentPos = scrollElement ?
            scrollElement.scrollTop :
            (window.pageYOffset ||
             window.scrollY ||
             document.documentElement.scrollTop ||
             document.body.scrollTop || 0);
          console.log('Current scroll position after jump:', currentPos);
        }, 500);
      }) as unknown as () => void,
      args: [scrollPosition]
    }) as Promise<Array<{ result?: unknown }>>);
    
    console.log('Scroll command executed successfully');
  } catch (e) {
    console.error('Scroll injection failed:', e);
    // If it's a restricted page error, throw a more specific error
    if ((e as Error).message && (e as Error).message.includes('Cannot access a chrome:// URL')) {
      throw new Error('Cannot scroll on restricted pages like chrome:// URLs');
    }
    throw e;
  }
}

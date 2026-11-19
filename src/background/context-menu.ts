import type { TabMessage } from '../shared/messages';
import { addPhrase } from './reports/reports-store';

const LINKEDIN = ['https://www.linkedin.com/*'];
const MENU_REPORT = 'ailiss-report';
const MENU_PHRASE = 'ailiss-phrase';

export function createContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_REPORT,
      title: 'Ailiss: zgłoś ten post jako slop',
      contexts: ['page', 'link', 'image', 'selection'],
      documentUrlPatterns: LINKEDIN,
    });
    chrome.contextMenus.create({
      id: MENU_PHRASE,
      title: 'Ailiss: dodaj „%s” jako sygnał slopu',
      contexts: ['selection'],
      documentUrlPatterns: LINKEDIN,
    });
  });
}

export function registerContextMenuHandlers(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_PHRASE && info.selectionText) {
      void addPhrase(info.selectionText);
      return;
    }
    if (info.menuItemId === MENU_REPORT && tab?.id !== undefined) {
      const message: TabMessage = { type: 'CONTEXT_REPORT' };
      void chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId ?? 0 }).catch(() => undefined);
    }
  });
}

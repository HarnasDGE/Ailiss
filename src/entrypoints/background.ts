import { defineBackground } from 'wxt/utils/define-background';
import { createContextMenus, registerContextMenuHandlers } from '../background/context-menu';
import { registerRouter } from '../background/router';

export default defineBackground(() => {
  registerRouter();
  registerContextMenuHandlers();
  chrome.runtime.onInstalled.addListener((details) => {
    createContextMenus();
    if (details.reason === 'install') void chrome.runtime.openOptionsPage();
  });
});

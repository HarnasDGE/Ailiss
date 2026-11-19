import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Ailiss — filtr AI slopu na LinkedIn',
    short_name: 'Ailiss',
    description: 'Zwija posty na LinkedIn, które wyglądają na AI slop. Lokalna heurystyka + opcjonalnie OpenRouter.',
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['https://www.linkedin.com/*'],
    optional_host_permissions: ['https://openrouter.ai/*'],
  },
});

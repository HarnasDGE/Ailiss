import '../../ui/base.css';
import './style.css';
import { behaviorSection, type UpdateSettings } from '../../options/sections/behavior';
import { familiesSection } from '../../options/sections/families';
import { openrouterSection } from '../../options/sections/openrouter';
import { authorsSection, dataSection, phrasesSection } from '../../options/sections/phrases-authors';
import { reportsSection } from '../../options/sections/reports';
import type { Settings } from '../../shared/settings';
import {
  getAuthors,
  getPhrases,
  getReports,
  getRuleWeights,
  getSettings,
  onStorageChange,
  saveSettings,
  STORAGE_KEYS,
} from '../../shared/storage';

const root = document.getElementById('sections')!;

/** Sekcja odświeżana przy zmianie swoich kluczy storage (ustawienia renderujemy raz — nie gubimy focusu). */
function slot(): HTMLElement {
  const node = document.createElement('div');
  root.append(node);
  return node;
}

async function main(): Promise<void> {
  let settings: Settings = await getSettings();
  const update: UpdateSettings = (mutate) => {
    const next = structuredClone(settings);
    mutate(next);
    settings = next;
    void saveSettings(next);
  };

  root.append(behaviorSection(settings, update), familiesSection(settings, update), openrouterSection(settings, update));

  const reportsSlot = slot();
  const phrasesSlot = slot();
  const authorsSlot = slot();
  root.append(dataSection());

  const renderReports = async () => reportsSlot.replaceChildren(reportsSection(await getReports(), await getRuleWeights()));
  const renderPhrases = async () => phrasesSlot.replaceChildren(phrasesSection(await getPhrases()));
  const renderAuthors = async () => authorsSlot.replaceChildren(authorsSection(await getAuthors()));

  await Promise.all([renderReports(), renderPhrases(), renderAuthors()]);
  onStorageChange([STORAGE_KEYS.reports, STORAGE_KEYS.ruleWeights], () => void renderReports());
  onStorageChange([STORAGE_KEYS.phrases], () => void renderPhrases());
  onStorageChange([STORAGE_KEYS.authors], () => void renderAuthors());
}

void main();

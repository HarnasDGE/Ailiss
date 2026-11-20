import type { SlopFamily } from './slop/families';

export type Sensitivity = 'gentle' | 'normal' | 'aggressive';
export type HideMode = 'collapse' | 'dim' | 'label';
export type OpenRouterMode = 'llm' | 'decision';
export type OpenRouterScope = 'uncertain' | 'all';

/** Progi zwijania na skali 0–12 (DESIGN §4.4). */
export const THRESHOLDS: Record<Sensitivity, number> = { gentle: 8, normal: 7, aggressive: 5 };
/** Od tego wyniku post jest „podejrzany” i może trafić do LLM. */
export const UNCERTAIN_MIN = 4;
/** Waga LLM przy łączeniu wyników: final = 0.6 * llm + 0.4 * heurystyka. */
export const LLM_WEIGHT = 0.6;

export const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  gentle: 'Łagodny',
  normal: 'Normalny',
  aggressive: 'Agresywny',
};

export const HIDE_MODE_LABELS: Record<HideMode, string> = {
  collapse: 'Zwijaj do paska',
  dim: 'Przyciemniaj',
  label: 'Tylko oznaczaj',
};

export interface OpenRouterSettings {
  enabled: boolean;
  model: string;
  mode: OpenRouterMode;
  scope: OpenRouterScope;
  dailyLimit: number;
  useReportsAsContext: boolean;
}

export interface Settings {
  enabled: boolean;
  sensitivity: Sensitivity;
  hideMode: HideMode;
  hideComments: boolean;
  /** Ukrywaj wszystkie posty promowane (reklamy), niezależnie od oceny slopu. */
  hideSponsored: boolean;
  skipSponsored: boolean;
  skipReposts: boolean;
  disabledFamilies: SlopFamily[];
  openrouter: OpenRouterSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'normal',
  hideMode: 'collapse',
  hideComments: false,
  hideSponsored: true,
  skipSponsored: false,
  skipReposts: false,
  disabledFamilies: [],
  openrouter: {
    enabled: false,
    model: '',
    mode: 'llm',
    scope: 'uncertain',
    dailyLimit: 200,
    useReportsAsContext: true,
  },
};

/** Uzupełnia brakujące pola domyślnymi (np. po aktualizacji rozszerzenia). */
export function withDefaults(stored: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    openrouter: { ...DEFAULT_SETTINGS.openrouter, ...stored?.openrouter },
    disabledFamilies: stored?.disabledFamilies ?? [],
  };
}

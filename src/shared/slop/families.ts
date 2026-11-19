/** 14 rodzin AI slopu z raportu (docs/research/ai-slop-linkedin.md, §4). */
export const SLOP_FAMILIES = [
  'announcement',
  'broetry',
  'antithesis',
  'fake-journey',
  'lessons-list',
  'hot-take',
  'engagement-bait',
  'ai-vocabulary',
  'fake-vulnerability',
  'ai-thought-leadership',
  'corporate-hr',
  'fake-data',
  'emoji-framework',
  'comment-slop',
] as const;

export type SlopFamily = (typeof SLOP_FAMILIES)[number];

export interface FamilyInfo {
  label: string;
  description: string;
}

export const FAMILY_INFO: Record<SlopFamily, FamilyInfo> = {
  announcement: {
    label: 'ogłoszenie „humbled”',
    description: 'Sukces + fałszywa skromność, zero informacji o tym, co zostało zrobione.',
  },
  broetry: {
    label: 'broetry',
    description: 'Jednozdaniowe akapity, banalna scena z życia i nagła lekcja o biznesie.',
  },
  antithesis: {
    label: 'antyteza „nie X, tylko Y”',
    description: 'Konstrukcja „It’s not X, it’s Y” jako substytut myśli.',
  },
  'fake-journey': {
    label: 'fałszywa podróż',
    description: '„3 lata temu byłem…, dziś…” — przed i po bez procesu.',
  },
  'lessons-list': {
    label: 'lista lekcji',
    description: '„5 lekcji…” — punkty-przysłowia bez nazw, liczb i konsekwencji.',
  },
  'hot-take': {
    label: 'unpopular opinion',
    description: 'Zapowiedź kontrowersji, po której pada opinia, z którą wszyscy się zgadzają.',
  },
  'engagement-bait': {
    label: 'engagement bait',
    description: 'Closér pisany pod algorytm: „Agree?”, „Repost”, „Follow me”.',
  },
  'ai-vocabulary': {
    label: 'słownictwo AI',
    description: 'delve, tapestry, leverage, seamless, holistyczne podejście…',
  },
  'fake-vulnerability': {
    label: 'fałszywa szczerość',
    description: 'Wyznanie porażki, która zawsze kończy się sukcesem w tym samym akapicie.',
  },
  'ai-thought-leadership': {
    label: 'AI thought leadership',
    description: '„AI won’t replace you…” — prognoza bez parametrów.',
  },
  'corporate-hr': {
    label: 'korpo-kultura',
    description: '„Our people are our greatest asset” — kultura bez wad, czyli reklama.',
  },
  'fake-data': {
    label: 'mgliste dane',
    description: '„Studies show…” — liczby bez źródła jako dekoracja.',
  },
  'emoji-framework': {
    label: 'emoji-framework',
    description: 'Emoji jako punktory, „framework” bez treści, stos hashtagów.',
  },
  'comment-slop': {
    label: 'komentarz-slop',
    description: 'Komentarz pasujący pod każdy post albo reklama pod cudzym postem.',
  },
};

export function isSlopFamily(value: unknown): value is SlopFamily {
  return typeof value === 'string' && (SLOP_FAMILIES as readonly string[]).includes(value);
}

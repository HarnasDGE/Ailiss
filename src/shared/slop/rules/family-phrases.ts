import { phraseRule, type SignalRule } from './types';

/** Banalna scena z życia na otwarcie (raport §4.2). */
export const LIFE_SCENE_OPENERS: RegExp[] = [
  /^my (?:\d+[- ]year[- ]old|son|daughter|kid|kids|wife|husband|dad|mom|grandma|grandpa)\b/m,
  /^(?:i watched|the barista|my uber driver|a taxi driver|the cashier|yesterday,? my|last night,? my|today at the gym|on my flight)\b/m,
  /^(?:mój|moja|moje) (?:\d+-letni|\d+-letnia|syn|córka|dziecko|dzieci|żona|mąż|tata|mama|babcia|dziadek)\b/m,
  /^(?:wczoraj|dziś) (?:w kolejce|w samolocie|na siłowni|w kawiarni|mój syn|moja córka)\b/m,
];

/**
 * Otwarcia i frazy charakterystyczne dla rodzin (raport §4, §5.1, §5.5).
 * Apostrof zapisany jako ['’], bo LinkedIn często podmienia go na typograficzny.
 */
export const FAMILY_PHRASE_RULES: SignalRule[] = [
  // 4.1 „Humbled to announce”
  phraseRule('opener.humbled', 'announcement', 'opener', 1, [
    /\b(?:i['’]?m|i am|we['’]?re|we are) (?:so |truly |incredibly |very )?(?:humbled|thrilled|beyond excited|excited|honou?red|delighted|proud) (?:and \w+ )?to (?:announce|share)/,
    /\bhumbled and honou?red\b/,
    /\bstill processing\b/,
    /\bpinch me\b/,
    /\bgrateful (?:beyond words|doesn['’]?t cover it)\b/,
    /\bnew chapter\b/,
    /\bthis journey has (?:been|taught)\b/,
    /\bz (?:wielką |ogromną )?(?:pokorą|dumą|radością) (?:informuję|ogłaszam|chcę się podzielić|dzielę się)/,
    /\bnie mogę się doczekać,? (?:aby|żeby|by) podzielić się\b/,
    /\bmam (?:ogromną |wielką )?(?:przyjemność|zaszczyt) (?:ogłosić|poinformować)\b/,
    /\bnowy rozdział\b/,
    /\bwciąż nie mogę (?:w to )?uwierzyć\b/,
  ], { familyWeight: 2 }),
  phraseRule('phrase.gratitude-list', 'announcement', 'opener', 0.75, [
    /\b(?:everyone|every person|all of you) who (?:believed in|supported) me\b/,
    /\bi never imagined (?:this|that) (?:moment|day)\b/,
    /\bto my (?:mentors|team|family),/,
    /\b(?:an )?amazing (?:company|team|people|journey)\b/,
    /\bdziękuję wszystkim,? (?:którzy|co) (?:we mnie wierzyli|mnie wspierali)\b/,
    /\bnigdy nie (?:sądziłem|przypuszczałem|myślałem|wyobrażałem sobie),? że\b/,
    /\bniesamowit\w* (?:firm\w*|zespo\w*|ludzi|podróż\w*)\b/,
  ], { familyWeight: 1.5 }),

  // 4.2 Broetry — scena z życia → lekcja o biznesie
  phraseRule('opener.life-scene', 'broetry', 'opener', 0.75, LIFE_SCENE_OPENERS, { scope: 'head', familyWeight: 1.5 }),
  phraseRule('phrase.realization', 'broetry', 'opener', 1, [
    /\band then it hit me\b/,
    /\bthat['’]?s when i realized\b/,
    /\bi wasn['’]?t expecting (?:this|that)\b/,
    /\bwait\. what\?/,
    /\bi didn['’]?t have an answer\b/,
    /\bsomething about (?:leadership|sales|marketing|business|hiring|management)\b/,
    /\bi['’]?ve never felt more challenged\b/,
    /\bi wtedy (?:to do mnie dotarło|zrozumiałem|zrozumiałam)\b/,
    /\bwtedy (?:zrozumiałem|zrozumiałam|dotarło do mnie)\b/,
    /\bta historia nauczyła mnie\b/,
    /\bnie miałem odpowiedzi\b/,
  ], { familyWeight: 2 }),

  // 4.4 Fałszywa podróż
  phraseRule('opener.years-ago', 'fake-journey', 'opener', 1, [
    /\b(?:\d+|two|three|four|five|ten) (?:years?|months?) ago,? i (?:was|had|got|lived|slept|couldn['’]?t)\b/,
    /\bwhat changed\?/,
    /\bi wish someone (?:had )?told me\b/,
    /\bif i could go back\b/,
    /\b(?:\d+|dwa|trzy|cztery|pięć) (?:lata|lat|miesiące|miesięcy) temu (?:byłem|byłam|miałem|miałam|spałem|spałam|nie miałem)\b/,
    /\bco się zmieniło\?/,
    /\bgdybym mógł cofnąć czas\b/,
  ], { familyWeight: 2 }),
  phraseRule('phrase.today-i-run', 'fake-journey', 'opener', 0.5, [
    /\btoday i (?:run|lead|own|manage)\b/,
    /\b\d+-figure (?:agency|business|company)\b/,
    /\bdziś (?:prowadzę|zarządzam) (?:firmą|agencją|zespołem)\b/,
  ]),

  // 4.5 Lista lekcji
  phraseRule('opener.n-lessons', 'lessons-list', 'opener', 1, [
    /\b(?:\d+|three|five|seven|ten) (?:lessons|things|habits|rules|mistakes|truths|tips|secrets)\b/,
    /\bhere['’]?s what i (?:learned|learnt)\b/,
    /\bwhat \d+% of \w+ get wrong\b/,
    /\b(?:\d+|trzy|pięć|siedem|dziesięć) (?:lekcji|rzeczy|nawyków|zasad|błędów|wskazówek|sekretów)\b/,
    /\boto czego (?:się )?nauczyłem\b/,
  ], { familyWeight: 2 }),

  // 4.6 Unpopular opinion / Hot take
  phraseRule('opener.hot-take', 'hot-take', 'opener', 1.25, [
    /^(?:unpopular opinion|hot take|controversial(?: opinion)?|let me be blunt)\s*[:.]/m,
    /\bnobody (?:talks|is talking) about\b/,
    /\bi['’]?ll say what everyone is thinking\b/,
    /\bthis might get me cancell?ed\b/,
    /\bi see you\.?\s*(?:\p{Extended_Pictographic}|$)/m,
    /^(?:niepopularna opinia|kontrowersyjna opinia|powiem wprost|powiem to głośno)\s*[:.]/m,
    /\bnikt (?:o tym )?nie mówi o\b|\bnikt o tym nie mówi\b/,
  ], { familyWeight: 3 }),

  // 4.9 Fake vulnerability
  phraseRule('opener.vulnerability', 'fake-vulnerability', 'opener', 1.25, [
    /\bi wasn['’]?t going to (?:post|share) this\b/,
    /\bi almost didn['’]?t (?:share|post)\b/,
    /\bvulnerability post\b/,
    /\bit was the best thing that (?:ever )?happened\b/,
    /\blet['’]?s normali[sz]e\b/,
    /^real talk\s*:/m,
    /\bi failed publicly\b/,
    /\bnie (?:miałem|miałam) (?:zamiaru|w planach) (?:tego )?(?:publikować|pisać)\b/,
    /\bdługo zastanawiałem się,? czy (?:to )?opublikować\b/,
    /\bznormalizujmy\b/,
    /\bnajlepsze,? co mi się (?:kiedykolwiek )?przydarzyło\b/,
  ], { familyWeight: 3 }),

  // 4.10 AI thought leadership
  phraseRule('opener.ai-future', 'ai-thought-leadership', 'opener', 1.25, [
    /\bai won['’]?t replace you\b/,
    /\b(?:someone|a person|people) using ai will\b/,
    /\bthe companies that (?:will )?win\b/,
    /\bthe future of work\b/,
    /\bwe['’]?re entering a new era\b/,
    /\bthis changes everything\b/,
    /\bparadigm shift\b/,
    /\bthe future belongs to\b/,
    /\b10x\b/,
    /\bai (?:cię|was) nie zastąpi\b/,
    /\bprzyszłość (?:pracy|należy do)\b/,
    /\bwchodzimy w nową erę\b/,
    /\bto zmienia wszystko\b/,
  ], { familyWeight: 3 }),

  // 4.11 Korpo-kultura
  phraseRule('opener.corporate-culture', 'corporate-hr', 'opener', 1.25, [
    /\bour (?:people|employees|team) (?:are|is) our (?:greatest|biggest|most important|most valuable) asset\b/,
    /\bmore than a company\b|\bwe['’]?re a family\b/,
    /\bpeople[- ]first\b/,
    /\bculture of (?:excellence|curiosity|innovation|ownership|belonging|trust)\b/,
    /\bempowering our (?:teams|people)\b/,
    /\bthat['’]?s the \[?[\w ]+\]? difference\b/,
    /\bwe don['’]?t just hire\b/,
    /\bnasi ludzie (?:to|są) naszym (?:największym|najcenniejszym) (?:atutem|kapitałem|skarbem)\b/,
    /\bjesteśmy (?:jak )?rodziną\b/,
    /\bkultur[aęy] (?:doskonałości|innowacji|otwartości|zaufania)\b/,
  ], { familyWeight: 3 }),

  // 4.12 Fałszywe dane i mgliste atrybucje
  phraseRule('phrase.vague-source', 'fake-data', 'opener', 1.25, [
    /\b(?:studies|research|data|experts|industry reports?) (?:show|shows|suggest|suggests|agree|indicate|indicates|proves?)\b/,
    /\baccording to a (?:recent )?(?:study|report|survey)\b/,
    /\bthe data is clear\b/,
    /\bbadania (?:pokazują|wskazują|dowodzą)\b/,
    /\beksperci (?:są zgodni|twierdzą)\b/,
    /\bwedług (?:najnowszych |ostatnich )?badań\b/,
    /\bdane nie kłamią\b/,
  ], { familyWeight: 3 }),
  phraseRule('phrase.false-precision', 'fake-data', 'opener', 0.75, [
    /\bi['’]?ve (?:reviewed|sent|interviewed|read|hired|coached|analy[sz]ed) [\d,]{3,}\b/,
    /\b(?:przejrzałem|wysłałem|przeanalizowałem) [\d\s]{3,}\b/,
  ]),

  // 4.13 Emoji-framework
  phraseRule('opener.framework', 'emoji-framework', 'opener', 1, [
    /\bthe \d+-step (?:framework|system|process|formula|method)\b/,
    /\bframework that changed my life\b/,
    /\b\d+-(?:krokowy|etapowy) (?:framework|system|proces)\b/,
  ], { familyWeight: 2 }),
];

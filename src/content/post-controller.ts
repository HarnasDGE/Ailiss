import { send } from '../shared/messages';
import type { HideMode } from '../shared/settings';
import { judgeComment } from '../shared/slop/comment';
import { FAMILY_INFO } from '../shared/slop/families';
import { scorePost } from '../shared/slop/score';
import { textHash } from '../shared/slop/similarity';
import { testItemShort } from '../shared/slop/test-items';
import type { LlmVerdict, ReportLabel, ScoreResult } from '../shared/types';
import type { ContentState } from './content-store';
import { decide, type Decision } from './decide';
import { extractComment } from './linkedin/extract-comment';
import { extractPost, type ExtractedPost } from './linkedin/extract-post';
import { CollapseBar, type BarInfo, type BarState } from './ui/collapse-bar';
import type { PeekContent } from './ui/peek-popover';
import { ReportButton, type ReportForm } from './ui/report-button';

/** Posty krótsze niż tyle znaków (zdjęcie, wideo, „Congrats!”) pomijamy. */
const MIN_TEXT_LENGTH = 40;

function stateFor(hide: boolean, mode: HideMode, expanded: boolean, forceCollapsed: boolean): BarState {
  if (!hide) return 'none';
  if (expanded) return 'expanded';
  if (forceCollapsed) return 'collapsed';
  return mode === 'collapse' ? 'collapsed' : mode === 'dim' ? 'dimmed' : 'labeled';
}

function preview(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim());
  const joined = lines.slice(0, 3).join('\n');
  return joined.length > 280 ? `${joined.slice(0, 280)}…` : joined;
}

/** Ignoruje błąd „Extension context invalidated” po przeładowaniu rozszerzenia. */
function quiet<T>(promise: Promise<T>): Promise<T | undefined> {
  return promise.catch(() => undefined);
}

/** Cykl życia jednego posta: ekstrakcja → heurystyka → decyzja → (LLM) → UI. */
export class PostController {
  private post?: ExtractedPost;
  private hash = '';
  private heuristic?: ScoreResult;
  private llm: LlmVerdict | null = null;
  private llmAsked = false;
  private expanded = false;
  private forceCollapsed = false;
  private counted = false;
  private localReport?: { id?: string; label: ReportLabel };
  private decision?: Decision;
  private readonly bar: CollapseBar;
  private readonly flag: ReportButton;

  constructor(
    readonly el: HTMLElement,
    private readonly getState: () => ContentState,
  ) {
    this.bar = new CollapseBar(el, {
      onShow: () => this.setExpanded(true),
      onCollapse: () => {
        this.forceCollapsed = true;
        this.setExpanded(false);
      },
      onNotSlop: () => void this.report('human'),
      onUndoReport: () => void this.undoReport(),
      onAlwaysHideAuthor: () => void this.setAuthorRule('alwaysHide'),
      onAlwaysShowAuthor: () => void this.setAuthorRule('alwaysShow'),
    });
    this.flag = new ReportButton(el, {
      suggestFamily: () => this.heuristic?.family ?? 'broetry',
      hasAuthor: () => Boolean(this.post?.authorId),
      onSubmit: (form) => void this.report('slop', form),
    });
  }

  evaluate(): void {
    const state = this.getState();
    if (!state.settings.enabled) return this.clearUi();

    const post = extractPost(this.el);
    if (post.text.length < MIN_TEXT_LENGTH) return this.clearUi();
    const hash = textHash(post.text);
    if (hash !== this.hash) {
      this.hash = hash;
      this.llm = null;
      this.llmAsked = false;
      this.localReport = undefined;
    }
    this.post = post;
    this.heuristic = scorePost(post.text, { context: state.context, authorId: post.authorId });

    const stored = state.reportsByHash.get(hash);
    const reported = this.localReport ?? stored;
    this.decision = decide({
      heuristic: this.heuristic,
      llm: this.llm,
      llmAsked: this.llmAsked,
      settings: state.settings,
      authorId: post.authorId,
      authors: state.authors,
      reported: reported?.label,
      isSponsored: post.isSponsored,
      isRepost: post.isRepost,
    });

    if (this.decision.askLlm) void this.askLlm(post.text, this.heuristic);
    if (this.decision.hide && !this.counted) {
      this.counted = true;
      void quiet(send('COUNT_HIDDEN', { family: this.decision.family }));
    }
    if (!this.decision.hide) this.forceCollapsed = false;
    this.render(state.settings.hideMode);
  }

  destroy(): void {
    this.clearUi();
  }

  /** Zgłoszenie z menu kontekstowego — bez formularza, rodzina z heurystyki. */
  reportFromContextMenu(): void {
    if (!this.heuristic) return;
    void this.report('slop', { family: this.heuristic.family, note: '', boostAuthor: false });
  }

  private clearUi(): void {
    this.bar.destroy();
    this.flag.destroy();
  }

  private render(mode: HideMode): void {
    const d = this.decision;
    const h = this.heuristic;
    if (!d || !h || !this.post) return;
    const state = stateFor(d.hide, mode, this.expanded, this.forceCollapsed);
    this.bar.render(state, this.barInfo(d, h));
    if (state === 'none') this.flag.mount();
    else this.flag.destroy();
  }

  private barInfo(d: Decision, h: ScoreResult): BarInfo {
    return {
      author: this.post?.authorName ?? '',
      familyLabel: FAMILY_INFO[d.family].label,
      score: d.score,
      source: d.source,
      peek: this.peek(d, h),
    };
  }

  private peek(d: Decision, h: ScoreResult): PeekContent {
    const reasons = [FAMILY_INFO[d.family].label, ...h.testItems.map(testItemShort)];
    if (h.matchedReport?.label === 'slop') reasons.push('podobny do zgłoszonego');
    if (h.signals.some((s) => s.id.startsWith('user.phrase:'))) reasons.push('Twoja fraza');
    if (h.signals.some((s) => s.id === 'user.author')) reasons.push('autor z Twojej listy');
    const engine = d.source === 'openrouter' ? `heurystyka ${h.score}/12 + LLM ${this.llm?.score ?? '?'}/12` : `heurystyka ${h.score}/12`;
    return { preview: preview(this.post?.text ?? ''), reasons: [...new Set(reasons)], llmReason: this.llm?.reason, footer: `Wynik ${d.score}/12 · ${engine}` };
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.render(this.getState().settings.hideMode);
  }

  private async askLlm(text: string, heuristic: ScoreResult): Promise<void> {
    this.llmAsked = true;
    const hash = this.hash;
    const response = await quiet(
      send('CLASSIFY', { post: { key: hash, text, heuristic: { score: heuristic.score, family: heuristic.family } } }),
    );
    if (hash !== this.hash || !response?.verdict) return;
    this.llm = response.verdict;
    this.evaluate();
  }

  private async report(label: ReportLabel, form?: ReportForm): Promise<void> {
    if (!this.post || !this.heuristic) return;
    this.localReport = { label };
    this.expanded = false;
    this.forceCollapsed = false;
    this.evaluate();
    const response = await quiet(
      send('REPORT_POST', {
        report: {
          text: this.post.text,
          postUrn: this.post.urn,
          label,
          family: label === 'slop' ? (form?.family ?? this.heuristic.family) : undefined,
          note: form?.note,
          authorId: this.post.authorId,
          boostAuthor: form?.boostAuthor,
          heuristic: {
            score: this.heuristic.score,
            signals: this.heuristic.signals.filter((s) => s.contribution > 0).map((s) => s.id),
          },
        },
      }),
    );
    if (response) this.localReport = { id: response.report.id, label };
  }

  private async undoReport(): Promise<void> {
    const id = this.localReport?.id ?? this.getState().reportsByHash.get(this.hash)?.id;
    this.localReport = undefined;
    this.counted = true;
    if (id) await quiet(send('DELETE_REPORT', { id }));
    this.evaluate();
  }

  private async setAuthorRule(rule: 'alwaysHide' | 'alwaysShow'): Promise<void> {
    if (!this.post?.authorId) return;
    this.expanded = false;
    await quiet(send('SET_AUTHOR_RULE', { authorId: this.post.authorId, rule }));
  }
}

/** Komentarz: tylko heurystyka komentarzy, bez LLM i bez zgłaszania. */
export class CommentController {
  private expanded = false;
  private readonly bar: CollapseBar;

  constructor(
    readonly el: HTMLElement,
    private readonly getState: () => ContentState,
  ) {
    this.bar = new CollapseBar(el, {
      onShow: () => this.setExpanded(true),
      onCollapse: () => this.setExpanded(false),
      onNotSlop: () => this.setExpanded(true),
      onUndoReport: () => undefined,
      onAlwaysHideAuthor: () => undefined,
      onAlwaysShowAuthor: () => undefined,
    });
  }

  evaluate(): void {
    const { settings } = this.getState();
    if (!settings.enabled || !settings.hideComments) return this.bar.destroy();
    const comment = extractComment(this.el);
    const verdict = judgeComment(comment.text, comment.postText);
    if (!verdict.isSlop) return this.bar.destroy();
    const reason = verdict.reason === 'promo' ? 'reklama' : verdict.reason === 'emoji-only' ? 'same emoji' : 'generyczny';
    this.bar.render(this.expanded ? 'expanded' : 'collapsed', {
      author: comment.authorName,
      familyLabel: reason,
      score: 0,
      source: 'heuristic',
      isComment: true,
      peek: { preview: preview(comment.text), reasons: [FAMILY_INFO['comment-slop'].label, reason] },
    });
  }

  destroy(): void {
    this.bar.destroy();
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.evaluate();
  }
}

import type { HitKind } from './HitDetector';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface ResultText {
  title: string;
  sub: string;
  tone: 'good' | 'near' | 'bad';
}

const RESULT_TEXT: Record<HitKind, ResultText> = {
  success: { title: '入った！', sub: 'SUCCESS', tone: 'good' },
  near: { title: '惜しい！', sub: '白目に命中', tone: 'near' },
  blink: { title: 'まばたき！', sub: 'まぶたに弾かれた', tone: 'near' },
  face: { title: '顔。', sub: 'FACE HIT', tone: 'bad' },
  head: { title: '頭。', sub: 'MISS', tone: 'bad' },
  body: { title: '服。', sub: 'MISS', tone: 'bad' },
  ground: { title: '地面。', sub: 'MISS', tone: 'bad' },
};

/** HTML オーバーレイ UI の管理 */
export class UI {
  readonly dropButton = $<HTMLButtonElement>('drop-btn');
  readonly retryButton = $<HTMLButtonElement>('retry-btn');
  readonly startButton = $<HTMLButtonElement>('start-btn');
  readonly toTitleButton = $<HTMLButtonElement>('to-title-btn');
  readonly soundButton = $<HTMLButtonElement>('sound-btn');
  readonly dragArea = $<HTMLDivElement>('drag-area');
  onSelectLevel: (index: number) => void = () => {};

  private hud = $('hud');
  private windArrow = $('wind-arrow');
  private windSpeed = $('wind-speed');
  private windDesc = $('wind-desc');
  private windSame = $('wind-same');
  private hint = $('hint');
  private result = $('result');
  private resultTitle = $('result-title');
  private resultSub = $('result-sub');
  private resultDetail = $('result-detail');
  private flash = $('flash');
  private debugPanel = $('debug-panel');
  private stats = $('stats');
  private levels = $('levels');
  private title = $('title-screen');
  private allClear = $('allclear');
  private allClearTimer = 0;
  private levelButtons: HTMLButtonElement[] = [];
  private retryTimer = 0;

  setLevel(text: string) {
    $('level').textContent = text;
  }

  /** レベル選択ボタンを作る（クリア済みのレベルだけ押せる） */
  buildLevelButtons(names: string[]) {
    this.levels.replaceChildren();
    this.levelButtons = names.map((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.name = name;
      b.addEventListener('click', () => this.onSelectLevel(i));
      this.levels.appendChild(b);
      return b;
    });
  }

  setLevelButtons(current: number, unlocked: number) {
    this.levelButtons.forEach((b, i) => {
      const locked = i > unlocked;
      b.textContent = locked ? `🔒 ${b.dataset.name}` : b.dataset.name!;
      b.disabled = locked;
      b.classList.toggle('current', i === current);
    });
  }

  /**
   * @param screenAngle 画面上での風向き (rad, 0 = 右, 反時計回り)
   */
  setWind(speed: number, screenAngle: number, desc: string, same: boolean) {
    this.windArrow.style.transform = `rotate(${-screenAngle}rad)`;
    this.windSame.classList.toggle('show', same);
    this.windSpeed.textContent = `${speed.toFixed(1)} m/s`;
    this.windDesc.textContent = desc;
    // 強さに応じて色を変える
    const hue = Math.max(0, 200 - speed * 45);
    this.windArrow.style.color = `hsl(${hue} 85% 55%)`;
  }

  /** オールクリア演出 */
  showAllClear(totalDrops: number, buttonDelayMs: number) {
    this.result.classList.remove('show');
    $('ac-stats').textContent = `${totalDrops} 滴で達成`;
    this.allClear.classList.add('show');
    this.flash.classList.remove('go', 'gold');
    void this.flash.offsetWidth;
    this.flash.classList.add('go', 'gold');
    const game = $('game');
    game.classList.remove('shake');
    void game.offsetWidth;
    game.classList.add('shake');
    this.toTitleButton.classList.remove('show');
    clearTimeout(this.allClearTimer);
    this.allClearTimer = window.setTimeout(() => this.toTitleButton.classList.add('show'), buttonDelayMs);
  }

  get toTitleReady() {
    return this.toTitleButton.classList.contains('show');
  }

  hideAllClear() {
    clearTimeout(this.allClearTimer);
    this.allClear.classList.remove('show');
    this.toTitleButton.classList.remove('show');
    $('game').classList.remove('shake');
  }

  /** タイトル画面：ゲーム中の UI はすべて隠す */
  showTitle() {
    this.title.classList.add('show');
    this.result.classList.remove('show', 'good', 'near', 'bad');
    this.retryButton.classList.remove('show');
    clearTimeout(this.retryTimer);
    for (const el of [this.hud, this.levels, this.hint, this.dropButton, this.stats]) el.classList.add('hidden');
  }

  hideTitle() {
    this.title.classList.remove('show');
    this.stats.classList.remove('hidden');
  }

  showAim() {
    this.hud.classList.remove('hidden');
    this.levels.classList.remove('hidden');
    this.hint.classList.remove('hidden');
    this.dropButton.classList.remove('hidden');
    this.dropButton.disabled = false;
    this.result.classList.remove('show', 'good', 'near', 'bad');
    this.retryButton.classList.remove('show');
    clearTimeout(this.retryTimer);
  }

  showDropping() {
    this.hint.classList.add('hidden');
    this.levels.classList.add('hidden');
    this.dropButton.disabled = true;
    this.dropButton.classList.add('hidden');
    this.hud.classList.add('hidden');
  }

  showResult(kind: HitKind, detail: string, retryDelayMs: number, sub?: string, retryLabel = 'もう一滴') {
    const t = RESULT_TEXT[kind];
    this.resultTitle.textContent = t.title;
    this.resultSub.textContent = sub ?? t.sub;
    this.retryButton.textContent = retryLabel;
    this.resultDetail.textContent = detail;
    this.result.classList.remove('good', 'near', 'bad');
    this.result.classList.add('show', t.tone);
    if (kind === 'success') {
      this.flash.classList.remove('go');
      void this.flash.offsetWidth;
      this.flash.classList.add('go');
    }
    // retryDelayMs < 0 のときはボタンを出さない（オールクリア演出へ続く場合）
    if (retryDelayMs >= 0) {
      this.retryTimer = window.setTimeout(() => this.retryButton.classList.add('show'), retryDelayMs);
    }
  }

  hideHint() {
    this.hint.classList.add('hidden');
  }

  setStats(success: number, tries: number) {
    this.stats.textContent = tries > 0 ? `${success} / ${tries} 滴` : '';
  }

  setMuted(m: boolean) {
    this.soundButton.textContent = m ? '🔇' : '🔊';
    this.soundButton.setAttribute('aria-label', m ? '音を出す' : 'ミュート');
    this.soundButton.classList.toggle('off', m);
  }

  setDebugVisible(v: boolean) {
    this.debugPanel.classList.toggle('show', v);
  }

  setDebugText(text: string) {
    this.debugPanel.textContent = text;
  }
}

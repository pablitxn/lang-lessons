# Theme and visual tokens

Generated 2026-10-24 from the local working tree on `codex/exercise-feedback`, base `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. This discovery snapshot includes in-progress changes. It is design context, not a release or runtime receipt. No secrets, local account configuration, model generation, or external assets were inspected.

## Compact token summary

| Token | Light | Dark |
| --- | --- | --- |
| `--ink` | `#203b32` | `#e7eee6` |
| `--muted` | `#5c6d65` | `#aab9ae` |
| `--line` | `#d9dfd5` | `#3c4d43` |
| `--paper` | `#fffefa` | `#202d26` |
| `--background` | `#f5f4ef` | `#15221b` |
| `--surface` | `#eef1e8` | `#2a392f` |
| `--accent` | `#dce9c0` | `#43553a` |
| `--primary` | `#08675f` | `#a7d9bd` |
| `--primary-ink` | `#fff` | `#102e21` |
| `--success` | `#17643c` | `#9ed5b1` |
| `--error` | `#b42318` | `#ffa59b` |

- Body: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; no external fonts.
- Editorial accent: Georgia, serif for h1, lemma and existing examples. Prefer a restrained serif lemma; keep explanations in body type.
- Current type sizes: h1 clamp(2rem, 4vw, 2.8rem), h2 1.625rem, h3 1.0625rem; supporting labels .6875-.875rem; ordinary body 1rem and line-height around 1.5-1.65.
- Space is not a named token scale. Common steps: 6, 8, 10, 12, 16, 20, 24, 28, 32, 40 and 48px.
- Radius: controls 8-12px, lesson panels 18px, cards/dialogs 20px, profile/phone 50%.
- Border: 1px solid var(--line); focus: 3px solid var(--primary), offset 4px. Interactive controls are generally at least 44px high.
- Surfaces: paper card over background, surface for quiet inset content, primary for emphasis. Semantic success/error colors are separate.
- Shadows are subdued: e.g. 0 1px 2px rgb(10 25 18 / .035) for selects, 0 -4px 20px rgb(10 25 18 / .035) on fixed home tools.
- Responsive rules: 760px collapses catalog and reduces shell spacing; 359px extra narrow padding, 480px compact header, 540px preferences adaptation. Mobile viewport checks cover 320 and 390px; landscape 844x390.
- Shell maximum width 1160px; desktop horizontal padding 48px. A lesson consumes 100dvh with a scrolling .lesson-panel and overscroll containment. Do not add fixed card content that hides input or forces horizontal overflow.
- Theme selection uses :root[data-theme="dark"] or light; App's effect follows system preference when requested. The full provider/effect source is in layouts.md.
- Reduced motion disables transitions and smooth scrolling. Scope additions to the verb feature stylesheet rather than global tokens.

## Raw style sources

## `src/app/global.css`

Full application tokens, shell and responsive styling.

SHA-256: `8a36c775246d3a971424f41b7a71e4621229248d54115b171daa700e27c2efc1`

```css
:root { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-synthesis: none; text-rendering: optimizeLegibility; color-scheme: light; --ink: #203b32; --muted: #5c6d65; --line: #d9dfd5; --paper: #fffefa; --background: #f5f4ef; --surface: #eef1e8; --accent: #dce9c0; --primary: #08675f; --primary-ink: #fff; --success: #17643c; --error: #b42318; color: var(--ink); background: var(--background); }
:root[data-theme="dark"] { color-scheme: dark; --ink: #e7eee6; --muted: #aab9ae; --line: #3c4d43; --paper: #202d26; --background: #15221b; --surface: #2a392f; --accent: #43553a; --primary: #a7d9bd; --primary-ink: #102e21; --success: #9ed5b1; --error: #ffa59b; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 280px; }
button, input, select, textarea { font: inherit; }
button, a, select, input[type="checkbox"] { -webkit-tap-highlight-color: transparent; }
button, select { min-height: 44px; }
button { cursor: pointer; }
a { color: inherit; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--primary); outline-offset: 4px; }
button:disabled { cursor: not-allowed; opacity: .6; }
.app-shell { max-width: 1160px; margin: auto; padding: 0 48px 40px; }
.app-header { display: flex; justify-content: space-between; align-items: center; min-height: 100px; gap: 16px; border-bottom: 1px solid var(--line); }
.brand { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; font-weight: 650; letter-spacing: -.03em; }
.brand-mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: var(--ink); color: var(--paper); font-size: 26px; }
.quiet-button { border: 1px solid var(--line); background: transparent; color: var(--ink); padding: 8px 14px; border-radius: 10px; }
.quiet-button:hover { background: var(--surface); }
.app-header-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.header-voice-status { display: flex; align-items: center; }
.header-voice-status:empty { display: none; }
.profile-avatar { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: .8125rem; font-weight: 650; letter-spacing: .02em; }
.profile-avatar:hover { border-color: var(--primary); }
.profile-avatar { flex: 0 0 44px; padding: 0; overflow: hidden; }
.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.voice-status-badge { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); color: var(--muted); }
.voice-status-badge svg { width: 19px; height: 19px; }
.voice-status-badge { padding: 0; flex: 0 0 44px; }
.voice-status-active { color: var(--error); border-color: var(--error); }
.voice-call-notice { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin: 0 0 16px; }
.voice-call-notice .voice-call-error { flex: 1 1 220px; width: auto; }
.voice-call-notice .quiet-button { font-size: .8125rem; }
.voice-status-error { color: var(--error); border-color: color-mix(in srgb, var(--error) 25%, transparent); background: color-mix(in srgb, var(--error) 9%, var(--background)); }
.voice-status-error:hover { background: color-mix(in srgb, var(--error) 16%, var(--background)); }
.voice-details-dialog { color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 18px; padding: 24px; width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; }
.voice-details-dialog::backdrop { background: rgb(10 25 18 / .5); backdrop-filter: blur(3px); }
.voice-details-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.voice-details-heading h2 { margin: 0; font-size: 1.125rem; }
.voice-details-heading button { flex: 0 0 44px; font-size: 1.5rem; padding: 0; }
.voice-details-dialog .voice-call-actions { margin-top: 24px; }
main { outline: none; }
.eyebrow { font-size: .6875rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--muted); }
h1 { font-family: Georgia, serif; font-weight: 400; font-size: clamp(2rem, 4vw, 2.8rem); letter-spacing: -.045em; margin: 16px 0; line-height: 1.15; }
h2 { font-size: 1.625rem; font-weight: 550; letter-spacing: -.04em; line-height: 1.2; }
h3 { font-size: 1.0625rem; letter-spacing: -.025em; margin: 0 0 12px; }
.catalog-heading { margin: 48px 0 30px; }
.catalog-heading p { margin: 0; color: var(--muted); font-size: 1rem; line-height: 1.6; }
.lesson-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.lesson-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 20px; background: var(--paper); text-decoration: none; transition: border-color .15s ease, transform .15s ease; }
.lesson-card:hover { border-color: var(--primary); transform: translateY(-3px); }
.lesson-card-art { display: grid; place-items: center; height: 210px; margin: 10px; border-radius: 13px; overflow: hidden; }
.lesson-card-verb-image .lesson-card-art { background: #eeeade; }
.lesson-card-verb-visible .lesson-card-art { background: #e0e9d7; }
.lesson-card-sentence .lesson-card-art { background: #e7e5ee; }
.verb-card-forms { display: flex; flex-direction: column; align-items: center; gap: 3px; font-family: Georgia, serif; font-size: 2.1rem; line-height: 1.3; color: #304938; }
.verb-card-forms span:nth-child(2) { font-style: italic; color: #637957; }
.verb-card-forms span:last-child { color: #82906a; }
.picture-card-words { color: #63513d; }
.picture-card-words span:nth-child(2) { color: #92735a; }
.picture-card-words span:last-child { color: #b19572; }
.sentence-card-words { display: grid; gap: 10px; color: #494259; font-family: Georgia, serif; font-size: 1.9rem; }
.sentence-card-words span { padding: 8px 22px; background: #f9f7fc; border-radius: 18px 18px 18px 3px; }
.sentence-card-words span:last-child { margin-left: 32px; background: #d4cde3; border-radius: 18px 18px 3px 18px; }
.lesson-card-copy { display: flex; flex: 1; flex-direction: column; padding: 18px 24px 22px; }
.lesson-card-copy h2 { margin: 10px 0; }
.lesson-card-copy p { font-size: .875rem; color: var(--muted); line-height: 1.65; margin: 0 0 24px; }
.lesson-card-start { display: flex; justify-content: space-between; align-items: center; margin-top: auto; border-top: 1px solid var(--line); padding-top: 18px; font-size: .875rem; font-weight: 600; }
.lesson-card-start > span { font-size: 1.25rem; }
.lesson-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 44px; margin: 12px 0; }
.lesson-heading h1 { margin: 0; font-family: inherit; font-size: .875rem; font-weight: 500; letter-spacing: 0; line-height: 1.5; }
.lesson-heading-divider { color: var(--muted); opacity: .55; font-size: .875rem; }
.back-link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; color: var(--muted); text-decoration: none; font-size: .875rem; }
.back-link svg { width: 16px; height: 16px; flex: 0 0 auto; }
.back-link:hover { color: var(--ink); }
.panel { background: var(--paper); border: 1px solid var(--line); border-radius: 18px; padding: 28px; }
.lesson-panel { min-width: 0; }
.app-shell[data-lesson] { display: flex; flex-direction: column; height: 100dvh; min-height: 320px; padding-bottom: max(20px, env(safe-area-inset-bottom)); }
.app-shell[data-lesson] > .app-header, .app-shell[data-lesson] .lesson-heading { flex-shrink: 0; }
.app-shell[data-lesson] > main { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.app-shell[data-lesson] .lesson-workspace { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.app-shell[data-lesson] .lesson-panel { position: relative; flex: 1; min-height: 0; container-type: size; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; scroll-padding-block: 24px; }
.app-shell[data-lesson] .verbs-picture-frame { display: grid; place-items: center; min-width: min(160px, 100%); min-height: 160px; }
.app-shell[data-lesson] .lesson-panel img.verbs-picture { max-height: min(300px, max(96px, 40cqh)); object-fit: contain; }
.app-shell[data-lesson] .lesson-panel:focus { outline: none; }
.app-shell[data-lesson] .lesson-panel:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.app-shell[data-lesson] .lesson-panel :is(input, button, summary) { scroll-margin-block: 24px; }
.app-shell:has(.ll-dock) { padding-bottom: calc(7rem + env(safe-area-inset-bottom)); }
.lesson-panel .ll-mobile { padding-bottom: 0; }
.voice-call-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px 20px; padding: 16px 20px; margin-bottom: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.voice-call-status { margin: 0; font-size: .875rem; line-height: 1.5; }
.voice-call-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.voice-call-bar .ll-button { min-height: 44px; }
.voice-call-error { color: var(--muted); font-size: .875rem; line-height: 1.5; width: 100%; margin: 0; }
.preferences-dialog { color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 20px; padding: 0; width: min(900px, calc(100vw - 40px)); height: min(640px, calc(100dvh - 40px)); max-height: calc(100dvh - 40px); overflow: hidden; }
.preferences-dialog[open] { display: grid; grid-template-rows: auto minmax(0, 1fr); }
.preferences-dialog::backdrop { background: rgb(10 25 18 / .5); backdrop-filter: blur(3px); }
.preferences-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 24px; background: var(--paper); border-bottom: 1px solid var(--line); }
.preferences-close, .p3-preferences-close { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; color: var(--muted); background: transparent; }
.preferences-close:hover, .p3-preferences-close:hover { background: var(--surface); color: var(--ink); }
.preferences-close svg { width: 20px; height: 20px; }
.preferences-heading h2 { margin: 0; font-size: 1.25rem; letter-spacing: -.025em; }
.preferences-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); min-height: 0; }
.preferences-sidebar { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-right: 1px solid var(--line); }
.preferences-nav { display: flex; flex-direction: column; gap: 6px; padding: 20px 12px; overflow-y: auto; }
.preferences-sidebar button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--muted); text-align: left; font-size: .875rem; overflow-wrap: anywhere; }
.preferences-sidebar svg { width: 20px; height: 20px; flex: 0 0 auto; }
.preferences-sidebar button:hover { color: var(--ink); background: var(--paper); }
.preferences-sidebar-footer { margin-top: auto; padding: 12px; border-top: 1px solid var(--line); }
.preferences-sidebar-footer button[aria-current="page"] { background: var(--paper); color: var(--ink); border-color: var(--line); }
.learning-credits p { color: var(--muted); font-size: .875rem; line-height: 1.65; }
.learning-credit-entries { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 0; list-style: none; font-size: .875rem; }
.learning-credit-entries a { display: inline-flex; align-items: center; min-height: 44px; }
.learning-credits-download { display: inline-block; margin-top: 16px; font-size: .875rem; line-height: 1.6; }
.preferences-nav button[aria-current="page"] { color: var(--ink); background: var(--paper); border-color: var(--line); font-weight: 600; }
.preferences-content { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 30px; }
.preferences-section { flex: 1 0 auto; min-width: 0; }
.preferences-section h3 { font-size: 1.4rem; margin-bottom: 10px; }
.preferences-section h4 { margin: 20px 0 8px; font-size: .875rem; font-weight: 600; }
.preferences-section > .muted:first-of-type { margin: 0 0 28px; }
.preferences-section .setting-row, .setting-card { padding: 16px; border: 1px solid var(--line); border-radius: 12px; }
.setting-card h4 { margin-top: 0; }
.preferences-notice { margin: 26px 0 0; }
.setting-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.setting-row select { max-width: 220px; }
.check-label { display: flex; gap: 12px; align-items: center; margin: 20px 0 0; line-height: 1.5; font-size: .875rem; }
.check-label input { width: 20px; height: 20px; accent-color: var(--primary); flex: 0 0 auto; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.label-title { display: block; font-size: .8125rem; margin-bottom: 8px; }
select { appearance: none; width: 100%; min-width: 0; padding: 11px 38px 11px 14px; border: 1px solid var(--line); border-radius: 11px; background-color: var(--paper); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235c6d65' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 13px center; color: var(--ink); font-size: .875rem; line-height: 1.4; box-shadow: 0 1px 2px rgb(10 25 18 / .035); cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
select:hover:not(:disabled) { border-color: var(--muted); }
select:focus-visible { border-color: var(--primary); outline-offset: 2px; }
select:disabled { cursor: not-allowed; opacity: .6; }
:root[data-theme="dark"] select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23aab9ae' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E"); }
.muted { color: var(--muted); line-height: 1.6; font-size: .8125rem; }
.preferences-notice:empty { display: none; }
.profile-settings { display: grid; gap: 24px; margin-top: 28px; }
.profile-settings label { display: grid; gap: 8px; font-size: .875rem; }
.profile-settings input:not([type="file"]) { min-width: 0; width: 100%; border: 1px solid var(--line); border-radius: 10px; background: var(--background); color: var(--ink); padding: 12px; }
.profile-settings input[type="file"] { max-width: 100%; font-size: .8125rem; }
.profile-photo-preview { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; display: grid; place-items: center; background: var(--surface); overflow: hidden; font-size: 1.4rem; }
.profile-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
.profile-photo-field { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.profile-photo-controls { flex: 1 1 180px; min-width: 0; }
.profile-photo-preview { flex: 0 0 80px; }
.profile-photo-hint { margin: 8px 0 0; color: var(--muted); font-size: .75rem; line-height: 1.5; }
.profile-photo-picker { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.profile-photo-picker svg { width: 18px; height: 18px; }
.profile-settings button:hover:not(:disabled) { border-color: var(--primary); }
.profile-photo-actions, .profile-form-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.profile-settings button { color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; }
.profile-settings button[type="submit"] { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.skip-link { position: absolute; top: -80px; padding: 12px; background: var(--paper); border: 2px solid var(--ink); z-index: 5; }
.skip-link:focus { top: 8px; }
@media (max-width: 760px) {
  .app-shell { padding: 0 20px 24px; }
  .app-header { min-height: 80px; }
  .brand { font-size: .875rem; gap: 8px; }
  .brand-mark { width: 32px; height: 32px; font-size: 22px; }
  .quiet-button { padding: 8px 10px; font-size: .8125rem; }
  .catalog-heading { margin: 30px 0 24px; }
  .lesson-cards { grid-template-columns: 1fr; gap: 16px; }
  .lesson-card { display: grid; grid-template-columns: minmax(100px, .7fr) minmax(0, 1fr); }
  .lesson-card-art { height: auto; min-height: 175px; margin: 8px; }
  .lesson-card-copy { padding: 20px 16px 18px 8px; }
  .lesson-card-copy p { margin-bottom: 16px; }
  .lesson-card-copy h2 { font-size: 1.4rem; }
  .lesson-card-start { padding-top: 12px; }
  .verb-card-forms { font-size: 1.8rem; }
  .sentence-card-words { font-size: 1.4rem; }
  .sentence-card-words span { padding: 7px 12px; }
  .sentence-card-words span:last-child { margin-left: 16px; }
  .panel { padding: 20px; }
  .preferences-content { padding: 24px; }
  .settings-grid { grid-template-columns: 1fr; }
  .voice-call-bar { padding: 14px; }
}
@media (max-width: 359px) { .app-shell { padding-inline: 12px; } .lesson-card { grid-template-columns: minmax(90px, .65fr) minmax(0, 1fr); } .lesson-card-copy { padding-right: 12px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
/* Reflow remains usable with enlarged text and narrow browser windows. */
.setting-row { flex-wrap: wrap; }
.app-header { flex-wrap: nowrap; }
.preferences-heading > div, .brand, .lesson-card-copy { min-width: 0; overflow-wrap: anywhere; }
.preferences-heading h2 { overflow-wrap: anywhere; }
.setting-row select { min-width: 0; flex: 1 1 160px; }
@media (max-width: 480px) { .app-header { padding-block: 16px; } }
.call-indicator { display: inline-block; width: 8px; height: 8px; margin-right: 9px; border: 1px solid var(--muted); border-radius: 50%; }
.call-indicator.active { background: var(--primary); border-color: var(--primary); }

@media (max-width: 540px) {
  .preferences-dialog { width: calc(100vw - 24px); height: min(640px, calc(100dvh - 24px)); max-height: calc(100dvh - 24px); border-radius: 16px; }
  .preferences-heading { padding: 12px 16px; }
  .preferences-layout { grid-template-columns: 64px minmax(0, 1fr); }
  .preferences-nav { padding: 12px 8px; }
  .preferences-sidebar button { padding: 11px; justify-content: center; }
  .preferences-sidebar button span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .preferences-sidebar-footer { padding: 8px; }
  .preferences-content { padding: 24px 16px; }
  .preferences-section .setting-row { gap: 10px; padding: 12px; }
}

/* Home-only navigation; lesson tools are unmounted by the shared layout context. */
.lesson-catalog { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
.home-tools { position: fixed; inset: auto 0 0; z-index: 20; display: grid; grid-template-columns: repeat(2, minmax(0, 240px)); justify-content: center; gap: 12px; margin: 0; padding: 6px 20px calc(6px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--paper); box-shadow: 0 -4px 20px rgb(10 25 18 / .035); }
.home-tools .ll-tool-button { min-height: 60px; }
```

## `src/ui/mobile/mobile.css`

Full shared practice/control styles.

SHA-256: `a811efa36185031b8c1fb37e007955097dfc0df264fe18255fdad8990cbedc62`

```css
/* All selectors belong to this module; the foundation owns global styles. */
.ll-mobile { --ll-ink: var(--ink, #203b32); --ll-muted: var(--muted, #5c6d65); --ll-line: var(--line, #d9dfd5); --ll-primary: var(--primary, #08675f); color: var(--ll-ink); font: 1rem/1.6 system-ui, sans-serif; min-width: 0; padding-bottom: calc(6rem + env(safe-area-inset-bottom)); }
.ll-mobile *, .ll-sheet * { box-sizing: border-box; }
.ll-mobile h3, .ll-sheet h3 { margin: 0 0 12px; font-size: 1.1rem; line-height: 1.4; letter-spacing: -.02em; }
.ll-mobile p { margin: 8px 0; }
.ll-mobile :is(button, input, summary, a):focus-visible, .ll-sheet :is(button, [tabindex]):focus-visible { outline: 3px solid var(--primary, #08675f); outline-offset: 3px; }
.ll-practice-grid { display: grid; gap: 24px; min-width: 0; }
.ll-exercise, .ll-progress-region { min-width: 0; }
.ll-button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; min-width: 48px; border: 1px solid var(--line, #b6c3bc); background: var(--paper, #fffefa); color: var(--ink, #203b32); border-radius: 12px; padding: 10px 14px; font: inherit; font-size: .875rem; line-height: 1.4; cursor: pointer; text-align: center; }
.ll-button:hover:not(:disabled) { background: var(--surface, #eef0e7); }
.ll-primary { background: var(--primary, #08675f); border-color: var(--primary, #08675f); color: var(--primary-ink, #fff); }
.ll-primary:hover:not(:disabled) { background: var(--primary, #07544e); }
.ll-button:disabled { opacity: .65; cursor: default; }
.ll-next { width: 48px; padding: 0; font-size: 1.4rem; }
.ll-mobile :is(input, button, summary) { scroll-margin-bottom: calc(7rem + env(safe-area-inset-bottom)); }
.ll-mobile .ll-kicker { color: var(--muted, #5c6d65); font-size: .75rem; letter-spacing: .07em; text-transform: uppercase; font-weight: 650; }
.ll-cue { background: var(--surface, #eef0e7); border-radius: 16px; padding: 20px; margin-bottom: 24px; overflow-wrap: anywhere; }
.ll-cue figure { margin: 0; }
.ll-cue img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; border-radius: 10px; }
.ll-cue figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; color: var(--muted, #5c6d65); font-size: .75rem; }
.ll-mobile .ll-base { font-size: clamp(2rem, 6vw, 3rem); line-height: 1.2; font-weight: 600; margin: 8px 0; }
.ll-mobile .ll-spanish { font-size: clamp(1.4rem, 4vw, 2rem); line-height: 1.45; margin: 8px 0; }
.ll-field { margin: 0 0 20px; scroll-margin-block: 24px; }
.ll-field label, .ll-question label { display: block; font-size: .875rem; font-weight: 600; margin-bottom: 8px; }
.ll-field-controls { display: flex; align-items: stretch; gap: 8px; min-width: 0; }
.ll-field-controls input { min-width: 0; flex: 1; width: 100%; min-height: 48px; border: 1px solid var(--line, #84988d); border-radius: 12px; background: var(--paper, #fffefa); color: var(--ink, #203b32); font: inherit; font-size: 1rem; padding: 10px 12px; }
.ll-field-controls input::placeholder { color: var(--muted, #5c6d65); }
.ll-field-controls input[aria-invalid="true"] { border-color: var(--error, #b42318); }
.ll-field .ll-field-status { font-size: .875rem; color: var(--muted, #5c6d65); margin: 4px 0 0; min-height: 1.6em; overflow-wrap: anywhere; }
.ll-spelling { letter-spacing: .035em; overflow-wrap: anywhere; padding-top: 8px; color: var(--ink, #203b32); font-weight: 600; }
.ll-outcome-icon { margin-right: 8px; }
.ll-mobile .ll-correct { color: var(--success, #17643c); }
.ll-mobile .ll-incorrect { color: var(--error, #b42318); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.ll-spelling-feedback { position: relative; display: flex; align-items: center; gap: 2px; min-height: 28px; margin-top: 2px; }
.ll-spelling-feedback .ll-spelling { min-width: 0; padding-top: 0; }
.ll-sound-help { flex: 0 0 44px; display: inline-flex; }
.ll-sound-help-trigger { display: grid; place-items: center; width: 44px; height: 44px; min-height: 44px; padding: 13px; background: transparent; border: 0; border-radius: 50%; color: var(--muted, #5c6d65); cursor: pointer; }
.ll-sound-help-trigger svg { width: 18px; height: 18px; }
.ll-sound-help-trigger:hover { color: var(--ink, #203b32); background: color-mix(in srgb, var(--muted, #5c6d65) 8%, transparent); }
.ll-sound-tooltip { position: absolute; z-index: 6; bottom: 100%; left: 0; width: max-content; max-width: min(25rem, 100%); padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--line, #d9dfd5) 55%, transparent); border-left: 2px solid var(--primary, #08675f); border-radius: 8px; background: color-mix(in srgb, var(--paper, #fffefa) 90%, transparent); backdrop-filter: blur(8px); box-shadow: 0 3px 12px #00000010; font-size: .8125rem; line-height: 1.45; color: var(--ink, #203b32); overflow-wrap: anywhere; }
.ll-sound-tooltip-line { display: block; }
.ll-sound-tooltip-line + .ll-sound-tooltip-line { margin-top: 8px; }
.ll-mobile .ll-sound-tooltip .ll-muted { display: block; font-size: .6875rem; }
.ll-sound-quote { display: block; font-family: Georgia, 'Times New Roman', serif; font-size: 1rem; }
.ll-mobile .ll-muted, .ll-sheet .ll-muted { font-size: .875rem; line-height: 1.6; color: var(--muted, #5c6d65); }
.ll-progress { background: var(--surface, #eef0e7); border: 1px solid var(--line, #d9dfd5); border-radius: 16px; padding: 18px; }
.ll-mobile .ll-progress-count { font-size: 1.4rem; font-weight: 600; margin-bottom: 12px; }
.ll-progress-count span { font-size: .875rem; font-weight: 400; color: var(--muted, #5c6d65); }
.ll-progress progress { display: block; width: 100%; height: 8px; accent-color: var(--primary, #08675f); margin-bottom: 16px; }
.ll-obligations { border-top: 1px solid var(--line, #d9dfd5); }
.ll-obligations summary { display: list-item; cursor: pointer; padding: 12px 0; min-height: 48px; font-size: .875rem; }
.ll-obligations summary > span { float: right; padding-left: 8px; }
.ll-obligations ul { list-style: none; margin: 0; padding: 0 0 12px; }
.ll-obligations li { display: flex; align-items: baseline; gap: 10px; padding: 8px 0; font-size: .875rem; }
.ll-obligations li > div { min-width: 0; overflow-wrap: anywhere; }
.ll-obligation-state { display: block; color: var(--muted, #5c6d65); font-size: .75rem; }
.ll-obligations li p { color: var(--muted, #5c6d65); font-size: .75rem; }
.ll-dock { position: fixed; z-index: 10; inset: auto 0 0; border-top: 1px solid var(--line, #d9dfd5); padding: 8px 16px max(8px, env(safe-area-inset-bottom)); background: var(--paper, #fffefa); box-shadow: 0 -4px 20px rgb(0 0 0 / .04); }
.ll-dock > .ll-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 600px; margin: 0 auto; gap: 12px; }
.ll-dock .ll-reference { margin: 0; min-width: 0; }
.ll-tool-button { display: flex; flex-direction: column; gap: 2px; width: 100%; border: 0; padding: 4px 8px; border-radius: 12px; background: transparent; color: var(--muted, #5c6d65); font-size: .75rem; font-weight: 600; }
.ll-tool-icon { display: grid; place-items: center; width: 48px; height: 36px; border-radius: 10px; }
.ll-tool-icon svg { width: 26px; height: 26px; }
.ll-tool-button[aria-expanded="true"] { color: var(--primary, #08675f); }
.ll-tool-button[aria-expanded="true"] .ll-tool-icon { background: var(--surface, #eef0e7); }
.ll-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ll-voice-status { font-size: .875rem; }
.ll-voice-status > span { color: var(--primary, #08675f); }
.ll-voice-error { overflow-wrap: anywhere; color: var(--muted, #5c6d65); }
.ll-question { margin: 20px 0; }
.ll-reference { margin-top: 12px; }
.ll-sheet { background: var(--paper, #fffefa); color: var(--ink, #203b32); font: 1rem/1.6 system-ui, sans-serif; border: 1px solid var(--line, #d9dfd5); border-radius: 20px; padding: 24px; width: min(680px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain; }
.ll-sheet::backdrop { background: rgb(23 42 42 / .45); }
.ll-sheet-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.ll-sheet-heading h3 { margin: 0; }
.ll-sheet-controls { border-top: 1px solid var(--line, #d9dfd5); margin-top: 20px; padding-top: 12px; }
.ll-table-scroll { width: 100%; overflow-x: auto; margin: 20px 0; }
.ll-table-scroll table { width: 100%; border-collapse: collapse; text-align: left; font-size: .875rem; }
.ll-table-scroll caption { text-align: left; font-weight: 600; padding-bottom: 12px; }
.ll-table-scroll :is(th, td) { border-bottom: 1px solid var(--line, #d9dfd5); padding: 12px; vertical-align: top; }
.ll-table-scroll thead { background: var(--surface, #eef0e7); }
.ll-sentence-stage { margin-bottom: 24px; }
.ll-sentence-stage .ll-button { margin-top: 8px; }
.ll-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 479px) { .ll-sheet { margin: auto 8px 8px; width: calc(100vw - 16px); padding: 16px; border-radius: 20px 20px 12px 12px; max-height: calc(100dvh - 16px); } .ll-cue { padding: 16px; } }
@media (prefers-reduced-motion: reduce) { .ll-mobile *, .ll-sheet * { scroll-behavior: auto !important; animation: none !important; transition: none !important; } }
.ll-sheet .ll-progress { margin-top: 20px; }
.ll-hint { padding: 14px 16px; border-left: 3px solid var(--primary, #08675f); border-radius: 0 10px 10px 0; background: var(--surface, #eef0e7); }
```

## `src/features/verbs/verbs.css`

Current verb layout, cue, information and navigation styles.

SHA-256: `4f61188297e8aa0784db19a0ab87f6536c7e3a48e9d09e126fa51309b0f9a5c7`

```css
.verbs-lesson { min-width: 0; }
.verbs-workspace, .verbs-prompt, .verbs-answers { min-width: 0; }
.verbs-prompt { margin-bottom: 20px; }
.verbs-navigation { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; }
.verbs-picture-frame > .verbs-navigation { position: absolute; inset: 50% 8px auto; margin: 0; transform: translateY(-50%); pointer-events: none; }
.verbs-picture-frame > .verbs-navigation button { pointer-events: auto; }
.verbs-system-error { background: var(--surface, #eef0e7); border: 1px solid var(--line, #d9dfd5); border-radius: 12px; padding: 14px; overflow-wrap: anywhere; }

.verbs-word-cue { position: relative; box-sizing: border-box; min-height: 132px; padding-right: 72px; margin-bottom: 0; }
.verbs-word-cue > .verbs-navigation { position: absolute; top: 8px; right: 8px; margin: 0; }
.verbs-word-cue .verbs-navigation button { opacity: 0; pointer-events: none; transition: opacity .16s ease; border-color: transparent; background: transparent; color: var(--ink, #203b32); backdrop-filter: none; }
.verbs-word-cue .verbs-navigation button:hover { background: color-mix(in srgb, var(--ink, #203b32) 8%, transparent); }
.verbs-word-cue .verbs-navigation button:focus-visible { outline-color: var(--primary, #08675f); }
.verbs-word-cue[data-revealed="true"] .verbs-navigation button,
.verbs-word-cue:focus-within .verbs-navigation button { opacity: 1; pointer-events: auto; }
.verbs-word-information { position: absolute; inset: auto 8px 8px; pointer-events: none; }
.verbs-word-information :is(button, [role="tooltip"]) { pointer-events: auto; }
.verbs-word-cue .verbs-info-button { width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 11px; border: 0; border-radius: 50%; background: transparent; color: var(--muted, #5c6d65); }
.verbs-word-cue .verbs-info-button:hover { background: color-mix(in srgb, var(--ink, #203b32) 8%, transparent); color: var(--ink, #203b32); }
@media (hover: hover) and (pointer: fine) {
  .verbs-word-cue:hover .verbs-navigation button { opacity: 1; pointer-events: auto; }
}

.verbs-lesson .verbs-picture-cue { display: flex; justify-content: center; padding: 0; margin: 0; background: transparent; border-radius: 0; }
.verbs-picture-cue .verbs-picture-frame { position: relative; width: fit-content; max-width: 100%; min-width: 0; }
.verbs-picture-cue img.verbs-picture { width: auto; height: auto; max-width: 100%; max-height: clamp(280px, 50svh, 440px); aspect-ratio: auto; border-radius: 12px; }
.verbs-picture-cue figcaption { position: absolute; inset: auto 8px 8px; pointer-events: none; }
.verbs-picture-cue figcaption :is(button, [role="tooltip"]) { pointer-events: auto; }
.verbs-picture-unavailable { padding: 20px 20px 60px; background: var(--surface, #eef0e7); border-radius: 12px; }

.verbs-photo-button { display: grid; place-items: center; width: 44px; height: 44px; min-width: 44px; min-height: 44px; border: 1px solid #ffffff24; border-radius: 50%; padding: 11px; background: #15221b70; color: #fff; backdrop-filter: blur(8px); cursor: pointer; }
.verbs-photo-button svg { width: 20px; height: 20px; }
.verbs-photo-button:hover:not(:disabled) { background: #15221ba6; }
.verbs-photo-button:disabled { opacity: .3; cursor: default; }
.verbs-photo-button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.verbs-expand { position: absolute; top: 8px; right: 8px; }
.verbs-picture-frame :is(.verbs-expand, .verbs-navigation button) { opacity: 0; transition: opacity .16s ease; }
.verbs-picture-frame :is(.verbs-expand, .verbs-navigation button):focus-visible,
.verbs-picture-frame[data-revealed="true"] :is(.verbs-expand, .verbs-navigation button) { opacity: 1; }
.verbs-picture-frame .verbs-navigation button:disabled { opacity: 0; pointer-events: none; }
@media (hover: hover) and (pointer: fine) {
  .verbs-picture-frame :is(.verbs-expand, .verbs-navigation button):hover { opacity: 1; }
}

.verbs-picture-dialog { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: max(64px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); box-sizing: border-box; border: 0; border-radius: 0; background: #101a15f5; overflow: hidden; overscroll-behavior: contain; }
.verbs-picture-dialog[open] { display: grid; place-items: center; }
.verbs-picture-dialog::backdrop { background: #101a15; }
.verbs-picture-dialog > img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; object-fit: contain; }
.verbs-picture-close { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); }

.verbs-picture-info { position: relative; display: flex; justify-content: flex-end; width: 100%; }
.verbs-picture-cue .verbs-info-button { width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 11px; border-radius: 50%; border-color: #ffffff24; background: #15221b70; color: #fff; backdrop-filter: blur(8px); }
.verbs-picture-cue .verbs-info-button:hover { background: #15221ba6; }
.verbs-info-button svg { display: block; width: 20px; height: 20px; }
.verbs-info-tooltip { position: absolute; z-index: 5; bottom: 100%; right: 0; box-sizing: border-box; width: max-content; max-width: min(26rem, 100%); padding: 7px 10px; border: 1px solid color-mix(in srgb, var(--line, #d9dfd5) 55%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--paper, #fffefa) 82%, transparent); backdrop-filter: blur(8px); color: var(--ink, #203b32); box-shadow: 0 3px 12px #00000010; font-size: .8125rem; line-height: 1.4; overflow-wrap: anywhere; }

@media (prefers-reduced-motion: reduce) { .verbs-picture-frame :is(.verbs-expand, .verbs-navigation button), .verbs-word-cue .verbs-navigation button { transition: none; } }
```

## `src/features/verbs/picture-dictionary.css`

Current dictionary completion surface before redesign.

SHA-256: `248d0af211d1e18325127d66db35c36d546d684bb4d0cf7be1616bc8405957fd`

```css
.picture-dictionary { margin-block: 28px 0; padding-block-start: 24px; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
.dictionary-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 18px; margin-bottom: 20px; }
.picture-dictionary .dictionary-heading h2 { margin: 0; font-family: Georgia, serif; font-size: 2rem; font-weight: 400; letter-spacing: -.03em; line-height: 1.15; }
.dictionary-pronunciations { display: flex; flex-wrap: wrap; gap: 8px 16px; min-width: 0; }
.dictionary-pronunciation { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.dictionary-ipa { color: var(--muted); font-size: .875rem; line-height: 1.5; }
.dictionary-dialect { color: var(--muted); font-size: .75rem; line-height: 1.5; }
.dictionary-senses { display: grid; gap: 24px; }
.dictionary-part-of-speech, .dictionary-example-label { display: block; color: var(--muted); font-size: .625rem; font-weight: 650; letter-spacing: .12em; line-height: 1.5; text-transform: uppercase; }
.picture-dictionary .dictionary-definition { margin: 6px 0 0; font-size: .9375rem; line-height: 1.65; }
.dictionary-examples { margin-top: 18px; padding: 16px 18px; border-left: 3px solid color-mix(in srgb, var(--primary) 40%, var(--line)); border-radius: 0 12px 12px 0; background: var(--surface); }
.dictionary-examples blockquote { margin: 8px 0 0; }
.picture-dictionary .dictionary-examples p { margin: 0; font-family: Georgia, serif; font-size: 1.125rem; font-style: italic; line-height: 1.55; }
.picture-dictionary .dictionary-next { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; margin-top: 24px; border-color: var(--line); background: color-mix(in srgb, var(--primary) 4%, var(--paper)); color: var(--ink); font-size: .875rem; font-weight: 500; }
.picture-dictionary .dictionary-next:hover { background: color-mix(in srgb, var(--primary) 8%, var(--paper)); }
.dictionary-next svg { width: 20px; height: 20px; flex-shrink: 0; }
```

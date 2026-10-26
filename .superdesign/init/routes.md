# Routes and application entrypoints

Generated 2026-10-24 from the local working tree on `codex/exercise-feedback`, base `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. This discovery snapshot includes in-progress changes. It is design context, not a release or runtime receipt. No secrets, local account configuration, model generation, or external assets were inspected.

| URL | Component | Shared layout / behavior |
| --- | --- | --- |
| `/#/` or empty/unrecognized hash | `src/app/App.tsx` catalog | App header, lesson cards, home tools; authenticated student shell |
| `/#/verb-image` | `src/features/verbs/VerbLesson.tsx`, `mode=verb-image` | App breadcrumb -> PersistedLesson -> LessonSession -> PracticeLayout; photographic prompt and three editable spelling fields |
| `/#/verb-visible` | `src/features/verbs/VerbLesson.tsx`, `mode=verb-visible` | Same shell; supplied lemma and two editable spelling fields |
| `/#/sentence` | `src/features/sentences/SentenceLesson.tsx` | Same shell; Spanish prompt, written translation, tense recognition and completion explanation |
| `/account/credentials` | `src/app/CredentialLinks.tsx` | Separate credential-redemption entry selected by main; token erased from browser history before render |

Account roles are rendered by `LearningApplication`; administrator/professor screens do not introduce additional hash routes here. Theme and language are validated preferences. The lesson container occupies the available viewport and scrolls internally. Next controls change exercises within the current route.

## `src/app/routes.ts`

Full hash route definition.

SHA-256: `00b2ee946771724f32f52d0b413a3d92dbdd3d2a71d2ac1d9b6d75f91f086b07`

```ts
import type { LessonMode } from '../contracts';

export const MODES = [
  { id: 'verb-image', title: 'Picture practice', short: 'Picture', description: 'Find the verb in a picture, then make it your own.', editableForms: 3 },
  { id: 'verb-visible', title: 'Verb practice', short: 'Verb', description: 'Start with a base verb and build confidence with its forms.', editableForms: 2 },
  { id: 'sentence', title: 'Sentence practice', short: 'Sentence', description: 'Translate a Spanish prompt, then explain how your English works.', editableForms: 0 },
] as const;
export function resolveMode(hash: string, fallback: LessonMode = 'verb-image'): LessonMode {
  return MODES.find(mode => hash === `#/${mode.id}`)?.id ?? fallback;
}
export function modeHref(mode: LessonMode): string { return `#/${mode}`; }
/** Only a lesson URL opens a call; empty and unknown routes show the catalog. */
export function resolveLessonRoute(hash: string): LessonMode | null {
  return MODES.find(mode => hash === modeHref(mode.id))?.id ?? null;
}
```

## `vite.config.ts`

Vite configuration; local frontend at 127.0.0.1:5174, API proxy to loopback broker, canonical localhost navigation.

SHA-256: `9b29de94a53917fb72ec19d4afdcaade586f22cadc85f0579298d85cc9fea2ed`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } };
export default defineConfig({
  plugins: [react(), {
    name: 'canonical-local-navigation',
    configureServer(server) {
      // Keep local authentication on one origin before the browser loads the app.
      server.middlewares.use((request, response, next) => {
        const isDocument = request.headers['sec-fetch-dest'] === 'document'
          && request.headers['sec-fetch-mode'] === 'navigate';
        if (request.headers.host !== 'localhost:5174'
          || !['GET', 'HEAD'].includes(request.method ?? '')
          || !isDocument
          || !request.url?.startsWith('/')
          || request.url.startsWith('/api')) return next();

        response.statusCode = 307;
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Location', `http://127.0.0.1:5174${request.url}`);
        response.end();
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true, proxy },
});
```

# Extractable UI components

Generated 2026-10-24 from the local working tree on `codex/exercise-feedback`, base `b1f76feb88813a1efad2b5a8f574c3e5bbec165d`. This discovery snapshot includes in-progress changes. It is design context, not a release or runtime receipt. No secrets, local account configuration, model generation, or external assets were inspected.

These are candidate reusable design components, not new runtime components. Extract only the target-required subset. State/navigation props are the variable surface; visual labels, icon geometry, styling and brand marks stay in the design.

## AppHeader

- Source: `src/app/App.tsx`
- Category: layout
- Description: Brand navigation, tutor status mount and account preferences control.
- Extractable props: homeHref, preferencesOpen, accountInitials, hasProfileImage.
- Hardcoded: Brand mark, inline icons, header layout and visual labels.

## LessonBreadcrumb

- Source: `src/app/App.tsx`
- Category: layout
- Description: Compact All lessons link and active lesson label.
- Extractable props: homeHref, currentLesson.
- Hardcoded: Arrow icon, separator and layout.

## PracticeLayout

- Source: `src/ui/mobile/components.tsx`
- Category: layout
- Description: Current exercise content with optional footer controls.
- Extractable props: showTools.
- Hardcoded: Practice card spacing and footer styling.

## LessonDialog

- Source: `src/ui/mobile/components.tsx`
- Category: basic
- Description: Native modal sheet with hold lifecycle and accessible close behavior.
- Extractable props: open.
- Hardcoded: Trigger style, close icon, border radius and typography.

## ReferenceTable

- Source: `src/ui/mobile/components.tsx`
- Category: basic
- Description: Bounded modal reference data surface.
- Extractable props: open.
- Hardcoded: Table visual design and modal chrome.

## SpellingField

- Source: `src/ui/mobile/SpellingField.tsx`
- Category: basic
- Description: Editable verb form with debounced result and optional help.
- Extractable props: value, feedbackState, helpOpen.
- Hardcoded: Feedback iconography, field style and status treatment.

## VerbWordCue

- Source: `src/features/verbs/WordCue.tsx`
- Category: basic
- Description: Supplied lemma with information and navigation affordances.
- Extractable props: canGoBack, informationOpen.
- Hardcoded: Cue styling and navigation icons.

## VerbPictureCue

- Source: `src/features/verbs/PictureCue.tsx`
- Category: basic
- Description: Photographic cue with overlays and preserved image proportions.
- Extractable props: canGoBack, informationOpen.
- Hardcoded: Image layout, overlay styling and icons; photograph remains actual authored content.

## VerbDictionaryEntry

- Source: `src/features/verbs/PictureDictionaryCard.tsx`
- Category: basic
- Description: Completed verb identity, sourced definition, pronunciations and examples.
- Extractable props: available, mode.
- Hardcoded: Word typography, section treatments, source footer styling and next-arrow icon.

## VerbSentencePractice

- Source: `planned new feature-local component`
- Category: basic
- Description: Optional own-sentence form with explicit correction submission and response below input.
- Extractable props: expanded, pending, feedbackState.
- Hardcoded: Information hierarchy, iconography, action styles and Spanish helper copy; no automatic model request.

## Suggested completion-card composition

Use a restrained, rounded paper/surface card: compact completion label, serif lemma and IPA on one baseline, a small grammatical-type chip, a form strip, a readable sourced definition, then an example with a small quote accent. Keep the example in normal body type or mild italic, smaller than the lemma. Preserve literal dictionary content and keep source attribution accessible in a quiet footer.

Place the optional sentence exercise beneath the entry as a separate feature component with an expandable invitation. The expanded textarea, explicit correction action and result should remain in document flow. Next remains available as a secondary navigation action. Avoid full-card uppercase labels, oversized examples, or turning definition text into a decorative graphic.

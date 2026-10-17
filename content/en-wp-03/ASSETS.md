# Original image cues and provenance

All 25 `image_cue` records now resolve to original repository-native SVG scenes
under `public/images/verbs/`, with `asset_status: original-local-svg` and real
local `file`/`src` paths. The follow-up dispatch authorized closing the initial
brief-only gap. [render_cues.py](render_cues.py) composes original paths and
geometric shapes; it imports no art, fonts, photographs or provider output.
The [asset ledger](asset-ledger.json) records creator, original-work rights
basis, attribution and SHA-256 for each scene. No separate public license grant
or third-party rights approval is invented. The work was authored for this
repository under the user's commission; no paid provider or image-generation
service was used.

The scenes use a consistent cream/teal palette, strong silhouettes and no
brand marks, copyrighted characters, printed words or time/tense labels. Blood
is a tiny non-graphic cue; bet uses playful predictions with counters and no
money promotion. Visible cues depict the action or meaning, not just a generic
placeholder. All 25 have distinct scene bytes. XML checks reject scripts,
external links/images/fonts, event handlers and visible text elements. Browser
checks verify real HTTP/MIME/source equality, decode and responsive rendering.
The contact sheet was visually inspected; classroom recognition is untested.

Every scene has an embedded Spanish title/description, plus an explicit Spanish
nonvisual cue and contextual cue in data. `be`, `become`, `begin`, `bet`, `bring`,
`come`, `cost`, `deal`, `do` and `dream` are marked ambiguous. Use
`VERB_CUE_BRIEFS` to display their contextual cue beside the image; it is also
included in the shared accessible alt. Abstract states and reference direction
need context, and a still image cannot prove lexical uniqueness. If a learner
reads another action into a cue, clarify or offer visible-base practice rather
than confidently penalizing them.

These Spanish prompts preserve access without printing an English target form.
As with the visual cue, they can supply meaning. Do not hide useful alt text or
count supplied context as learner-produced oral evidence. EN-WP-02/05 retain
presentation and transparent assisted/unassisted evaluation ownership. Cue
captions/helpers must preserve stage and progress. In-call tables remain a
separate surface from the opt-in genuine-error phonetic help.

If a scene is later replaced with external artwork, retain the exact source
URL, creator, item-specific license/version, required attribution, derivative
permissions, file/checksum and any releases. A search thumbnail is not a license.
No invented ledger entry certifies rights. Unresolved external rights block
shipping that replacement, not the original local curriculum.

Reproduce the original assets with `python3 content/en-wp-03/render_cues.py`;
it refreshes image data and the checksum ledger deterministically. Validate
with `check_content.py` and the browser commands in VALIDATION-ASSETS.md.

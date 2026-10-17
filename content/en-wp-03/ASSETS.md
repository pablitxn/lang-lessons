# Real photograph policy and source research

Decision: use real photographs for exercise cues. Lesson-card covers use the
existing typographic graphic style, as clarified by Pablo on 2026-10-18.
Initial source research and visual review: 2026-10-17 (Europe/Istanbul).
This supersedes the original SVG asset strategy. Historical validation receipts
remain evidence of the former implementation, not current photo validation.

## Source selection

| Bank | Free-use basis checked | Fit for this curriculum |
| --- | --- | --- |
| Pexels | [License](https://www.pexels.com/license/) permits free app use and modification; credit is appreciated. [Terms](https://www.pexels.com/terms-of-service/) exclude sponsored content and prohibit generative AI uploads, without guaranteeing every upload is human-produced. | Preferred initial bank: searchable action photography, source pages and credited photographers. Inspect each selected item. |
| Unsplash | [License](https://unsplash.com/license) permits free commercial/noncommercial use; restrictions include resale and competing collections. | Suitable alternative when a specific photograph communicates the action better. Check the individual item's actual license; avoid assuming a paid item is free. |
| Pixabay | [License summary](https://pixabay.com/service/license-summary/) permits free use with restrictions; other rights may apply. Its catalog includes multiple media types. | Secondary candidate: verify the actual photograph and its source/license rather than accepting a search thumbnail or illustration. |

The collection contains 75 photos across the exact25 inventory, with three photos
per verb after the 2026-10-18 expansions from 30 to 50 to 75. There is no maximum
count per verb and no requirement that future collections have the same length. All item
pages and photographer credits are recorded in the
[ledger](asset-ledger.json). The burst photo is explicitly marked CC0 on its
Pexels item page; its credited uploader is Flickr, and the original photographer
is not identified. The record does not invent that identity.

Use assets within the authored educational exercises, not as a standalone stock
photo service. Do not imply that a photographed person endorses the app, and do
not use identifiable people in offensive contexts. Keep provider license terms
and any item-specific restrictions with the provenance review.

## Mandatory authoring rules

- Use photographs of real scenes. No generated pictures, vector illustrations,
  synthetic composites or generative alterations. A photograph of someone
  drawing is acceptable; a generated drawing replacing the photograph is not.
- Review the actual source page, photographer/uploader credit, license and image.
  A bank's AI policy helps sourcing but is not proof of authenticity. Checksums
  and integrity tests cannot detect AI or certify third-party rights.
- Choose a clear action at mobile size, without printed English target forms or
  tense labels. Retain the full scene: the preview uses its natural aspect ratio
  in a tightly fitting frame; the full-screen viewer uses `object-fit: contain`.
  Reject graphic injuries; bleed uses a small fingertip blood drop.
- Author each `tooltip_en` as one short English sentence with a lightly poetic
  tone, without revealing the target verb or its forms. Keep the Spanish factual
  accessible description and meaning context separate.
- Each photo owns its Spanish accessible description, contextual meaning and
  ambiguity flag. The information tooltip is the only visible contextual aid;
  the complete factual description remains available as the image alternative.
  Be/become/begin/bet/come/dream cannot be uniquely inferred from a still photo;
  authored context is never treated as learner oral evidence.
- Keep JPEGs local under `public/images/verbs/{verb}-{numeric-id}.jpg`, at most
  960 pixels wide and 500 KB each. The numeric ID can be a bank item ID or a
  locally assigned ID for a contributed photo. Ordinary resize/compression is
  allowed; record transformations. No bank keys, remote hotlinks, live search,
  tracking requests or runtime image API are required.
- Record a unique asset ID, content ID, creator (or honest uploader credit),
  source/download URLs, provider, exact license and URL, rights basis, attribution,
  review date, review status, transformations and SHA-256. For contributed photos,
  use a stable HTTPS provenance record and explicit permission/license evidence.
- Choose the photo once when the exercise starts. Context, alt and attribution
  must travel together. Typing, helpers or preferences must not reroll it or
  reset accepted evidence. Image failure must preserve progress and offer a
  nonvisual cue; never fall back to generated art.

## Add photos or banks

1. Find and inspect an eligible photo. Verify it can be used in this app and
   review releases or additional rights when relevant. Avoid paid/sponsored items.
2. Download/resize it and review the actual pixels at desktop and mobile sizes.
3. Add its record to `asset-ledger.json` with the existing `content_id` for the
   verb and a unique `asset_id`. New providers use the same schema; no provider
   enum or hardcoded count needs changing.
4. Keep `verbs.json.image_cue` in sync with the first photo for that verb. It is
   the compatible primary cue, not the collection. Remove unused assets.
5. Run `npm run check` and the supplied browser helpers described in the README,
   including `node content/en-wp-03/check_assets_browser.cjs PORT [PREVIEW_PORT]`.
   Record actual browser results separately from unit fixtures and provider work.

Independent learner comprehension and real-device acceptance remain unverified.
The collection is intentionally extendable as better photographs are reviewed.

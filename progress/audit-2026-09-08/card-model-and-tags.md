# Owner-requested gaps: card model and tag management

Added on 2026-09-08 following explicit owner feedback. These are two separate, important product gaps in the audit and proposed redesign. They are not claims that the application has no card schema or no label field. Evidence below comes from source inspection; browser findings are recorded separately.

## CARD-01 — No fully developed card model and working experience

**Priority: high for product design and workflow completion.** Fix any reproduced draft-loss defect before expanding this surface.

The current model already stores identity, title, outcome/decision kind, status, priority, manual order, archive state, dates, blockers, milestone membership, dependencies, labels and Markdown body. Reports and history also exist. However, the shared editor primarily presents these as a long metadata form. A mature card needs a coherent definition of its purpose, content, relationships, actions and lifecycle, with the same behavior wherever it is opened.

Evidence: [card contract](../../docs/03-DATA-FORMAT.md), [editor](../../apps/web/src/lib/Editor.svelte), [board card](../../apps/web/src/lib/BoardCard.svelte). The absence of native structured acceptance/checklist fields is a model gap; raw relationship IDs, disconnected reports and inconsistent actions are experience gaps. Changing the card's appearance alone does not resolve them.

| Area | Proposed product contract |
|---|---|
| Purpose and content | Title first, clear outcome/decision type, description, expected result and acceptance conditions. Introduce useful description structure immediately; treat a native interactive acceptance checklist as a separately designed model extension. A checklist percentage must not silently accept an outcome. |
| Essential properties | Status, priority and tags use normal reusable controls. A user can capture a title-only draft without filling optional planning or technical fields. |
| Planning | Planned start/end, target or hard deadline, and review date retain distinct meanings. Use identical controls and date badges in all card representations. |
| Relationships | Milestone, predecessors, successors and blockers show titles and state, with searchable selection and navigation to related records. IDs stay available under technical details. |
| Work context | Show updates targeting this card, results, open decisions and resolutions, plus change history. Add an update from the card with its target prefilled. Preserve append-only reporting and explicit resolution semantics. |
| Actions | One action vocabulary for open, edit, change status, pin, plan, add update, copy link, archive and restore. Duplicate/template creation is a proposed extension. Resource menus and keyboard actions call the same versioned operations. |
| Lifecycle | Separate clean, dirty, saving, saved, uncertain and conflicting states. Pinning or another independent action must preserve unsaved content. Archive must have a discoverable restore path. |
| Representation | Define compact Board/Focus card, List row, Calendar event, Timeline selection and full inspector as views of one resource. Keep terminology, status/priority/date meaning and selected properties consistent without displaying every field everywhere. |

**Acceptance:** create a minimal card; add an expected result and acceptance conditions; set properties and dates; attach a milestone/dependency by title; add and read a card-targeted update; pin while retaining a dirty draft; find and restore an archived card. Complete the ordinary workflow without copying IDs, editing JSON or reconstructing context from unrelated screens. Verify the same saved facts in Board, List, Calendar and Timeline, including keyboard and narrow layouts.

## TAG-01 — No coherent tag system or practical tag workflow

**Priority: high for everyday organization and retrieval.** Treat this as a separate deliverable, not a cosmetic chip replacement.

Today labels are an array of strings. The editor joins them into one comma-separated input and splits that text on Save (`Editor.svelte:59`, `322–326`, `518–522`). Board cards render labels as text badges (`BoardCard.svelte:71`). The list API supports a `label` filter, but the normal toolbar lacks a tag filter. No tag catalog, suggestion picker or tag rename/merge management UI was found. Existing contract limits are 20 labels per card and 48 characters per label; redesign must explain and retain these limits until deliberately changed.

| Area | Proposed behavior |
|---|---|
| Add/remove | Searchable multi-select with removable chips, suggestions from existing tags and an explicit create action. Keyboard selection, Enter, Escape and individual remove controls work on desktop and touch. |
| Identity and scope | Define whether tags belong to workspace or project before implementation. Recommended product default: a reusable workspace vocabulary with per-project usage visibility. Specify its source-of-truth and reference contract; a global catalog must not make `.project/` data uninterpretable on its own. |
| Naming | Trim surrounding whitespace, reject empty names and prevent accidental duplicates. Define case and Unicode normalization consistently across UI, API, CLI and search. Show existing values when `QA` and `qa` would collide; do not silently merge meaningful historical data. |
| Presentation | Use one name, optional accessible color and chip geometry across views. Preserve the text meaning without relying on color. Use a predictable overflow indicator for many tags; show the full set in the inspector. |
| Retrieval | Expose tag filters with removable active chips and explicit match-any/match-all semantics. Tag search must operate over the full selected project/workspace, including records beyond page one. Tag grouping and saved criteria can follow the shared view model. |
| Management | Provide search, usage counts, rename and merge, with a preview of affected cards. Distinguish removing a tag from one card from changing the shared vocabulary. Put rare management actions in an appropriate settings/menu surface. |
| Safe operations | Define version checks and per-resource results for rename/merge and future bulk application. Preserve unrelated tags and newer edits, keep identical command identity on uncertain retries, and surface partial completion. Never infer permission to silently rewrite all project files. |

**Acceptance:** add an existing tag by suggestion; create a new tag; remove only that tag from one card; reject an empty/duplicate value; handle Polish characters; filter by one and multiple tags with clear matching semantics; find a tagged card outside the first page; rename/merge synthetic tags without dropping unrelated labels; verify display and keyboard/touch behavior across views. Design and test conflict/partial-completion behavior before shipping operations that affect multiple cards.

## Browser-confirmed tag behavior

The subsequent real-browser audit reproduced two concrete defects: **A02** changes the valid single label `Research, discovery` into two labels when only the card title is edited; **A10** rejects duplicate input `qa, qa` with a generic message about dates/additional fields. See [main report](README.md) and [followup.json](checks/followup.json), checks 32/33. These results strengthen TAG-01 beyond a product-design preference. Fix preservation of existing label values before adding new tag capabilities.

## Delivery placement and acceptance

CARD-01 defines the shared inspector, card summary and action contracts before additional widget-specific features. TAG-01 spans that inspector and the shared retrieval layer; it must have its own controls, data semantics, management flow and acceptance scenarios. Both belong in the main UI consolidation backlog. These additions record requested gaps and proposed requirements; they do not implement a schema migration, add teamwork scope, or mark browser acceptance complete.

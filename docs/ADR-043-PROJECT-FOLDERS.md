# ADR-043: Project folders and workspace Focus

Date: 2026-09-26. Status: accepted by owner direction.

Projects have one optional `folder` category, such as Work, Home or Hobby.
Folders belong only to projects. Existing card labels remain independent; cards
have no folder field. A folder is not a filesystem path and assigning it does
not move a project or change its registration.

The source field is a case-sensitive name of 1–48 characters, without leading
or trailing whitespace or line breaks. Existing projects may omit it. Ordinary
versioned project patches set or clear it, using the existing durable write and
retry protocol. No migration or new durable catalog is required.

Focus replaces its project selector with All folders or one folder. All folders
includes projects without a folder. Pinned cards use their project's folder;
active cards and attention (including milestone and project-report attention)
are filtered in SQL before pagination. Cursor identity includes the folder and
projection revision, so changing scope or assigning a folder cannot reuse stale
pages. A project change invalidates all affected Focus sections. Hidden pins
retain their original ordering slots.

`GET /api/v1/views/folders` supplies paginated distinct names for editor
suggestions, including archived projects. `GET /api/v1/views/list` and
`GET /api/v1/views/attention` accept an optional exact `folder` filter. Other
views retain their project selectors. The browser stores the Focus folder in
the URL; a project parameter no longer limits Focus but retains the selected
project for other views after reload.

The project editor uses the same chip picker as card tags. Enter, Add/Set folder
or a suggestion confirms one folder and triggers autosave; the remove button
explicitly clears it. Unconfirmed typing stays in the draft and is protected on
close. Choosing a new folder replaces the previous one. Project overview cards show the category. Adding a card
from Focus uses the only available project in the selected folder, or asks the
owner to choose among matching projects. It never silently uses a hidden project
selection from another view.

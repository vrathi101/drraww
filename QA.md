# QA checklist (Drraww)

## Smoke (dev or preview)
- Sign in with Google succeeds; redirected to `/app`.
- Create note -> editor opens -> draw/highlight/text/erase works; undo/redo works.
- Autosave indicator reaches “Saved” and survives page refresh.
- Dashboard lists new note with updated timestamp.

## Persistence
- Refresh `/app/note/:id` -> previous strokes still present.
- Close tab, reopen -> local draft banner only appears if unsynced edits exist; “Restore” works.
- Delete note -> disappears from dashboard.

## Export
- PNG export downloads a file with strokes visible.
- PDF export downloads a file with strokes visible.

## Offline
- Toggle network offline, draw, close tab, reopen -> local draft banner appears; restore brings strokes back; go online, hit “Retry save”, note persists after refresh.

## Thumbnails
- After editing for ~20s, dashboard shows a thumbnail (may need refresh).

## Revisions
- After editing for ~30s, history shows recent checkpoints; restoring a checkpoint reloads strokes.

## Responsive
- Tablet width: toolbar and canvas usable; dashboard cards wrap.

## Security (smoke)
- Accessing `/app` logged-out redirects to `/`.
- API routes `/api/notes` and `/api/notes/:id` return 401 when not signed in.

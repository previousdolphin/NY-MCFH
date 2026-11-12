# Editor glossary

One name per thing, used on every button, heading and message in `/studio`.

| Term | Means | Not |
| --- | --- | --- |
| Draft | The site as edited but not yet public. Every save goes here. | working copy, staging |
| Live site | What the public sees. | production |
| Preview | The draft shown as the full site, at a private link. | staging site |
| Publish | Make the draft the live site. | deploy, push |
| Schedule | Publish a frozen copy of the draft at a chosen time. | queue, timer |
| Version | One published state of the site, kept in History. | release, snapshot |
| Restore | Make an older version live again. | roll back, revert |
| Discard changes | Throw away unpublished edits so the draft matches the live site. | reset |
| Event | An action, forum or meeting with a date. Moves to Past on its own. | action, post |
| Member | An organisation in the coalition (logo grid on the home page). | signatory |
| Partner | An allied organisation (cards on the Partners page). | sponsor |
| Page text | The fixed wording on the pages. | blocks, copy |
| Image | An uploaded poster, logo or photo. Kept in Images. | media, asset |
| Show on site | Whether an item is included when the draft is published. | visible, active |
| Remove | Take an item out of the draft. | delete |
| Editor | A person allowed to sign in. | admin, user |

## UX

- Flow: tab (Events, Members, Partners, Page text, Images) -> list -> Edit or Add opens the form page, Cancel goes back -> Save to draft returns to the list -> Publish tab -> review changes -> Publish now or Schedule -> History shows the new version.
- Surface: each tab is a page in the nav with its own address (`#events`). Forms are their own page (long task). Choosing an image is a dialog (short task, full screen on phones). Publish, Schedule, Restore, Discard and Remove are inline with a tick box that arms the button.
- States: empty lists say what the list is for and offer Add. Errors appear beside the Save button with the fix. A save by someone else shows who, with Reload or Overwrite. An expired sign-in keeps the form and offers Sign in again. Nothing to publish says so and disables Publish.
- Words: "Save to draft", "Add event", "Publish now", "Schedule", "Restore this version", "Discard changes", "Remove event".
- Access: every control is a real button, link or input with a visible label; status messages are announced; nothing depends on hover or colour alone.

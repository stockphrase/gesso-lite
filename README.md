# Step 13a — Edit assignment

First piece of Step 13 polish. Adds the ability to edit assignment
title, description, stage names, stage dates; reorder stages; add
new stages; remove unused stages; and delete the entire assignment
when no submissions exist.

This was a real gap — assignments created from a template had no due
dates and no way to add them.

## Files (3 total)

New:
- app/courses/[id]/assignments/[assignmentId]/edit/page.tsx
    Edit assignment page (server component).
- app/courses/[id]/assignments/[assignmentId]/edit/EditAssignmentClient.tsx
    Client component with stage reordering (↑/↓), rename, add, remove.
- app/courses/[id]/assignments/[assignmentId]/edit/actions.ts
    Server actions: updateAssignment and deleteAssignment.

Replaces:
- app/courses/[id]/assignments/[assignmentId]/page.tsx
    Adds the "Edit" button in the page header (instructor-only).

## Behavior

When you save changes:
- Title and description update directly.
- Stage rename: existing submissions for that stage are atomically
  renamed too, so they stay associated with the (renamed) stage.
- Stage delete: refused if any submissions exist for that stage.
  Error message tells the user to either rename it or remove the
  submissions first.
- Stage add and reorder: applied directly, no implications for
  existing submissions.

Delete assignment: only allowed if zero submissions exist. Error
message guides the user otherwise.

## Apply

    unzip /path/to/gesso-lite-step13a.zip -d .

No database migration. Hot reload picks up the changes.

## Test

1. Open a course, click an assignment that was created from a template
   (with no due dates).
2. Click the "Edit" button in the page header.
3. Type dates into the Due date fields. Click "Save changes".
4. Page returns to the assignment detail page; stages now show their
   due dates.
5. Click Edit again. Try:
   - Rename the title → save → verify
   - Add a new stage → save → verify
   - Use ↑/↓ arrows to reorder → save → verify
   - Delete a stage that has no submissions → save → verify
   - Try to delete a stage that DOES have submissions → expect error
     with guidance
   - Rename a stage that has submissions → save → submissions still
     visible under the new name
6. Try to delete an assignment that has submissions: expect error.
   Try to delete an assignment with no submissions: succeeds, returns
   to course home.

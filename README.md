# Step 10.5 — Templates and course settings page

Save a course's structural skeleton (assignments, stage names, reading
filenames as reference) for later reuse. Also adds the course settings
page itself, which until now didn't exist (the settings link in the
course detail page pointed nowhere).

The settings page in this step has two sections: Save as template, and
Archive/Unarchive. Step 11 will add the Delete section.

## Files (12 total)

New:
- supabase/migrations/0008_course_templates.sql
    `course_templates` table with RLS so each instructor sees their own.

- app/api/templates/save/route.ts
    POST. Reads the source course's assignments (titles, descriptions,
    stage names — drops dates and IDs) and reading filenames, inserts
    a row into `course_templates`.

- app/api/templates/[id]/instantiate/route.ts
    POST. Creates a new course from a template, with all assignments
    populated and all stage due_dates set to NULL.

- app/api/templates/[id]/delete/route.ts
    POST. Deletes a template (instructor-owned).

- app/api/courses/[id]/archive/route.ts
- app/api/courses/[id]/unarchive/route.ts
    POST. Sets/clears `courses.archived_at`.

- app/templates/page.tsx
    List of all the instructor's templates.

- app/templates/[id]/page.tsx
- app/templates/[id]/TemplateClient.tsx
    Template detail page with assignments preview, instantiation form
    ("Create course from this template"), and a Delete button.

- app/courses/[id]/settings/page.tsx
- app/courses/[id]/settings/SettingsClient.tsx
    The course settings page. Save-as-template flow, archive toggle.
    Default template name is computed as `{academic-year}-{course-title}`,
    e.g. `2026-27-Writing 2.04` for a Fall 2026 course.

Replaces:
- app/courses/page.tsx
    Adds a Templates link in the page header alongside "+ New course".

## Apply

1. Unzip into the repo root:
       unzip /path/to/gesso-lite-step10p5.zip -d .

2. Run the migration in the Supabase SQL editor:
       supabase/migrations/0008_course_templates.sql

3. Verify the table exists:
       SELECT count(*) FROM public.course_templates;

4. Hot reload picks up the file changes.

## Test

As instructor:
1. Open any course's settings (the "Settings" button on its home page).
2. Click "Save as template". Default name is filled in (e.g.
   `2026-27-Writing 2.04`). Edit if desired, click Save template.
3. Banner says "Template saved." with a link.
4. Click the Templates link in the courses list header.
5. Your template appears with the assignment count.
6. Click into the template. See its assignments and (if any) the
   reference list of previous reading filenames.
7. Use the instantiate form: pick a title (defaults to the template's
   default), term, and year. Click "Create course from template".
8. Redirects to the new course's home page. All assignments are there
   with empty due dates.
9. Click into an assignment: the stages have names but no dates.
10. Back to settings on a course, click Archive course. Confirms.
11. Course list now shows it under "Archived". Re-enter and unarchive.

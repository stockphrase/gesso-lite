# Step 6 — Assignments + Dark Mode

Drop the contents of this archive into the root of the gesso-lite repo. The
`app/` folder mirrors the project's structure exactly, so an unzip with
overwrite will land each file in the right place.

## Files (9 total)

Replacements (overwrite existing files):
- app/globals.css                              — adds dark theme variables and
                                                 assignment/stage/toggle styles
- app/layout.tsx                               — adds the no-flash theme init
                                                 script in <head>
- app/courses/page.tsx                         — adds <ThemeToggle /> in footer
- app/courses/[id]/page.tsx                    — replaces the Assignments
                                                 placeholder with a real list

New files:
- app/_components/ThemeToggle.tsx              — three-state Light/Auto/Dark
                                                 toggle, persists via
                                                 localStorage
- app/courses/[id]/assignments/new/page.tsx    — assignment create form
                                                 (title, description, stages)
- app/courses/[id]/assignments/new/actions.ts  — server action for create
- app/courses/[id]/assignments/[assignmentId]/page.tsx
                                                — read-only assignment detail
                                                  page (submission UI in Step 7)
- app/api/courses/[id]/title/route.ts          — small endpoint the new-
                                                 assignment form calls to
                                                 populate the breadcrumb

## How to apply

From the gesso-lite repo root:

    unzip /path/to/gesso-lite-step6.zip -d .

Or if you'd rather see what's about to change first:

    unzip -l /path/to/gesso-lite-step6.zip

## After applying

1. The dev server's hot reload should pick up everything. If it's confused,
   stop with Ctrl+C and run `npm run dev` again.
2. No database migration this time — assignments use the existing
   `assignments` table from Step 1's migration.
3. Run through the test plan from chat:
   - Theme toggle works (Light / Auto / Dark, persists across reloads)
   - Dark mode looks reasonable (no white flashes, orange accent softens)
   - Create assignment from a course home → redirects to its detail page
   - Course home shows the assignment with "Stage Name due Month Day, Year"
   - Multiple assignments sort by next-stage due date
   - Assignments with all past stages show "All stages complete" muted

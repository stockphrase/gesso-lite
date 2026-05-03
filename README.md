# Gesso Lite — docs site

Adds a `/docs` folder containing a static GitHub Pages site that
mirrors Gesso Lite's own aesthetic: black-on-white, hairline borders,
optional dark mode, an orange accent. No Jekyll theme, no build step.
Just HTML and CSS.

## Files (6 total)

New, all under `/docs`:
- `index.html` — landing page (what it does, roles, stack)
- `installation.html` — setup guide
- `instructor-manual.html` — for the instructor
- `student-manual.html` — for students
- `style.css` — shared styling, mirrors gesso-lite.no-silo.com aesthetic
- `theme.js` — light/dark theme toggle
- `_config.yml` — minimal Jekyll config (tells GitHub Pages to serve files as-is)

## Apply

    unzip /path/to/gesso-lite-docs.zip -d .

The new files land at `docs/` in the repo root.

## Enable GitHub Pages

After committing and pushing:

1. On GitHub, go to your repo's Settings → Pages
2. Under "Build and deployment":
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: `/docs`
3. Save

Wait 1–2 minutes. GitHub will build and publish. The URL will be:

    https://stockphrase.github.io/gesso-lite/

You can see the deployment status at the bottom of the Pages settings page.

## Local preview

To preview before pushing, just open the HTML files directly in a browser:

    open docs/index.html

The pages are pure HTML/CSS/JS — no server needed. Theme toggle works
locally via localStorage.

## Editing

These files are hand-written HTML. To update content, edit the `.html`
files directly. Each page links to the next via plain `<a href>` tags.

If you want to add a fifth page (e.g. "FAQ"), follow the structure of
the existing pages: copy `student-manual.html`, change the `<title>`
and content, link to it from the relevant places (probably from the
nav buttons on `index.html` and the footer of every page).

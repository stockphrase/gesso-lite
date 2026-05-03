# Gesso Lite

A clean, minimal course management tool for writing instructors.
Built to replace Canvas LMS for the case of one teacher, a few classes.

**Documentation:** https://stockphrase.github.io/gesso-lite/

## What it does

- **Multi-stage assignments.** Each assignment can have any number of
  draft stages with their own due dates. Late submissions are flagged.
- **Bulk download and return.** Pull every student's draft as a single
  zip. Mark them up. Upload back as one zip and they're routed
  automatically to each student by filename.
- **Course readings.** Upload PDFs once, students download as needed.
- **Roster management by whitelist.** Add students by email; they
  register themselves. Only whitelisted addresses can sign up.
- **Course templates.** Save a course's structure for reuse next year.
- **Right to be forgotten.** Delete a course at term's end. A backup
  zip downloads first, then everything's wiped — files, accounts, all
  of it.

## Stack

Next.js 16, TypeScript, Tailwind CSS v4, Supabase (Postgres + Auth +
Storage), JSZip. Deploys to Vercel.

## Setup

See the [Installation guide](https://stockphrase.github.io/gesso-lite/installation.html).

## License

MIT.

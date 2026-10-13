# Task website

The website lives in [`docs/`](docs/) and is served by GitHub Pages at
**https://aridhasan.github.io/blp27_task2/**. It is plain HTML, CSS and JavaScript:
there is nothing to build or install.

```
docs/
├── index.html                    # all sections (one is shown at a time)
├── data/
│   ├── site.json                 # EDIT THIS: dates, news, organizers, links, baseline scores
│   └── leaderboard.json          # written automatically from EvalAI (do not edit)
├── assets/css/style.css
├── assets/js/app.js
└── assets/img/organizers/        # organizer photos (see the README in that folder)
scripts/fetch_leaderboard.py      # pulls public leaderboards from EvalAI
.github/workflows/update-leaderboard.yml   # runs the script every hour
```

## Turn it on (one time)

1. Push this folder structure to `main`.
2. **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, Folder = `/docs`. Save.
3. **Settings → Actions → General → Workflow permissions**: choose *Read and write permissions*. Save.
   (The leaderboard job needs this to commit `leaderboard.json`.)
4. **Actions → Update leaderboard from EvalAI → Run workflow** once to fill the leaderboard immediately.

The site is live a minute or two after each push.

## Everyday edits (all in `docs/data/site.json`)

| To… | Edit |
|---|---|
| Post an update | add `{ "date": "2026-11-01", "text": "…" }` to `news` (newest is shown first) |
| Change a deadline | the entry in `dates`: `date` (YYYY-MM-DD, used for the countdown) and `label` (what is shown) |
| Change the stage names | `stages`: each stage lasts `until` its date |
| Add a deadline time-zone note | `deadlineNote`, e.g. `"All deadlines are 23:59 AoE."` (hidden while empty) |
| Add baseline results | `baseline.results`, e.g. `"2A-bn": 0.7123` (shown as TBA while `null`) |
| Update an organizer | `organizers`: name, role, affiliation, homepage `url`, `photo` path |
| Change a link (EvalAI, GitHub, Slack…) | `links` |

Tip: check the file is valid JSON after editing (a missing comma breaks the dynamic parts):
`python -m json.tool docs/data/site.json > /dev/null && echo OK`

Organizer photos: drop square JPEGs into `docs/assets/img/organizers/` with the file names listed in
that folder's README. Until a photo exists, initials are shown.

Text that rarely changes (task description, data format, submission steps, paper instructions,
citation) is written directly in `docs/index.html`; search for the section, e.g. `id="page-paper"`.

## Leaderboard

EvalAI does not allow other websites to call its API from the browser, so the leaderboard is
synced by the scheduled GitHub Action instead:

- Every hour it reads the **public** leaderboards of challenge 2738 and updates
  `docs/data/leaderboard.json`. It only commits when something changed.
- **Development phase** and **Test phase** tabs map to the two EvalAI phases. While a phase's
  leaderboard is hidden on EvalAI (the test phase until results are released), the site shows
  "Test phase results are not public yet" with the date from `leaderboard.testResultsDate`.
- To release the test results: make the test-phase leaderboard public on EvalAI (set the
  phase splits' visibility to public), then run the workflow manually or wait up to an hour.
- Entries are sorted by BERTScore F1. Submissions you mark as **baseline** on EvalAI are shown
  with a "baseline" tag and are not given a rank.
- GitHub pauses scheduled workflows in repositories with no activity for 60 days. If the
  "Updated" time stops moving, re-enable the workflow in the Actions tab.

To run the sync yourself: `python scripts/fetch_leaderboard.py` (standard library only).

## Preview locally

```bash
python -m http.server 8000 -d docs
# open http://localhost:8000
```
(Opening `index.html` directly as a file will not load the JSON data; use the command above.)

Each section has its own address, so you can link to it directly:
`…/blp27_task2/#dates`, `…/#leaderboard?phase=test&track=2B-all`.

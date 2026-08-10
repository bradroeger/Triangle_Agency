# Public-release checklist

Run this checklist before the first GitHub push and before each release.

## Copyright and private data

- Confirm `data/pdf/`, `data/assets/Playwall/`, and `data/playwall-content.json` are absent from `git status` and `git ls-files`.
- Confirm runtime files are absent: `data/state.json`, `data/access-log.jsonl`, `data/campaign-events.jsonl`, `backups/`, and `exports/`.
- Review employee and GM-message fixtures for real names, badge UIDs, contact details, or campaign secrets.
- Confirm every non-Playwall image, audio file, font, and code dependency may legally be redistributed. Keep attribution and licence notices where required.
- If protected files were ever committed, adding `.gitignore` is not enough: purge them from Git history before publishing, then rotate any exposed secrets.

## Quality

```powershell
npm ci
npm test
npm run lint
git status --short
git ls-files data/pdf data/assets/Playwall data/playwall-content.json
```

The final command must print nothing. Also inspect the GitHub diff itself before making the repository public.

## Repository metadata

- Choose and add a software licence; do not assume the game publisher's licence covers this code or bundled media.
- Add the repository URL, screenshots containing only redistributable material, and a concise project description.
- Enable dependency alerts and branch protection if collaborators will contribute.
- State clearly that this is an unofficial fan-made prop and that users must supply any copyright-controlled game content themselves.

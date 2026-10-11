# TODO

- Skill icons on each skill page header (above Game Guide) and inside the Game Guide still show Melvor art. Those screens use hard-coded image paths instead of getMediaURL, so the getMediaURL patch never sees them. Likely fix: swap matching <img> src values (skill icon paths in mapping.json) via a MutationObserver.

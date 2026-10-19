"""Turn exported review decisions into build/guesses.json."""
import argparse
import json
from collections import defaultdict

from build import BUILD_DIR

REVIEW_DIR = BUILD_DIR / "review"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("decisions", help="path to the exported decisions JSON")
    args = parser.parse_args()

    decisions = json.loads(open(args.decisions).read())
    resolved = json.loads((REVIEW_DIR / "resolved.json").read_text())
    path = BUILD_DIR / "guesses.json"
    guesses = defaultdict(dict, json.loads(path.read_text()) if path.exists() else {})

    approved, follow_up = 0, []
    for melvor_id, decision in decisions.items():
        pick = resolved.get(melvor_id)
        if decision.get("v") == "approve" and pick:
            guesses[pick["kind"]][melvor_id] = pick["title"]
            approved += 1
        elif decision.get("v") == "reject" or decision.get("note"):
            follow_up.append((melvor_id, decision.get("v"), pick and pick["osrs"], decision.get("note", "")))

    path.write_text(json.dumps({k: dict(sorted(v.items())) for k, v in sorted(guesses.items())}, indent=1) + "\n")
    print(f"{approved} approved picks written to {path.relative_to(BUILD_DIR.parent)}")
    for melvor_id, verdict, osrs, note in follow_up:
        print(f"follow up: {melvor_id} [{verdict}] pick={osrs!r} note={note!r}")


if __name__ == "__main__":
    main()

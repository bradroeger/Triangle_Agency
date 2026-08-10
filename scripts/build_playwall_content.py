"""Build supplemental application content records from the extracted Playwall manifest."""

import json
from pathlib import Path


manifest = json.loads(Path("data/assets/Playwall/manifest.json").read_text(encoding="utf-8"))
records = {}
for item in manifest:
    categories = {
        "Agency (Red)": ("agency", "AGENCY RED"),
        "Anomaly (Blue)": ("anomaly", "ANOMALY BLUE"),
        "Reality (Yellow)": ("reality", "REALITY YELLOW"),
    }
    if item["category"] not in categories:
        continue
    slug, classification = categories[item["category"]]
    designation = item["designation"]
    content_id = f"playwall-{slug}-{designation.lower()}"
    records[content_id] = {
        "type": "image",
        "title": item["title"],
        "classification": f"PLAYWALL // {classification}",
        "audience": "PUBLIC",
        "asset": f"Playwall/{item['category']}/images/{designation}.png",
        "alt": f"Unlocked {item['category']} Playwall document {designation}.",
    }

Path("data/playwall-content.json").write_text(
    json.dumps(records, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)
print(f"Registered {len(records)} supplemental Playwall documents")

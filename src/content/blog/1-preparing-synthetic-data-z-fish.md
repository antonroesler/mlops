---
title: "Preparing a Synthetic Dataset"
date: "2025-06-02"
tags: ["AWS", "Demo Use Case"]
description: "Walkthrough demo use case of generating synthetic data for a ML Pipeline"
useCase: "mlops-pipeline"
---

## The Use Case: 🧪 Predictive Bioinformatics — Longitudinal Zebra Fish Health Study

### 🔍 Objective

In this demo, we simulate a bioinformatics research scenario where researchers observe the development of zebra fish over time to understand the early-life indicators of a specific health condition. Each fish is monitored through imaging and metadata collection during its early life, and we later observe whether or not it developed a biological condition.

> The goal is to predict this future condition based on structured metadata and imaging data collected in the early stages of life.

To keep the demo simple and cost-effective, we'll use synthetic data and generate placeholder images via a Python script instead of using real biological datasets.

### 🧱 Simulated Data Design

To mirror a realistic research setting, the dataset is built to reflect:

- Incremental data ingestion: Fish hatch daily between April 1 and June 1, 2025.
- Longitudinal records: Each fish is observed and imaged at three time points — day 1, day 3, and day 5 after hatching.
- Delayed labeling: The outcome (condition developed or not) is only known and recorded 35 days after hatching.

This setup supports an authentic demonstration of MLOps principles, especially around delayed labels, time-based ingestion, and multi-source data fusion.

### 🗃️ Data Structure

Data is partitioned by date, with three main categories stored in S3-compatible folders:

#### 📂 `observations/day=YYYY-MM-DD/`

- Contains one JSON file per fish per time point.

- Example:

  ```json
  {
    "fish_id": "zfish_00001",
    "image_id": "zfish_00001_05",
    "timestamp": "2025-04-11T00:00:00Z",
    "age_days": 5,
    "treatment": "compound_x",
    "genetic_markers": { "gene_a": true, "gene_b": false, "gene_c": true },
    "length_mm": 4.62,
    "sex": "female"
  }
  ```

- Note: The `sex` field only appears for observations at **day 5**, to reflect real-world biological detectability. `length_mm` increases over time, simulating growth.

#### 🖼️ `images/day=YYYY-MM-DD/`

- Contains PNG files corresponding to the `image_id` in each observation.
- Image color is:

  - **White-ish** for fish without the condition.
  - **Increasingly red** over time for fish that will develop the condition — creating a time-dependent visual signal.

#### 📄 `outcomes/day=YYYY-MM-DD/`

- JSON file listing final health outcomes.
- Only available on the fish's **day 35**, if it occurs before June 1.
- Example:

  ```json
  {
    "fish_id": "zfish_00001",
    "condition_developed": true
  }
  ```

This setup lets us explore not just data processing, but also **label delay**, **partition-aware ingestion**, and **dataset curation for multimodal ML** — essential patterns in production-grade MLOps.

### Data Generation

Use the python script below to generate the data set locally.

```python
import os
import json
import random
from datetime import datetime, timedelta
from PIL import Image

# Configuration
start_date = datetime(2025, 4, 1)
end_date = datetime(2025, 6, 1)
fish_hatch_rate = 5
image_size = (8, 8)
output_dir = "synthetic_data"
obs_root = os.path.join(output_dir, "observations")
img_root = os.path.join(output_dir, "images")
label_root = os.path.join(output_dir, "outcomes")

treatments = ["compound_x", "compound_y", "placebo"]
sexes = ["male", "female"]
observation_days = [1, 3, 5]
label_day = 35

os.makedirs(obs_root, exist_ok=True)
os.makedirs(img_root, exist_ok=True)
os.makedirs(label_root, exist_ok=True)

fish_records = []
current_date = start_date
fish_counter = 0
outcomes_by_day = {}

while current_date <= end_date:
    date_str = current_date.strftime("%Y-%m-%d")
    obs_dir = os.path.join(obs_root, f"day={date_str}")
    img_dir = os.path.join(img_root, f"day={date_str}")
    os.makedirs(obs_dir, exist_ok=True)
    os.makedirs(img_dir, exist_ok=True)

    # Hatch new fish today
    for _ in range(fish_hatch_rate):
        fish_id = f"zfish_{fish_counter:05d}"
        fish_counter += 1
        fish_records.append(
            {
                "fish_id": fish_id,
                "hatch_date": current_date,
                "sex": random.choice(sexes),
                "treatment": random.choice(treatments),
                "genetic_markers": {
                    "gene_a": bool(random.getrandbits(1)),
                    "gene_b": bool(random.getrandbits(1)),
                    "gene_c": bool(random.getrandbits(1)),
                },
                "condition_developed": random.choice([True, False]),
            }
        )

    for fish in fish_records:
        age_days = (current_date - fish["hatch_date"]).days

        if age_days in observation_days:
            image_id = f"{fish['fish_id']}_{age_days:02d}"

            obs_data = {
                "fish_id": fish["fish_id"],
                "image_id": image_id,
                "timestamp": current_date.isoformat(),
                "age_days": age_days,
                "treatment": fish["treatment"],
                "genetic_markers": fish["genetic_markers"],
                "length_mm": round(
                    2.0 + 0.5 * age_days + random.uniform(-0.2, 0.2), 2
                ),  # simulate growth
            }

            if age_days >= 5:
                obs_data["sex"] = fish["sex"]

            obs_file = os.path.join(obs_dir, f"{fish['fish_id']}_{age_days:02d}.json")
            with open(obs_file, "w") as f:
                json.dump(obs_data, f, indent=2)

            if fish["condition_developed"]:
                # Increase red intensity with age
                red_base = 150 + int((age_days / 5) * 105)  # maps 1→171, 3→213, 5→255
                r = min(red_base, 255)
                g = random.randint(0, 50)
                b = random.randint(0, 50)
            else:
                r = random.randint(200, 255)
                g = random.randint(200, 255)
                b = random.randint(200, 255)

            img = Image.new("RGB", image_size, color=(r, g, b))
            img.save(os.path.join(img_dir, f"{image_id}.png"))

        if age_days == label_day:
            label_day_str = current_date.strftime("%Y-%m-%d")
            if label_day_str not in outcomes_by_day:
                outcomes_by_day[label_day_str] = []

            outcomes_by_day[label_day_str].append(
                {
                    "fish_id": fish["fish_id"],
                    "condition_developed": fish["condition_developed"],
                }
            )

    current_date += timedelta(days=1)

# Write outcome files
for day_str, outcome_list in outcomes_by_day.items():
    label_dir = os.path.join(label_root, f"day={day_str}")
    os.makedirs(label_dir, exist_ok=True)
    with open(os.path.join(label_dir, "outcomes.json"), "w") as f:
        json.dump(outcome_list, f, indent=2)

print(
    f"Synthetic data with time-varying features generated from {start_date.date()} to {end_date.date()}."
)
```

The shell script below allows to upload the data to an S3 bucket up to a certain point in time. This script will also convert the json objects to JSONL using `jq`, as that is easier to work with in Athena later on.

```bash
#!/bin/bash

# Usage: ./upload_to_s3.sh <local_data_dir> <s3_bucket> <bucket_prefix> <end_date>
# Example: ./upload_to_s3.sh synthetic_data my-data-bucket use-cases/fish-demo 2025-05-01

LOCAL_DIR="$1"
S3_BUCKET="$2"
BUCKET_PREFIX="$3"
END_DATE="$4"

echo "Uploading data from $LOCAL_DIR to s3://$S3_BUCKET until $END_DATE"

upload_partitioned_data() {
  local subdir="$1"
  local prefix="$2"

  find "$LOCAL_DIR/$subdir" -mindepth 1 -maxdepth 1 -type d | while read -r folder; do
    folder_name=$(basename "$folder")
    folder_date=${folder_name#day=}
    if [[ "$folder_date" < "$END_DATE" ]]; then
      # Compact JSON files before uploading
      tmp_dir=$(mktemp -d)
      cp -r "$folder/"* "$tmp_dir/"
      find "$tmp_dir" -name '*.json' -exec sh -c 'jq -c . "$0" > "$0.tmp" && mv "$0.tmp" "$0"' {} \;
      aws s3 cp "$tmp_dir" "s3://$S3_BUCKET/$BUCKET_PREFIX/$prefix/$folder_name/" --recursive
      rm -rf "$tmp_dir"
      echo "Uploaded $subdir/$folder_name"
    fi
  done
}

upload_partitioned_data "observations" "observations"
upload_partitioned_data "images" "images"
upload_partitioned_data "outcomes" "outcomes"

echo "✅ Upload complete up to $END_DATE"
```

For now we will upload all the data until May 10th 2025.

```shell
./upload_to_s3.sh synthetic_data my-data-bucket use-cases/fish-demo 2025-05-10
```

### ✅ Next Steps

We have now uploaded the first batch of our data into AWS S3. In the next step we will setup an ETL Pipeline with AWS Glue. Then we will be able to simulate continuos data ingestion. Do do this we will use the same upload script. To upload data until May 12th we run:

```shell
./upload_to_s3.sh synthetic_data my-data-bucket use-cases/fish-demo 2025-05-12
```

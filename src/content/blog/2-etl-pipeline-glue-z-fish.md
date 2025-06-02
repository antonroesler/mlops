---
title: "Building an ETL Pipeline with AWS Glue"
date: "2025-06-02"
tags: ["AWS", "Demo Use Case"]
description: "Walkthrough demo use case of generating synthetic data for a ML Pipeline"
useCase: "mlops-pipeline"
---

## Glue Database

We are now ready to register our datasets in the Glue Data Catalog so Athena and SageMaker can query and use them. We will create a new database in glue for our demo. Go to the console → Data Catalog → [Databases](https://console.aws.amazon.com/glue/home/v2/data-catalog/databases) → Add Database. Or simply run this cli command:

```shell
aws glue create-database --database-input '{"Name": "zebra_fish_demo"}'
```

## Ingestion: Crawlers

We will create Crawlers for:

- `observations/`
- `outcomes/`

Each crawler:

- Should point to the corresponding S3 prefix.
- Must enable date partition inference (e.g., day=2025-04-15).
- Should write to the zebra_fish_demo database.

> We will need to run the crawlers after each new upload to reflect schema changes or new partitions.

### Observation Data Crawler

Go to the console → Data Catalog → [Crawlers](https://console.aws.amazon.com/glue/home/v2/data-catalog/crawlers) → Add Crawler. Add a S3 data source: e.g. `s3://my-data-bucket/use-cases/fish-demo/observations`. In the next step let AWS create a new IAM role, e.g. `AWSGlueServiceRole-fish-demo`. Choose the earlier created `zebra_fish_demo` DB as Target database and choose to run the crawler on demand. Create the crawler and run it, this action should take about a minute to complete.

Glue will now scan our data and infer the schema. It will not copy or store the data anywhere, but only list it in the catalog. Next we will use AWS Athena to serverlessly query our data. Open the [Athena query editor](https://console.aws.amazon.com/athena/home/query-editor) → Choose AwsDataCatalog as Data Source → `zebra_fish_demo` as Database. We can then run the following SQL query.

```sql
SELECT * FROM "zebra_fish_demo"."observations" limit 10;
```

This should give you a result with 10 rows and the columns: ` fish_id` `image_id` `timestamp` `age_days` `treatment` `genetic_markers` `length_mm` `sex` `day`

### Outcomes Data Crawler

Create the crawler the same way for source `s3://my-data-bucket/use-cases/fish-demo/outcomes`. You can use the same `AWSGlueServiceRole-fish-demo` IAM role, but will need to update it's permissions to also include the `/outcomes/*` prefix. Note that the outcomes data files contain multiple json object per file whereas the observations each contain a single object. The glue crawler will still handle that fine.

Running

```sql
SELECT * FROM "zebra_fish_demo"."outcomes" limit 3;
```

will result in a table like:

| #   | fish_id     | condition_developed | day        |
| --- | ----------- | ------------------- | ---------- |
| 1   | zfish_00015 | true                | 2025-05-09 |
| 2   | zfish_00016 | false               | 2025-05-09 |
| 3   | zfish_00017 | false               | 2025-05-09 |

## Transformation

Now that we’ve ingested and cataloged our structured observation and outcome data using AWS Glue and Athena, it’s time to prepare it for machine learning workflows.

While JSON is convenient for raw data interchange, it’s not ideal for efficient querying or model training at scale. To optimize performance, we'll transform our data into **columnar Parquet format** — a best practice for large-scale analytics and ML workloads.

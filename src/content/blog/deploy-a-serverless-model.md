---
title: "Deploying a Serverless Model on AWS SageMaker – A Complete Walkthrough"
date: "2025-06-22"
tags: ["AWS", "SageMaker", "Model Deployment", "Serverless"]
description: "Complete walkthrough of training and deploying a serverless machine learning model on AWS SageMaker with cost-effective infrastructure"
---

## Introduction

This comprehensive walkthrough demonstrates how to deploy a serverless machine learning model using AWS SageMaker. We'll cover the complete pipeline from data preparation and model training to serverless deployment and invocation.

The entire codebase for this tutorial is available in the [sagemaker-model-deployment repository](https://github.com/antonroesler/sagemaker-model-deployment). One of the most compelling aspects of this approach is its cost-effectiveness—the entire AWS resource consumption for data storage, model training, and inference costs less than $0.05.

## Prerequisites

### Python Environment Manager (uv)

This walkthrough uses [uv](https://docs.astral.sh/uv/) as the Python package and project manager to install dependencies and run scripts locally. While uv is not strictly required, it provides fast dependency resolution and consistent environment management. You can substitute with `pip` if preferred.

### S3 Bucket Setup

You'll need an S3 bucket to store your training data, model artifacts, and code packages. You can either create a new bucket or use an existing one.

**Bucket Organization:**

- Choose a meaningful prefix for organizing your project resources (e.g., `use-cases/sensors`)
- All data, code, and model artifacts for this walkthrough will be stored under this prefix
- This approach helps maintain clean separation between different projects and use cases

**S3 structure for our data:**

```
your-bucket/
└── use-cases/sensors/
    ├── data/           # Training datasets (sensor_data_1.csv)
    └── code/           # Training scripts (train.tar.gz)
```

### IAM Role Configuration

To begin, you'll need a SageMaker execution role with appropriate S3 permissions. The role must have at least `GetObject` and `PutObject` permissions for your designated S3 bucket and prefix:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::your-bucket/prefix/*"
    }
  ]
}
```

### Environment Configuration

Create an `.env` file and fill the required variables:

```
REGION=eu-central-1
BUCKET_NAME=your-bucket
PREFIX=use-cases/sensors
SAGEMAKER_ROLE_ARN="arn:aws:iam::XXXXXXXX:role/SageMakerExecutionRole-SensorData"
PROJECT_NAME=sensor-use-case
```

`PROJECT_NAME` is merely used to name resources such as the inference endpoint.

## Dataset Creation and S3 Upload

For this demonstration, we'll generate synthetic sensor data in CSV format and upload it directly to S3. Rather than using AWS Glue for data cataloging, we'll focus specifically on the model deployment workflow.

The dataset generation script ([create-dataset.py](https://github.com/antonroesler/sagemaker-model-deployment/blob/main/src/create-dataset.py)) creates data where the target label is statistically derived from the sensor readings, ensuring our trained model will have meaningful patterns to learn:

```python
# Generate synthetic sensor data with statistical relationships
logit = 1.5 * sensor_1 + 2.0 * sensor_2 - 1.0 * sensor_3 + np.random.normal(0, 1, n_samples)
prob = 1 / (1 + np.exp(-logit))
label = (prob > 0.5).astype(int)

df = pd.DataFrame({
    "sensor_1": sensor_1,
    "sensor_2": sensor_2,
    "sensor_3": sensor_3,
    "label": label
})
```

To create and upload the first dataset, run:

```shell
uv run src/create-dataset.py -n 1
```

**Output:** `Data uploaded to s3://your-bucket/prefix/data/sensor_data_1.csv`

The generated CSV file contains 1,000 records with the following structure:

```csv
sensor_1,sensor_2,sensor_3,label
0.4967141530112327,1.699677718293001,-1.5401426199795054,1
-0.13826430117118466,1.4623168414563845,-1.1156149365724142,1
0.6476885381006925,1.0298151849600872,-1.633935936799969,1
```

## Model Training with SageMaker

AWS SageMaker provides multiple approaches for model training, with **Training Jobs** serving as the fundamental unit of work. Each Training Job is defined by three core components: input data, an algorithm container, and compute resources.

With our input data already stored in S3, SageMaker will manage the compute resources automatically. However, we need to provide the algorithm container, which requires packaging our training code.

### Preparing the Training Code

Our training script, located at `src/train.py`, contains the model training logic. We'll package this code as a tar.gz archive and upload it to S3 for SageMaker to use in creating the algorithm container. While our example uses a single script, this approach scales to entire codebases.

```shell
tar -czvf train.tar.gz -C src train.py
```

Next, upload the training code to S3 (assuming your `.env` file has been sourced):

```shell
aws s3 cp train.tar.gz s3://$BUCKET_NAME/$PREFIX/code/
```

### Orchestrating with SageMaker Pipelines

To coordinate the training process, we'll use SageMaker Pipelines—a fully managed CI/CD service for machine learning. SageMaker Pipelines enable you to define, automate, and manage end-to-end ML workflows using modular steps such as data preprocessing, training, and evaluation. They provide comprehensive orchestration and tracking for the entire ML lifecycle with built-in support for versioning, lineage, and reuse.

SageMaker Pipelines can be defined using the Python SDK and executed from your local machine, provided you have properly configured AWS credentials.

Our training pipeline is defined in the [training.py](https://github.com/antonroesler/sagemaker-model-deployment/blob/main/src/pipeline/training.py) script. Here, we configure the algorithm container by specifying our code entry point and dependencies, including scikit-learn version 1.2.1. We also define the compute instance type as `ml.m5.large`.

The script constructs the S3 paths for both code and data based on your environment variables:

```python
# Construct S3 paths from environment variables
code_s3_path = f"s3://{bucket_name}/{prefix}/code/train.tar.gz"
data_s3_path = f"s3://{bucket_name}/{prefix}/data/"

# Estimator configuration
sklearn_estimator = SKLearn(
    entry_point="train.py",
    source_dir=code_s3_path,
    role=role,
    instance_type="ml.m5.large",
    framework_version="1.2-1",
    py_version="py3",
    sagemaker_session=session,
    base_job_name="sensor-model-training",
    hyperparameters={},
)
```

### Executing the Training Job

We initiate the training process by calling the `fit()` method and passing the input data path. This call triggers a Training Job in AWS SageMaker. Upon completion, SageMaker automatically saves the trained model artifact to its default S3 bucket (not your project bucket). For convenience, we save this artifact path to a local file for use in the deployment stage, though you can also retrieve it from the Training Job details in the AWS console.

```python
# Launch training job
sklearn_estimator.fit({"train": data_s3_path})

# Save model artifact path for next stage (deployment)
model_artifact_uri = sklearn_estimator.model_data
with open("model_artifact_path.txt", "w") as f:
    f.write(model_artifact_uri)
```

Execute the training pipeline with:

```shell
uv run src/pipeline/training.py
```

The output provides real-time training information and performance metrics:

```
Loaded 1000 samples from 1 files.
Classification Report:
              precision    recall  f1-score   support

           0       0.77      0.53      0.62        19
           1       0.95      0.98      0.97       181

    accuracy                           0.94       200
   macro avg       0.86      0.75      0.80       200
weighted avg       0.93      0.94      0.93       200

Model saved to /opt/ml/model/model.joblib
2025-06-20 16:08:10,706 sagemaker-containers INFO Reporting training SUCCESS

2025-06-20 16:08:32 Uploading - Uploading generated training model
2025-06-20 16:08:32 Completed - Training job completed
Billable seconds: 109
```

The training job completed successfully in just 109 billable seconds (under 2 minutes), demonstrating the efficiency of SageMaker's managed training infrastructure. Our model achieved 94% accuracy on the validation set, indicating it successfully learned the synthetic data patterns.

## Model Deployment to Serverless Endpoint

With our model successfully trained and the artifacts saved to S3, we can now proceed to deployment. The next step involves deploying our trained model to a serverless endpoint.

We'll continue using SageMaker for this process, as it provides excellent deployment orchestration capabilities. While we could combine training and deployment in a single pipeline script, maintaining separate processes offers several advantages:

- **Faster iteration**: Debug deployment issues without retraining
- **Cost efficiency**: Avoid unnecessary training costs during deployment troubleshooting
- **Flexibility**: Deploy different model versions independently

### Creating the Inference Script

Model deployment requires an inference script or container to handle prediction requests. Our implementation is minimal yet complete:

The [inference.py](https://github.com/antonroesler/sagemaker-model-deployment/blob/main/src/inference.py) script provides the necessary functions:

```python
import joblib
import io
import os
import pandas as pd


def model_fn(model_dir):
    model = joblib.load(os.path.join(model_dir, "model.joblib"))
    return model


def input_fn(input_data, content_type):
    return pd.read_csv(io.StringIO(input_data))


def predict_fn(input_data, model):
    return model.predict(input_data)


def output_fn(prediction, accept):
    return ",".join(str(int(p)) for p in prediction)
```

### Deployment Pipeline Configuration

Our deployment pipeline, defined in [src/pipeline/deployment.py](https://github.com/antonroesler/sagemaker-model-deployment/blob/main/src/pipeline/deployment.py), references the inference script locally. The AWS SageMaker SDK automatically handles the upload to SageMaker for us.

First, we create a SageMaker model object using the saved model artifact from the training job:

```python
# Read model artifact path from training stage
with open("model_artifact_path.txt", "r") as f:
    model_artifact_uri = f.read().strip()

# Create SageMaker model
model = SKLearnModel(
    model_data=model_artifact_uri,
    role=role,
    entry_point="src/inference.py",
    framework_version="1.2-1",
    py_version="py3",
    sagemaker_session=session,
)
```

### Model Registry Registration

Next, we register the model in the SageMaker Model Registry, which provides version tracking capabilities for easy rollbacks and comparisons:

```python
model_package = model.register(
    content_types=["text/csv"],
    response_types=["text/csv"],
    inference_instances=["ml.m5.large"],
    model_package_group_name=f"{project_name}-model-group",
    approval_status="Approved",
    description=f"v1 of {project_name} model",
)
```

### Serverless Endpoint Deployment

Finally, we deploy the model to a serverless endpoint with optimized configuration for cost and performance:

```python
serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=1024,
    max_concurrency=1
)

predictor = model.deploy(
    endpoint_name=f"{project_name}-model-endpoint",
    serverless_inference_config=serverless_config,
)
```

### Executing the Deployment

Run the deployment pipeline:

```shell
uv run src/pipeline/deployment.py
```

**Expected output:**

```
Model registered: arn:aws:sagemaker:eu-central-1:XXXX:model-package/SensorModelGroup/3
INFO:sagemaker:Creating model with name: sagemaker-scikit-learn-2025-06-20-16-09-03-579
INFO:sagemaker:Creating endpoint-config with name sensor-use-case-model-endpoint-config
INFO:sagemaker:Creating endpoint with name sensor-use-case-model-endpoint
```

## Model Invocation

### Locating the Endpoint URL

Once deployment is complete, you can find your endpoint's invocation URL in the [SageMaker Endpoints console](https://console.aws.amazon.com/sagemaker/home?#/endpoints). The URL follows this pattern:

```
https://runtime.sagemaker.{region}.amazonaws.com/endpoints/{endpoint-name}/invocations
```

For our example:

```
https://runtime.sagemaker.eu-central-1.amazonaws.com/endpoints/sensor-use-case-model-endpoint/invocations
```

### Making Predictions

With the endpoint deployed and accessible, you can now send inference requests. Our repository includes a sample invocation script:

```shell
uv run src/invoke.py
```

**Sample response:**

```
Prediction: 1
```

## Conclusion

This walkthrough demonstrates a complete serverless machine learning deployment pipeline using AWS SageMaker. We've covered the entire journey from data preparation to model invocation:

1. **Data Generation**: Created synthetic sensor data with realistic statistical relationships
2. **Model Training**: Used SageMaker Training Jobs with scikit-learn for efficient model development
3. **Serverless Deployment**: Deployed the model to a cost-effective serverless endpoint
4. **Model Invocation**: Successfully tested the deployed model with real-time predictions

The entire process—from synthetic data generation to model training and serverless deployment—costs less than $0.05, making it an extremely cost-effective solution for both prototyping and production deployments with variable traffic patterns.

### Key Benefits

- **Cost Efficiency**: Pay only for actual inference requests, with no idle compute costs
- **Automatic Scaling**: Handles traffic spikes seamlessly without manual intervention
- **Simplified Management**: No need to provision, configure, or manage compute instances
- **Version Control**: Built-in model registry enables easy rollbacks and version comparisons
- **Full Automation**: End-to-end pipeline automation using SageMaker Pipelines

The complete source code is available in the [GitHub repository](https://github.com/antonroesler/sagemaker-model-deployment), providing a production-ready foundation for your serverless ML deployments.

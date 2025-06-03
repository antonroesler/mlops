# Portfolio & Blog

My personal portfolio and blog built with Astro, focusing on MLOps and machine learning engineering topics.

## Project Structure

```
/
├── public/              # Static assets
├── src/
│   ├── components/      # Reusable Astro components
│   │   ├── About.astro  # About section component
│   │   ├── Hero.astro   # Hero section component
│   │   └── ...         # Other components
│   ├── layouts/         # Page layouts
│   │   ├── Layout.astro # Base layout
│   │   └── BlogPost.astro # Blog post layout
│   └── pages/          # Routes and pages
│       ├── blog/       # Blog posts
│       ├── index.astro # Homepage
│       └── ...        # Other pages
└── package.json        # Project dependencies
```

## Development

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Adding Blog Posts

1. Create a new `.md` file in `src/content/blog/`
2. Use the following frontmatter template:

```markdown
---
title: "Post Title"
date: "YYYY-MM-DD"
tags: ["Tag1", "Tag2"]
description: "Brief description of your post"
---

## Content Here

Post content in Markdown...
```

### Blog Post Guidelines

- Use descriptive filenames (e.g., `implementing-ml-pipelines.md`)
- Include metadata (title, date, tags, description)
- Structure content with clear headings (h2, h3)
- Add images to `/public/blog/` directory
- Reference images using absolute paths: `/blog/image-name.jpg`

## AWS Infrastructure

### Prerequisites

1. AWS CLI installed and configured
2. Required permissions to create:
   - S3 buckets
   - CloudFront distributions
   - IAM roles

### Setup

1. Provision an S3 bucket and optional CloudFront distribution. Infrastructure
   is managed outside this repository (for example via Terraform or the AWS
   console).

2. Note the CloudFront distribution domain name from the AWS console or your
   provisioning output.

3. Configure GitHub repository secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`
   - `S3_BUCKET`
   - `CLOUDFRONT_DISTRIBUTION_ID`

### Deployment Process

1. Push changes to the `main` branch
2. GitHub Actions workflow:
   - Builds the project
   - Uploads to S3
   - Invalidates CloudFront cache

### Versioning

Each deployment is assigned an incremental version number (`v1`, `v2`, ...)
based on the commit count of the `main` branch. The value is exposed during the
build as the `PUBLIC_DEPLOY_VERSION` environment variable and shown in the page
footer for quick verification.

## Development Guidelines

- Follow Astro's best practices
- Use TypeScript for type safety
- Keep components small and focused
- Test locally before deploying
- Update dependencies regularly

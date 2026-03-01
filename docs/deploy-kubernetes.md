# ☸️ Kubernetes Deployment Guide

Deploy **mongodb-search** to a Kubernetes cluster.

## 📋 Prerequisites

- `kubectl` configured and pointing to your cluster
- A container registry (Docker Hub, ECR, GCR, etc.)
- MongoDB Atlas connection string (or any MongoDB 7+ replica set)
- NGINX Ingress Controller *(optional, only if using Ingress)*

## 🏗️ 1. Build & Push the Docker Image

```bash
docker build -t <your-registry>/mongodb-search:latest .
docker push <your-registry>/mongodb-search:latest
```

> 💡 Replace `<your-registry>` with your actual registry, e.g. `docker.io/myuser`.

## 🔐 2. Configure Secrets

Edit `iac/secrets.yaml` and replace every `REPLACE_WITH_BASE64_ENCODED_VALUE` with your actual values:

```bash
# Encode a value to base64
echo -n "mongodb+srv://user:pass@host/db" | base64
```

Key secrets to set:
| Key | Description |
|-----|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `VOYAGE_API_KEY` | VoyageAI embedding API key |
| `AWS_ACCESS_KEY_ID` | MinIO / S3 access key |
| `AWS_SECRET_ACCESS_KEY` | MinIO / S3 secret key |

## ⚙️ 3. Review the ConfigMap

Edit `iac/configmap.yaml` if you need to change any non-sensitive setting (database name, models, endpoints, etc.).

## 🖼️ 4. Update Image References

In both `iac/agent-web.yaml` and `iac/agent-watch.yaml`, replace:

```yaml
image: mongodb-search:latest
```

with your pushed image:

```yaml
image: <your-registry>/mongodb-search:latest
```

## 🚀 5. Deploy

Apply all manifests in order:

```bash
# Create namespace
kubectl apply -f iac/namespace.yaml

# Secrets & config
kubectl apply -f iac/secrets.yaml
kubectl apply -f iac/configmap.yaml

# Infrastructure services
kubectl apply -f iac/ollama.yaml
kubectl apply -f iac/minio.yaml

# Application
kubectl apply -f iac/agent-web.yaml
kubectl apply -f iac/agent-watch.yaml

# (Optional) Ingress
kubectl apply -f iac/ingress.yaml
```

Or deploy everything at once:

```bash
kubectl apply -f iac/
```

## ✅ 6. Verify

```bash
# Check all pods are running
kubectl get pods -n mongodb-search

# Check services
kubectl get svc -n mongodb-search

# View agent-web logs
kubectl logs -n mongodb-search -l app=agent-web --tail=50

# View agent-watch logs
kubectl logs -n mongodb-search -l app=agent-watch --tail=50
```

## 🌐 7. Access the API

**Option A — Port forward** (quick local access):

```bash
kubectl port-forward -n mongodb-search svc/agent-web 3000:80
# API available at http://localhost:3000
```

**Option B — Ingress** (production):

Point your DNS to the Ingress controller IP and access via the configured host (default: `mongodb-search.local`).

## 🔄 8. Update Deployment

After pushing a new image:

```bash
kubectl rollout restart deployment/agent-web  -n mongodb-search
kubectl rollout restart deployment/agent-watch -n mongodb-search
```

## 🗑️ 9. Tear Down

```bash
kubectl delete -f iac/
```

## 📁 Manifest Overview

| File | Resources |
|------|-----------|
| `namespace.yaml` | Namespace |
| `secrets.yaml` | Secret (credentials & API keys) |
| `configmap.yaml` | ConfigMap (app settings) |
| `ollama.yaml` | Deployment + Service + PVC + Job |
| `minio.yaml` | Deployment + Service + PVC |
| `agent-web.yaml` | Deployment (×2 replicas) + Service |
| `agent-watch.yaml` | Deployment (×1 replica, worker) |
| `ingress.yaml` | Ingress (optional) |

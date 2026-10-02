# Category Rules: Infra

1. Immutability & Reproducibility: Infrastructure code must be declarative and reproducible. Pin base images and package hashes.
2. Least Privilege: Grant minimum required IAM roles, network ingress rules, and file permissions.
3. Secret Separation: Never bake API keys or secrets into Docker images or state files; use external secret managers.
4. Non-Destructive Apply: Require confirmation before running destructive operations (`terraform destroy`, `kubectl delete ns`).

---
scope: "infrastructure"
---

# Infrastructure & DevOps Rules

- [INFRA-001] Manage all computing, storage, and networking resources via declarative Infrastructure as Code (IaC) committed to version control.
- [INFRA-002] Treat cloud infrastructure as immutable: deploy new versioned instances or containers rather than applying ad-hoc in-place mutations.
- [INFRA-003] Enforce least-privilege IAM policies, scoped service accounts, and short-lived credentials for all automated deployment pipelines.
- [INFRA-004] Implement zero-trust networking: isolate internal services within private VPC subnets with explicit ingress and egress firewall rules.
- [INFRA-005] Store secrets in managed key vaults (e.g. AWS Secrets Manager, Vault) and inject them as runtime environment variables, never baking secrets into container images.
- [INFRA-006] Define explicit CPU/memory resource requests and limits on all container specifications to prevent noisy neighbor degradation.
- [INFRA-007] Configure automated health probes (liveness, readiness, startup) for all orchestrator-managed services.
- [INFRA-008] Run containerized workloads as unprivileged non-root users with read-only root filesystems wherever practical.
- [INFRA-009] Implement centralized logging, tracing, and metric collection with alert thresholds defined for SLO/SLA violations.
- [INFRA-010] Require automated backup schedules and routinely test backup restoration procedures for all persistent databases and storage volumes.
- [INFRA-011] Use zero-downtime deployment strategies (blue/green, canary, or rolling updates) with automatic rollback on elevated 5xx error rates.
- [INFRA-012] Enforce encryption at rest for all storage volumes, databases, and message queues using customer-managed or cloud-provider KMS keys.
- [INFRA-013] Enforce encryption in transit across all internal service-to-service communication via mutual TLS (mTLS).
- [INFRA-014] Ensure disaster recovery runbooks are documented, version-controlled, and audited through regular chaos and failover testing.
- [INFRA-015] Pin all third-party base container image digests (`@sha256:...`) and run continuous vulnerability scanning on build pipelines.

---
scope: "data-ml"
---

# Data Engineering & Machine Learning Rules

- [DATA-001] Guarantee pipeline reproducibility: fix random seeds across training runs, pin library versions, and version input data snapshots.
- [DATA-002] Validate schemas and enforce strict type contracts at data ingestion boundaries using tools like Great Expectations or Pydantic.
- [DATA-003] Scrub all personally identifiable information (PII) and sensitive attributes before persisting data in training sets or analytics lakes.
- [DATA-004] Separate feature engineering code strictly from model architecture code to allow independent testing, reuse, and evaluation.
- [DATA-005] Track every training run, model artifact, hyperparameter set, and evaluation metric using an experiment tracking ledger (e.g. MLflow, Weights & Biases).
- [DATA-006] Benchmark baseline performance metrics (accuracy, F1, precision, recall, latency) against reference datasets before promoting models to staging or production.
- [DATA-007] Prevent data leakage: perform all transformations, normalizations, and encodings strictly within cross-validation folds.
- [DATA-008] Prefer vectorized array operations (NumPy, Polars, Pandas) over row-by-row procedural loops for all data processing tasks.
- [DATA-009] Stream and process large datasets in memory-bounded batches or partitions to avoid Out-Of-Memory (OOM) kernel panics.
- [DATA-010] Implement data lineage and provenance tracking from raw ingestion sources to downstream materialized views and feature stores.
- [DATA-011] Monitor inference pipelines in production for data drift, concept drift, missing value spikes, and anomalous prediction distributions.
- [DATA-012] Benchmark and enforce maximum latency bounds for online inference endpoints, offloading long-running predictions to async batch queues.
- [DATA-013] Provide graceful fallback mechanisms (rule-based defaults or cached predictions) whenever ML inference services timeout or fail.
- [DATA-014] Ensure model weights, tokenizers, and configuration files are versioned together as an atomic deployable bundle.
- [DATA-015] Write automated unit tests for data transforms verifying edge cases: null values, zero division, empty strings, and out-of-bounds timestamps.

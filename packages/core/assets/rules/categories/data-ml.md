# Category Rules: Data/ML

1. Determinism & Seeding: Set random seeds explicitly for reproducibility across training, evaluation, and data transformations.
2. Data Leakage Prevention: Strictly separate training, validation, and test splits prior to fitting feature transformers.
3. Resource Management: Release GPU memory and batch generators explicitly. Monitor memory consumption.
4. Schema & Format Validation: Verify data schemas and missing values early in data pipelines.

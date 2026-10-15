"""Read-only dataset loading; no implicit persistence or provider calls."""

from .loader import Dataset, DatasetLoadError, aggregate_report, load_dataset

__all__ = ["Dataset", "DatasetLoadError", "aggregate_report", "load_dataset"]

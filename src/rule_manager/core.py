"""Core rule evaluation helpers."""


def evaluate_rule(value: int, threshold: int) -> bool:
    """Return True when value meets or exceeds threshold."""
    return value >= threshold

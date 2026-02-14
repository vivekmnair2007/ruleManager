"""CLI entrypoint for quick manual checks."""

from .core import evaluate_rule


def main() -> None:
    sample_value = 10
    sample_threshold = 7
    result = evaluate_rule(sample_value, sample_threshold)
    print(f"Rule check: {sample_value} >= {sample_threshold} -> {result}")


if __name__ == "__main__":
    main()

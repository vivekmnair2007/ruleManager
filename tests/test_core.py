import unittest

from rule_manager import evaluate_rule


class TestEvaluateRule(unittest.TestCase):
    def test_returns_true_when_value_equals_threshold(self) -> None:
        self.assertTrue(evaluate_rule(5, 5))

    def test_returns_true_when_value_exceeds_threshold(self) -> None:
        self.assertTrue(evaluate_rule(9, 5))

    def test_returns_false_when_value_is_below_threshold(self) -> None:
        self.assertFalse(evaluate_rule(3, 5))


if __name__ == "__main__":
    unittest.main()

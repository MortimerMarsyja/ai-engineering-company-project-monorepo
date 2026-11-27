import numpy as np

from metrics import gini_regression, population_stability_index, wape


def test_wape_zero_for_perfect_prediction():
    y = np.array([100.0, 200.0, 300.0])
    assert wape(y, y) == 0.0


def test_gini_regression_perfect_ranking_is_one():
    y = np.array([10.0, 20.0, 30.0, 40.0])
    assert np.isclose(gini_regression(y, y), 1.0)


def test_gini_regression_reversed_ranking_is_low():
    y = np.array([10.0, 20.0, 30.0, 40.0])
    reversed_pred = y[::-1]
    assert gini_regression(y, reversed_pred) < gini_regression(y, y)


def test_psi_zero_for_identical_distributions():
    rng = np.random.default_rng(0)
    sample = rng.normal(size=500)
    assert abs(population_stability_index(sample, sample)) < 1e-6

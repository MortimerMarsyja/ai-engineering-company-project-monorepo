import numpy as np

from data_prep import load_sales_data
from features import TARGET_COLUMN
from features_growth import (
    GROWTH_FEATURE_COLUMNS,
    GROWTH_TARGET_COLUMN,
    build_growth_features,
    drop_rows_without_full_growth_history,
    reconstruct_revenue,
)


def test_growth_target_matches_definition():
    df = build_growth_features(load_sales_data())
    full = df.dropna(subset=["lag_12"]).reset_index(drop=True)
    expected = full[TARGET_COLUMN] / full["lag_12"] - 1
    assert np.allclose(full[GROWTH_TARGET_COLUMN], expected)


def test_growth_features_only_see_the_past():
    """growth_lag_1/growth_lag_12 at row i must equal the growth rate
    actually realized at an earlier row — never row i's own yoy_growth."""
    df = build_growth_features(load_sales_data())
    clean = drop_rows_without_full_growth_history(df)
    for i in range(12, len(clean)):
        assert np.isclose(clean["growth_lag_1"].iloc[i], clean[GROWTH_TARGET_COLUMN].iloc[i - 1])
        assert np.isclose(clean["growth_lag_12"].iloc[i], clean[GROWTH_TARGET_COLUMN].iloc[i - 12])


def test_no_contemporaneous_revenue_feature():
    """The raw, current-month revenue_usd must never appear among the
    growth model's features — only the lagged anchor (lag_12) is allowed."""
    assert TARGET_COLUMN not in GROWTH_FEATURE_COLUMNS
    assert GROWTH_TARGET_COLUMN not in GROWTH_FEATURE_COLUMNS


def test_drop_rows_without_full_growth_history_leaves_96_rows():
    df = build_growth_features(load_sales_data())
    clean = drop_rows_without_full_growth_history(df)
    assert len(clean) == len(load_sales_data()) - 24
    assert clean[GROWTH_FEATURE_COLUMNS].isna().sum().sum() == 0


def test_reconstruct_revenue_is_exact_inverse_of_growth_definition():
    """reconstruct_revenue(df, true_growth) must recover the true revenue_usd exactly."""
    df = build_growth_features(load_sales_data())
    clean = drop_rows_without_full_growth_history(df)
    reconstructed = reconstruct_revenue(clean, clean[GROWTH_TARGET_COLUMN])
    assert np.allclose(reconstructed, clean[TARGET_COLUMN])

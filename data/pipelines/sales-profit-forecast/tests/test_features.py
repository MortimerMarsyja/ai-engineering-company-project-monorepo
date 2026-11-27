import numpy as np

from data_prep import load_sales_data
from features import FEATURE_COLUMNS, build_features, drop_rows_without_full_history


def test_no_leakage_columns():
    """covers_served and avg_ticket_usd must never appear as model features."""
    assert "covers_served" not in FEATURE_COLUMNS
    assert "avg_ticket_usd" not in FEATURE_COLUMNS


def test_lag_and_rolling_only_see_the_past():
    df = build_features(load_sales_data())
    # Row i's lag_1 must equal row (i-1)'s actual revenue — never its own.
    for i in range(12, len(df)):
        assert df["lag_1"].iloc[i] == df["revenue_usd"].iloc[i - 1]
        assert df["lag_12"].iloc[i] == df["revenue_usd"].iloc[i - 12]
        expected_roll_3 = df["revenue_usd"].iloc[i - 3 : i].mean()
        assert np.isclose(df["roll_mean_3"].iloc[i], expected_roll_3)


def test_drop_rows_without_full_history_leaves_108_rows():
    df = build_features(load_sales_data())
    clean = drop_rows_without_full_history(df)
    assert len(clean) == len(load_sales_data()) - 12
    assert clean[FEATURE_COLUMNS].isna().sum().sum() == 0

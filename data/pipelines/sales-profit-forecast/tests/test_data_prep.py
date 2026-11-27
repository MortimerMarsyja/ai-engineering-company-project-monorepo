from data_prep import load_sales_data


def test_loads_sorted_and_complete():
    df = load_sales_data()
    assert df["month"].is_monotonic_increasing
    assert df["month"].dt.is_month_start.all()
    assert not df["month"].duplicated().any()


def test_no_missing_months():
    df = load_sales_data()
    import pandas as pd

    expected = pd.date_range(df["month"].min(), df["month"].max(), freq="MS")
    assert list(df["month"]) == list(expected)

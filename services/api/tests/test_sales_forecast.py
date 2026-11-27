"""GET /sales-forecast — reads data/process/sales-profit-forecast/ off disk
(no database), so these tests don't need Supabase connectivity.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import sales_forecast as sales_forecast_service

client = TestClient(create_app())


def test_requires_authentication():
    res = client.get("/api/v1/sales-forecast")
    assert res.status_code in (401, 403)


@pytest.mark.skipif(
    sales_forecast_service.get_sales_forecast() is None,
    reason="sales-profit-forecast pipeline has not been run in this environment",
)
def test_service_payload_matches_response_schema():
    from app.models.schemas import SalesForecastResponse

    data = sales_forecast_service.get_sales_forecast()
    response = SalesForecastResponse.model_validate(data)
    assert response.best_model.winner in {
        "random_forest_revenue",
        "random_forest_growth",
        "seasonal_naive",
    }
    assert len(response.forecast) == 12
    assert len(response.test_period.months) == len(response.test_period.actual)


def test_returns_none_when_output_files_absent(tmp_path, monkeypatch):
    monkeypatch.setattr(sales_forecast_service, "_METRICS_PATH", tmp_path / "metrics.json")
    monkeypatch.setattr(sales_forecast_service, "_FORECAST_PATH", tmp_path / "forecast.csv")
    monkeypatch.setattr(sales_forecast_service, "_PREDICTIONS_PATH", tmp_path / "predictions.json")
    assert sales_forecast_service.get_sales_forecast() is None

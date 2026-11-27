"""Sales forecast router — serves `data/pipelines/sales-profit-forecast`'s
output for the backoffice dashboard.

One read-only endpoint over plain files on disk (see
`app/services/sales_forecast.py`'s docstring for why this pipeline, unlike
`reporting.py`'s weekly-location-performance, doesn't live in Supabase).
Same `require_staff` gate as the other operational-reporting endpoints
(`GET /reporting/weekly-location-performance`, `GET /telemetry/report`).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_staff
from app.models.schemas import SalesForecastResponse
from app.services import sales_forecast as sales_forecast_service

router = APIRouter(prefix="/sales-forecast", tags=["sales-forecast"])


@router.get("", response_model=SalesForecastResponse)
async def get_sales_forecast(current_user: dict = Depends(require_staff)) -> SalesForecastResponse:
    """The three-way model comparison (original RandomForest, YoY-growth
    RandomForest, seasonal-naive baseline) plus the winning model's
    12-month forecast. 404 if `pipeline.py` has never been run.
    """
    data = sales_forecast_service.get_sales_forecast()
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No sales forecast available yet — the sales-profit-forecast "
                "pipeline hasn't been run (data/pipelines/sales-profit-forecast/pipeline.py)."
            ),
        )
    return SalesForecastResponse.model_validate(data)

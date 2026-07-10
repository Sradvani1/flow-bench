from typing import Optional

from fastapi import APIRouter, Query

from services.orchestrator.store.event_log import EventLog

router = APIRouter(tags=["events"])


@router.get("/events")
async def get_events(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    level: Optional[str] = Query(None),
):
    event_log = EventLog(".")
    events, total = event_log.read_paginated(
        offset=offset, limit=limit, level=level
    )
    return {
        "events": events,
        "total": total,
        "offset": offset,
        "limit": limit,
    }

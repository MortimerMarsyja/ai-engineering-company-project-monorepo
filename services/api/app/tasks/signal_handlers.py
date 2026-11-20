"""Celery signal handlers shared by every task in this package.

`task_failure` fires exactly once Celery has decided a task is
*terminally* done failing — either its retries are exhausted, or it
raised without ever calling `self.retry()` (a non-retryable/permanent
error). It never fires for an intermediate retry (that's `task_retry`,
which this module intentionally does not use for dead-letter purposes —
per-attempt retry/failure logging happens inline in each task, which
already has full context; this handler's only job is the dead-letter
write, which specifically needs Celery's own "this is final" signal).

Imported once from app/celery_app.py so both the worker and the API
process register it on import — harmless in the API process, which never
executes a task itself and so never triggers this signal.
"""

from __future__ import annotations

import logging

from celery.signals import task_failure

from app.services import task_tracking

logger = logging.getLogger("app.tasks")


@task_failure.connect
def _on_task_failure(sender=None, task_id=None, exception=None, einfo=None, **kwargs):
    # `sender.request.retries` reflects the number of retries already
    # *completed* when this fires — it is not incremented for the final,
    # non-requeued failure. +1 converts to this codebase's 1-based
    # attempt numbering (exhausting max_retries=3 -> attempt 4; a
    # permanent error that never retried -> attempt 1).
    attempt_number = 1
    task_name = None
    if sender is not None:
        task_name = getattr(sender, "name", None)
        request = getattr(sender, "request", None)
        if request is not None:
            attempt_number = (request.retries or 0) + 1

    error_message = f"{type(exception).__name__}: {exception}" if exception is not None else "Unknown error"

    try:
        inserted = task_tracking.record_dead_letter(
            task_id=task_id,
            task_name=task_name,
            attempt_number=attempt_number,
            error_message=error_message,
        )
    except Exception as persist_exc:
        # Never hide the original task failure behind a dead-letter
        # persistence failure — both are logged, distinctly, and the
        # task is still correctly recorded as FAILURE by Celery itself
        # regardless of whether this handler could persist anything.
        logger.error(
            "task_id=%s attempt=%d status=failure dead_letter_persisted=false "
            "original_error=%r persist_error=%r",
            task_id,
            attempt_number,
            str(exception),
            str(persist_exc),
        )
        if einfo is not None:
            logger.error("task_id=%s original traceback:\n%s", task_id, einfo)
        return

    if inserted:
        logger.error(
            "task_id=%s task_name=%s attempt=%d status=failure dead_letter_persisted=true error=%r",
            task_id,
            task_name,
            attempt_number,
            str(exception),
        )
        if einfo is not None:
            logger.error("task_id=%s traceback:\n%s", task_id, einfo)
    else:
        # A dead-letter row for this task_id already existed — this is a
        # duplicate task_failure delivery for the same terminal failure,
        # not a new one. Still log it (status is still 'failure'), but
        # never as a second dead-letter record.
        logger.info(
            "task_id=%s task_name=%s attempt=%d status=failure dead_letter_persisted=false "
            "reason=duplicate_signal_already_recorded",
            task_id,
            task_name,
            attempt_number,
        )

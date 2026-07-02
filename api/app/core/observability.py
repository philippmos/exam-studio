"""Optional production observability: OpenTelemetry tracing, Prometheus, Sentry.

Each piece is gated on configuration, so with nothing set (the default in dev
and tests) this is a no-op beyond exposing ``/metrics``. Heavy imports are done
lazily inside the helpers so an unconfigured deployment never pays for them.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.core.config import Settings, get_settings
from app.db.session import engine


def configure_observability(app: FastAPI) -> None:
    """Wire up whichever of Sentry / Prometheus / OpenTelemetry are configured."""
    settings = get_settings()
    _configure_sentry(settings)
    _configure_metrics(settings, app)
    _configure_tracing(settings, app)


def _configure_sentry(settings: Settings) -> None:
    if not settings.sentry_dsn:
        return
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.0,
    )


def _configure_metrics(settings: Settings, app: FastAPI) -> None:
    if not settings.metrics_enabled:
        return
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(
        app, endpoint="/metrics", include_in_schema=False
    )


def _configure_tracing(settings: Settings, app: FastAPI) -> None:
    if not settings.otel_exporter_otlp_endpoint:
        return

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create(
        {
            "service.name": settings.service_name,
            "deployment.environment": settings.environment,
        }
    )
    provider = TracerProvider(resource=resource)
    endpoint = settings.otel_exporter_otlp_endpoint.rstrip("/")
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces"))
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    # The async engine wraps a sync Engine, which is what the instrumentor hooks.
    SQLAlchemyInstrumentor().instrument(
        engine=engine.sync_engine, tracer_provider=provider
    )
    AsyncPGInstrumentor().instrument(tracer_provider=provider)

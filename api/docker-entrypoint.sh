#!/bin/sh
# Container entrypoint: bring the schema up to date, then serve.
#
# Running migrations here keeps a single-container deployment simple. For a
# multi-replica / zero-downtime setup, prefer running `alembic upgrade head` as
# a separate one-shot job (init container / CI step) and drop it from here so
# replicas do not race on migration.
set -eu

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000

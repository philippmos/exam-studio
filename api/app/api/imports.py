"""ZIP import upload endpoints.

Image-carrying imports arrive as a ZIP (``exam.json`` + ``images/``) uploaded as
``multipart/form-data`` — binary payloads that do not belong on the GraphQL
schema. The plain image-free JSON import stays on the ``importExam`` /
``addExamQuestions`` GraphQL mutations. Both share the same validation, storage
and persistence in :mod:`app.services.exams`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession

from app import models
from app.api.deps import require_user
from app.core.config import get_settings
from app.db.session import get_db_session
from app.services import exams as exams_service

router = APIRouter(prefix="/import", tags=["import"])


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ImportZipResult(_CamelModel):
    """The exam created by a fresh ZIP import."""

    exam_id: uuid.UUID


class AddQuestionsZipResult(_CamelModel):
    """How many questions a ZIP merge added vs. skipped."""

    exam_id: uuid.UUID
    added: int
    skipped: int


async def _read_capped(file: UploadFile, max_bytes: int) -> bytes:
    """Read an upload into memory, rejecting anything past ``max_bytes`` (413)."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"The import archive exceeds the "
                    f"{max_bytes // (1024 * 1024)} MB limit."
                ),
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/zip", status_code=201, response_model=ImportZipResult)
async def import_exam_zip(
    file: UploadFile = File(...),
    user: models.User = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> ImportZipResult:
    """Create a new exam from a ZIP bundle (``exam.json`` + ``images/``)."""
    zip_bytes = await _read_capped(file, get_settings().import_zip_max_bytes)
    exam, _counts = await exams_service.import_exam_zip(db, user, zip_bytes)
    return ImportZipResult(exam_id=exam.id)


@router.post("/exams/{exam_id}/zip", response_model=AddQuestionsZipResult)
async def add_exam_questions_zip(
    exam_id: uuid.UUID,
    file: UploadFile = File(...),
    user: models.User = Depends(require_user),
    db: AsyncSession = Depends(get_db_session),
) -> AddQuestionsZipResult:
    """Add questions (with images) from a ZIP bundle to an existing exam."""
    zip_bytes = await _read_capped(file, get_settings().import_zip_max_bytes)
    outcome = await exams_service.add_exam_questions_zip(db, user, exam_id, zip_bytes)
    return AddQuestionsZipResult(
        exam_id=outcome.exam.id, added=outcome.added, skipped=outcome.skipped
    )

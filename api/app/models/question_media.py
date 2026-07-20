from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.question import Question


class QuestionMedia(Base):
    """An image referenced from a question's HTML (its text or explanation).

    The image bytes live in blob storage at ``blob_path`` (content-addressed by
    ``sha256`` under the owning exam's prefix, so the same image is stored once
    per exam). The question HTML refers to it as ``media://{id}``; that
    placeholder is swapped for a short-lived signed URL when the question is
    served. Deleting the question deletes these rows via cascade; the blob
    objects are removed separately (a prefix delete when the exam is deleted).
    """

    __tablename__ = "question_media"

    # One row per (question, image); the same image reused within a question maps
    # to a single row.
    __table_args__ = (
        UniqueConstraint(
            "question_id", "sha256", name="uq_question_media_question_sha256"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Object path in the blob container, e.g. "exams/{exam_id}/{sha256}.png".
    blob_path: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    question: Mapped[Question] = relationship(back_populates="media")

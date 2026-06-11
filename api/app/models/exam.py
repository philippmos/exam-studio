from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Exam(Base):
    __tablename__ = "exams"

    # The study goal is optional, but period and target only make sense as a pair.
    __table_args__ = (
        CheckConstraint(
            "(study_goal_period IS NULL) = (study_goal_target IS NULL)",
            name="ck_exams_study_goal_paired",
        ),
        CheckConstraint(
            "study_goal_target IS NULL OR study_goal_target > 0",
            name="ck_exams_study_goal_target_positive",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Optional study goal: answer `study_goal_target` questions per
    # `study_goal_period` (a GoalPeriod value).
    study_goal_period: Mapped[str | None] = mapped_column(String(16))
    study_goal_target: Mapped[int | None] = mapped_column(Integer)

    sections: Mapped[list["Section"]] = relationship(
        back_populates="exam",
        cascade="all, delete-orphan",
        order_by="Section.position",
    )
    sessions: Mapped[list["ExamSession"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )

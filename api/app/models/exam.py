from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Uuid,
    false,
    func,
)
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
        # The source is recorded exactly when a goal exists.
        CheckConstraint(
            "(study_goal_period IS NULL) = (study_goal_source IS NULL)",
            name="ck_exams_study_goal_source_paired",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # The owning user. Every exam (and everything cascading from it) belongs to
    # exactly one registered user; data is always scoped by this in the API.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Optional study goal: answer `study_goal_target` questions per
    # `study_goal_period` (a GoalPeriod value).
    study_goal_period: Mapped[str | None] = mapped_column(String(16))
    study_goal_target: Mapped[int | None] = mapped_column(Integer)
    # How the goal was set: a StudyGoalSource value ("MANUAL" / "AUTO"). "AUTO"
    # goals are recomputed from the certification date; "MANUAL" ones are left
    # alone. Set exactly when a goal exists (see the check constraint above).
    study_goal_source: Mapped[str | None] = mapped_column(String(16))

    # Optional date and time the user sits the real certification exam.
    certification_exam_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    # Archived exams are hidden from the dashboard and can no longer start new
    # sessions, but their history stays in the database so streaks, statistics
    # and past sessions still account for them.
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    owner: Mapped["User"] = relationship(back_populates="exams")
    sections: Mapped[list["Section"]] = relationship(
        back_populates="exam",
        cascade="all, delete-orphan",
        order_by="Section.position",
    )
    sessions: Mapped[list["ExamSession"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )

from pydantic import BaseModel, Field, ConfigDict
from typing import List

class ProblemCreate(BaseModel):
    slug: str
    title: str
    difficulty: str = Field(pattern="^(easy|medium|hard)$")
    statement_md: str
    starter_code: str | None = None

class TestcaseCreate(BaseModel):
    problem_id: int
    idx: int
    input_text: str
    expected_text: str
    timeout_ms: int = 2000
    points: int = 1
    is_public: bool = False

class SubmissionCreate(BaseModel):
    problem_id: int
    source_code: str  # Python only for MVP


class RobotProblemConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    grid: dict
    start: dict
    walls: list[dict] = Field(default_factory=list)
    coins: list[dict] = Field(default_factory=list)
    goal: dict


class RobotProblemCreate(BaseModel):
    slug: str
    title: str
    difficulty: str = Field(pattern="^(easy|medium|hard)$")
    statement_md: str
    starter_code: str | None = None
    config: RobotProblemConfig


class RobotProblemOut(BaseModel):
    problem_id: int
    robot_pid: int
    slug: str
    title: str
    difficulty: str
    statement_md: str
    starter_code: str | None = None
    config: RobotProblemConfig


class RobotProblemCreateWithWeek(RobotProblemCreate):
    week: int = Field(ge=1, le=52)

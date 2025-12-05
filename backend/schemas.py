from pydantic import BaseModel, Field
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

export type Problem = {
    id: number;
    slug: string;
    title: string;
    difficulty: "easy" | "medium" | "hard";
  };
  
  export type ProblemDetail = {
    id: number;
    slug: string;
    title: string;
    difficulty: "easy" | "medium" | "hard";
    statement_md: string;
    public_samples: { idx: number; input_text: string; expected_text: string }[];
  };
  
  export type SubmissionSummary = {
    id: number;
    status: "queued" | "running" | "accepted" | "wrong_answer" | "tle" | "runtime_error" | "compile_error" | "system_error";
    score: number;
    time_ms: number;
    created_at: string;
    finished_at: string | null;
  };
  
export type SubmissionResult = {
    testcase_id: number;
    verdict: "ok" | "wa" | "tle" | "re" | "skipped";
    time_ms: number;
    stdout: string;
    stderr: string;
    idx: number;
  };

export type TeacherClass = {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  created_at: string | null;
  student_count: number;
};

export type ClassTeacher = { id: number; email: string; username: string };
export type ClassStudent = { id: number; email: string; username: string; is_verified: boolean };

export type TeacherClassDetail = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  created_at: string | null;
  teachers: ClassTeacher[];
  students: ClassStudent[];
};

export type ClassProblem = {
  id: number;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  assigned_at: string | null;
  assigned_by?: number | null;
  assigned_by_name?: string | null;
};

export type ClassSubmission = {
  submission_id: number;
  status: string;
  score: number;
  time_ms: number;
  created_at: string | null;
  finished_at: string | null;
  student_id: number;
  student_username: string;
  student_email: string;
  problem_id: number;
  problem_title: string;
  problem_slug: string;
};

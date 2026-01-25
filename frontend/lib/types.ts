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
    starter_code?: string | null;
    public_samples: {
      idx: number;
      input_text: string;
      expected_text: string;
      raw_input_text?: string;
      raw_expected_text?: string;
    }[];
  };

export type ProblemCreatePayload = {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  statement_md: string;
  starter_code?: string | null;
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
  result_id?: number;
  testcase_id?: number;
  verdict: "ok" | "wa" | "tle" | "re" | "skipped";
  time_ms: number;
  stdout: string;
  stderr: string;
  idx: number;
  input_text?: string;
  expected_text?: string;
  return_value?: any;
  robot_result?: any;
};

export type SubmissionResultsResponse = {
  results: SubmissionResult[];
  total_testcases: number;
};

export type RobotProblemConfig = {
  grid: { width: number; height: number };
  start: { x: number; y: number; dir: "top" | "bottom" | "left" | "right" };
  walls: { x: number; y: number }[];
  coins: { x: number; y: number }[];
  goal: Record<string, any>;
};

export type RobotProblemOut = {
  problem_id: number;
  robot_pid: number;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  statement_md: string;
  starter_code?: string | null;
  config: RobotProblemConfig;
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
  week: number | null;
  order_index?: number | null;
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

export type ClassStudentSubmission = {
  id: number;
  problem_id: number;
  problem_title: string;
  problem_slug: string;
  status: string;
  score: number;
  time_ms: number;
  created_at: string | null;
  finished_at: string | null;
  source_code: string;
};

export type ClassProblemSubmission = {
  id: number;
  student_id: number;
  student_username: string | null;
  student_email: string;
  status: string;
  score: number;
  time_ms: number;
  created_at: string | null;
  finished_at: string | null;
  source_code: string;
};

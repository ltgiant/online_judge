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
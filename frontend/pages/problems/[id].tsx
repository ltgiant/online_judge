// frontend/pages/problems/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import {
  ClassProblem,
  ProblemDetail,
  RobotProblemOut,
  SubmissionSummary,
  SubmissionResult,
  SubmissionResultsResponse,
} from "@/lib/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const verdictClass = (v: SubmissionResult["verdict"]) =>
  clsx(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
    v === "ok" && "bg-green-100 text-green-700",
    v === "wa" && "bg-amber-100 text-amber-700",
    v === "re" && "bg-red-100 text-red-700",
    v === "tle" && "bg-blue-100 text-blue-700",
    v === "skipped" && "bg-gray-100 text-gray-600"
  );

const statusClass = (s: SubmissionSummary["status"]) =>
  clsx(
    "rounded-md px-2 py-0.5 text-xs font-semibold",
    s === "accepted" && "bg-green-100 text-green-700",
    s === "wrong_answer" && "bg-amber-100 text-amber-700",
    s === "runtime_error" && "bg-red-100 text-red-700",
    s === "tle" && "bg-blue-100 text-blue-700",
    s === "queued" && "bg-gray-100 text-gray-600",
    s === "running" && "bg-purple-100 text-purple-700",
    s === "compile_error" && "bg-red-100 text-red-700",
    s === "system_error" && "bg-slate-100 text-slate-700"
  );

const DEFAULT_CODE = `def answer(n: int, nums: list[int], target: int) -> tuple[int, int]:
    # TODO: implement
    return (0, 0)
`;

type StudentClassProblem = Pick<
  ClassProblem,
  "id" | "slug" | "title" | "difficulty" | "week" | "assigned_at" | "order_index"
>;
type StudentClassDetail = {
  id: number;
  name: string;
  code: string;
  problems: StudentClassProblem[];
};

type LeftTab = "problem" | "run" | "submit";

export default function ProblemPage() {
  const router = useRouter();
  const { id } = router.query;
  const pid = Number(Array.isArray(id) ? id[0] : id);

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [codeInitialized, setCodeInitialized] = useState(false);
  const [subId, setSubId] = useState<number | null>(null);
  const [status, setStatus] = useState<SubmissionSummary["status"] | null>(null);
  const [results, setResults] = useState<SubmissionResult[] | null>(null);
  const [totalTestcases, setTotalTestcases] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mySubs, setMySubs] = useState<SubmissionSummary[]>([]);
  const [solved, setSolved] = useState(false);
  const [loadingMySubs, setLoadingMySubs] = useState(false);
  const [runInput, setRunInput] = useState<string>("");
  const [runOutput, setRunOutput] = useState<{
    mode: "payload" | "stdin";
    result: any;
    stdout: string;
    stderr: string;
    time_ms: number;
    return_code: number;
  } | null>(null);
  const [runningCode, setRunningCode] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [weekProblems, setWeekProblems] = useState<StudentClassProblem[]>([]);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [targetIndexInput, setTargetIndexInput] = useState<string>("");
  const [showIndexList, setShowIndexList] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>("problem");
  const [isRobotProblem, setIsRobotProblem] = useState(false);
  const [robotConfig, setRobotConfig] = useState<RobotProblemOut | null>(null);
  // 로그인/검증 상태
  const { me, loading: loadingMe } = useMe();
  const canSubmit = !!me && me.is_verified;
  //const userIdPart = me?.id ? `user_${me.id}` : "guest";
  //const runInputStorageKey = Number.isFinite(pid) ? `oj_run_input_${pid}_${userIdPart}` : null;
  const classIdParam = router.query.classId;
  const weekParam = router.query.week;
  const classId = Number(Array.isArray(classIdParam) ? classIdParam[0] : classIdParam);
  const weekValueRaw = Array.isArray(weekParam) ? weekParam[0] : weekParam;
  const weekValue = weekValueRaw === "unscheduled" ? null : Number(weekValueRaw);
  const hasWeekContext =
    (weekValueRaw === "unscheduled" || Number.isInteger(weekValue)) && Number.isInteger(classId);

  const tryConvertArgsKwargsInput = useCallback((text: string) => {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
    if (lines.length === 0) return null;

    const parseValue = (raw: string) => {
      try {
        return JSON.parse(raw);
      } catch {
        const trimmed = raw.trim();
        const parseToken = (token: string) => {
          const num = Number(token);
          return Number.isFinite(num) ? num : token;
        };
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          const inner = trimmed.slice(1, -1).trim();
          if (!inner) return [];
          return inner
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map(parseToken);
        }
        const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
        if (tokens.length > 1) {
          return tokens.map(parseToken);
        }
        return parseToken(trimmed);
      }
    };

    const args: any[] = [];
    const kwargs: Record<string, any> = {};
    let hasKwargs = false;
    lines.forEach((line) => {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const valueRaw = line.slice(eqIdx + 1).trim();
        if (key) {
          kwargs[key] = parseValue(valueRaw);
          hasKwargs = true;
        }
      } else {
        args.push(parseValue(line));
      }
    });

    if (args.length === 0 && !hasKwargs) return null;
    return { args, kwargs };
  }, []);

  const formatResult = (val: any) => {
    if (val === null || val === undefined) return "null";
    if (Array.isArray(val)) {
      const flat = val.every((v) => ["string", "number", "boolean"].includes(typeof v) || v === null);
      return flat ? val.join(" ") : JSON.stringify(val);
    }
    if (typeof val === "object") return JSON.stringify(val);
    if (typeof val === "string") {
      const t = val.trim();
      // 튜플 표기 "(0, 1)" 같은 경우 공백 구분으로 변환
      if (t.startsWith("(") && t.endsWith(")")) {
        return t.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean).join(" ");
      }
      return t;
    }
    return String(val);
  };

  const formatExpected = (text?: string) => {
    if (!text) return "";
    try {
      return formatResult(JSON.parse(text));
    } catch {
      return text.trim();
    }
  };

  const formatInput = (text?: string) => {
    if (!text) return "";
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        const flat = data.every((v) => ["string", "number", "boolean"].includes(typeof v) || v === null);
        return flat ? data.map((v) => formatResult(v)).join("\n") : JSON.stringify(data, null, 2);
      }
      if (data && typeof data === "object" && ("args" in data || "kwargs" in data)) {
        const lines: string[] = [];
        const args: any[] = Array.isArray((data as any).args) ? (data as any).args : [];
        const kwargs = (data as any).kwargs && typeof (data as any).kwargs === "object" ? (data as any).kwargs : {};
        args.forEach((v) => {
          if (Array.isArray(v)) {
            const flat = v.every((x) => ["string", "number", "boolean"].includes(typeof x) || x === null);
            lines.push(flat ? v.join(" ") : JSON.stringify(v));
          } else {
            lines.push(formatResult(v));
          }
        });
        Object.entries(kwargs).forEach(([k, v]) => lines.push(`${k}=${formatResult(v)}`));
        return lines.join("\n");
      }
    } catch {
      // fallback to raw text
    }
    return text.trim();
  };

  const displayedResults = results ? results.filter((r) => r.verdict !== "ok") : null;
  const passedCount = results ? results.filter((r) => r.verdict === "ok").length : 0;
  const totalCount = totalTestcases ?? (results ? results.length : 0);
  const robotResult = results?.find((r) => r.robot_result)?.robot_result ?? null;
  const rawRobotPath = Array.isArray(robotResult?.path) ? robotResult.path : [];
  const robotActions = Array.isArray(robotResult?.actions) ? robotResult.actions : [];
  const startForFrames = robotConfig?.config?.start ?? robotResult?.start;
  const needsStartFrame =
    startForFrames &&
    typeof startForFrames.x === "number" &&
    typeof startForFrames.y === "number" &&
    (rawRobotPath.length === 0 ||
      rawRobotPath[0]?.x !== startForFrames.x ||
      rawRobotPath[0]?.y !== startForFrames.y ||
      rawRobotPath[0]?.dir !== startForFrames.dir);
  const totalFrames = rawRobotPath.length + (needsStartFrame ? 1 : 0);
  const [frameIndex, setFrameIndex] = useState(0);
  const actionIndex = needsStartFrame ? frameIndex - 1 : frameIndex;
  const currentAction =
    actionIndex >= 0 && actionIndex < robotActions.length ? robotActions[actionIndex]?.cmd : null;
  const pathIndex = needsStartFrame ? frameIndex - 1 : frameIndex;
  const currentCoins =
    pathIndex >= 0 && pathIndex < rawRobotPath.length && typeof rawRobotPath[pathIndex]?.coins === "number"
      ? rawRobotPath[pathIndex].coins
      : 0;

  const runCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const submitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const robotImagesRef = useRef<Record<string, HTMLImageElement> | null>(null);
  const [robotImagesReady, setRobotImagesReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (robotImagesRef.current) return;
    const entries: [string, string][] = [
      ["top", "/robot_image/robot_top.png"],
      ["right", "/robot_image/robot_right.png"],
      ["bottom", "/robot_image/robot_bottom.png"],
      ["left", "/robot_image/robot_left.png"],
    ];
    const images: Record<string, HTMLImageElement> = {};
    let loaded = 0;
    const handleDone = () => {
      loaded += 1;
      if (loaded === entries.length) setRobotImagesReady(true);
    };
    entries.forEach(([dir, src]) => {
      const img = new Image();
      img.onload = handleDone;
      img.onerror = handleDone;
      img.src = src;
      images[dir] = img;
    });
    robotImagesRef.current = images;
  }, []);

  useEffect(() => {
    setFrameIndex(0);
    setIsPlaying(false);
  }, [robotResult]);

  useEffect(() => {
    if (!isRobotProblem) return;
    const stopPlayback = () => {
      if (playTimerRef.current !== null) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };

    const getCanvasScale = (canvas: HTMLCanvasElement) => {
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      return { width, height };
    };

    const drawPlaceholder = (canvas: HTMLCanvasElement | null, text: string) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height } = getCanvasScale(canvas);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, width / 2, height / 2);
    };

    const drawFrame = (canvas: HTMLCanvasElement | null, frameIndex: number, payload: any) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height } = getCanvasScale(canvas);
      const config = robotConfig?.config;
      const grid = payload?.grid ?? config?.grid ?? { width: 10, height: 10 };
      const walls = Array.isArray(payload?.walls)
        ? payload.walls
        : Array.isArray(config?.walls)
        ? config?.walls
        : [];
      const initialCoins = Array.isArray(payload?.coins)
        ? payload.coins
        : Array.isArray(config?.coins)
        ? config?.coins
        : [];
      const coinsRemaining = Array.isArray(payload?.coins_remaining) ? payload.coins_remaining : [];
      const startState = config?.start ?? payload?.start;
      const rawPath = Array.isArray(payload?.path) ? payload.path : [];
      const actions = Array.isArray(payload?.actions) ? payload.actions : [];
      const gridW = Math.max(1, Number(grid.width) || 10);
      const gridH = Math.max(1, Number(grid.height) || 10);
      const padding = Math.min(width, height) * 0.08;
      const cell = Math.min((width - padding * 2) / gridW, (height - padding * 2) / gridH);
      const fullW = cell * gridW;
      const fullH = cell * gridH;
      const originX = (width - fullW) / 2;
      const originY = (height - fullH) / 2;
      const toCanvas = (x: number, y: number) => ({
        cx: originX + (x + 0.5) * cell,
        cy: originY + (fullH - (y + 0.5) * cell),
      });

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      if (walls.length > 0) {
        ctx.fillStyle = "#e5e7eb";
        walls.forEach((w: any) => {
          if (typeof w?.x !== "number" || typeof w?.y !== "number") return;
          const left = originX + w.x * cell;
          const top = originY + (fullH - (w.y + 1) * cell);
          ctx.fillRect(left, top, cell, cell);
        });
      }

      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = Math.max(1, cell * 0.05);
      for (let i = 0; i <= gridW; i += 1) {
        const x = originX + i * cell;
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + fullH);
        ctx.stroke();
      }
      for (let j = 0; j <= gridH; j += 1) {
        const y = originY + j * cell;
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(originX + fullW, y);
        ctx.stroke();
      }

      let path = rawPath;
      const startInserted =
        startState &&
        typeof startState.x === "number" &&
        typeof startState.y === "number" &&
        (rawPath.length === 0 ||
          rawPath[0]?.x !== startState.x ||
          rawPath[0]?.y !== startState.y ||
          rawPath[0]?.dir !== startState.dir);
      if (startState && typeof startState.x === "number" && typeof startState.y === "number") {
        const startEntry = { x: startState.x, y: startState.y, dir: startState.dir ?? "top", coins: 0 };
        if (
          rawPath.length === 0 ||
          rawPath[0]?.x !== startEntry.x ||
          rawPath[0]?.y !== startEntry.y ||
          rawPath[0]?.dir !== startEntry.dir
        ) {
          path = [startEntry, ...rawPath];
        }
      }

      const getCoinsForFrame = (index: number) => {
        if (initialCoins.length === 0) return coinsRemaining;
        const set = new Map<string, { x: number; y: number }>();
        initialCoins.forEach((c: any) => {
          if (typeof c?.x === "number" && typeof c?.y === "number") {
            set.set(`${c.x},${c.y}`, { x: c.x, y: c.y });
          }
        });
        if (set.size === 0) return coinsRemaining;
        if (actions.length === 0) return Array.from(set.values());
        const lastActionIndex = Math.min(actions.length - 1, startInserted ? index - 1 : index);
        for (let i = 0; i <= lastActionIndex; i += 1) {
          const act = actions[i];
          if (!act) continue;
          const picked = Array.isArray(act.picked) ? act.picked : [];
          if (picked.length > 0) {
            picked.forEach((p: any) => {
              if (typeof p?.x === "number" && typeof p?.y === "number") {
                set.delete(`${p.x},${p.y}`);
              }
            });
          } else if (act.cmd === "pick_coin" && act.result === true) {
            const state = path[Math.min(i, path.length - 1)];
            if (state && typeof state.x === "number" && typeof state.y === "number") {
              set.delete(`${state.x},${state.y}`);
            }
          }
        }
        return Array.from(set.values());
      };

      const coinsToDraw = getCoinsForFrame(frameIndex);
      if (coinsToDraw.length > 0) {
        ctx.fillStyle = "#facc15";
        coinsToDraw.forEach((c: any) => {
          if (typeof c?.x !== "number" || typeof c?.y !== "number") return;
          const { cx, cy } = toCanvas(c.x, c.y);
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.18, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (path.length > 1) {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.35)";
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.beginPath();
        const first = path[0];
        const start = toCanvas(first.x, first.y);
        ctx.moveTo(start.cx, start.cy);
        for (let i = 1; i <= frameIndex && i < path.length; i += 1) {
          const p = path[i];
          const pt = toCanvas(p.x, p.y);
          ctx.lineTo(pt.cx, pt.cy);
        }
        ctx.stroke();
      }

      if (path.length === 0) return;
      const step = path[Math.min(frameIndex, path.length - 1)];
      const images = robotImagesRef.current;
      const img = images?.[step.dir];
      const size = cell * 0.8;
      const { cx, cy } = toCanvas(step.x, step.y);
      if (img && img.complete) {
        ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
      } else {
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (runCanvasRef.current) {
      drawPlaceholder(runCanvasRef.current, "Run is disabled for robot problems.");
    }

    const submitCanvas = submitCanvasRef.current;
    if (!submitCanvas) return;
    if (leftTab !== "submit") {
      stopPlayback();
      return;
    }

    const rawPath = Array.isArray(robotResult?.path) ? robotResult.path : [];
    const startState = robotResult?.start ?? robotConfig?.config?.start;
    if (!robotResult) {
      drawPlaceholder(submitCanvas, "Waiting for submission result...");
      return;
    }
    if (rawPath.length === 0 && startState && robotConfig?.config) {
      drawFrame(submitCanvas, 0, {
        grid: robotResult?.grid ?? robotConfig.config.grid,
        start: { ...startState, dir: "right" },
        walls: robotConfig.config.walls,
        coins: robotConfig.config.coins,
        actions: [],
        path: [{ x: startState.x, y: startState.y, dir: "right", coins: 0 }],
      });
      return;
    }
    if (rawPath.length === 0) {
      drawPlaceholder(submitCanvas, "Waiting for submission result...");
      return;
    }
    const needsStart =
      startState &&
      typeof startState.x === "number" &&
      typeof startState.y === "number" &&
      (rawPath.length === 0 ||
        rawPath[0]?.x !== startState.x ||
        rawPath[0]?.y !== startState.y ||
        rawPath[0]?.dir !== startState.dir);
    const realPath = rawPath.length + (needsStart ? 1 : 0);

    const clampedFrame = Math.min(frameIndex, realPath - 1);
    if (clampedFrame !== frameIndex) {
      setFrameIndex(clampedFrame);
    } else {
      drawFrame(submitCanvas, frameIndex, robotResult);
    }

    if (!isPlaying) {
      stopPlayback();
      return;
    }
    if (playTimerRef.current !== null) return;

    const frameDuration = 90;
    playTimerRef.current = window.setInterval(() => {
      setFrameIndex((prev) => {
        if (prev >= realPath - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, frameDuration);
    return () => stopPlayback();
  }, [isRobotProblem, leftTab, robotResult, robotImagesReady, robotConfig, frameIndex, isPlaying]);

  

  // 문제 상세 로드
  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    setLoading(true);
    setError(null);
    api
      .get<ProblemDetail>(`/problems/${pid}`)
      .then((res) => setProblem(res.data))
      .catch(() => setError("Failed to load problem"))
      .finally(() => setLoading(false));
  }, [pid]);

  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    api
      .get(`/robot-problems/${pid}`)
      .then((res) => {
        setIsRobotProblem(true);
        setRobotConfig(res.data as RobotProblemOut);
      })
      .catch(() => {
        setIsRobotProblem(false);
        setRobotConfig(null);
      });
  }, [pid]);

  useEffect(() => {
    if (!me || !Number.isFinite(pid)) {
      setMySubs([]);
      setSolved(false);
      return;
    }
    setLoadingMySubs(true);
    api
      .get<{ solved: boolean; submissions: SubmissionSummary[] }>(`/problems/${pid}/my-submissions`)
      .then((res) => {
        setSolved(res.data.solved);
        setMySubs(res.data.submissions);
      })
      .catch(() => setMySubs([]))
      .finally(() => setLoadingMySubs(false));
    }, [me, pid]);

  // 문제 starter_code 로드 후 에디터 초기화 (사용자가 수정했다면 덮어쓰지 않도록 1회만)
  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    setProblem(null); // ensure stale problem data is cleared before loading the next one
    setCode(DEFAULT_CODE);
    setCodeInitialized(false);
    setIsRobotProblem(false);
    setRobotConfig(null);
  }, [pid]);

  useEffect(() => {
    if (!problem || codeInitialized || loadingMe) return;
    // no saved code available; fall back to starter
    setCode(problem.starter_code || DEFAULT_CODE);
    setCodeInitialized(true);
  }, [problem, codeInitialized, loadingMe]);

  // 문제 변경시 Submission, Status, Result 초기화 및 문제 탭으로 고정
  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    setSubId(null);
    setStatus(null);
    setResults(null);
    setLeftTab("problem");
  }, [pid]);

  // 주차 내 문제 목록 로드 (주차 컨텍스트가 있을 때만)
  useEffect(() => {
    if (!hasWeekContext) {
      setWeekProblems([]);
      setCurrentIndex(null);
      return;
    }
    if (!me || me.role !== "student") return;
    setNavLoading(true);
    setNavError(null);
    api
      .get<StudentClassDetail>(`/student/classes/${classId}`)
      .then((res) => {
        const all = res.data.problems || [];
        const filtered =
          weekValue === null
            ? all.filter((p) => !p.week)
            : all.filter((p) => p.week === weekValue);
        const sorted = filtered
          .slice()
          .sort((a, b) => {
            const aOrder = a.order_index ?? 0;
            const bOrder = b.order_index ?? 0;
            if (aOrder !== bOrder) return aOrder - bOrder;
            const aTime = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
            const bTime = b.assigned_at ? new Date(b.assigned_at).getTime() : 0;
            if (aTime !== bTime) return aTime - bTime;
            return a.id - b.id;
          });
        setWeekProblems(sorted);
        setNavError(null);
      })
      .catch(() => {
        setWeekProblems([]);
        setNavError("주차별 문제 목록을 불러오지 못했습니다.");
      })
      .finally(() => setNavLoading(false));
  }, [hasWeekContext, me, classId, weekValue]);

  useEffect(() => {
    if (!Number.isFinite(pid)) {
      setCurrentIndex(null);
      return;
    }
    const idx = weekProblems.findIndex((p) => p.id === pid);
    setCurrentIndex(idx >= 0 ? idx : null);
  }, [pid, weekProblems]);

  const goToIndex = (nextIndex: number) => {
    if (!hasWeekContext) return;
    if (nextIndex < 0 || nextIndex >= weekProblems.length) return;
    const target = weekProblems[nextIndex];
    const weekQuery = weekValueRaw ?? "";
    void router.push(
      `/problems/${target.id}?classId=${classId}&week=${encodeURIComponent(
        weekQuery
      )}&index=${nextIndex}`
    );
  };

  const handlePrev = () => {
    if (currentIndex === null) return;
    goToIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex === null) return;
    goToIndex(currentIndex + 1);
  };

  useEffect(() => {
    if (currentIndex !== null) {
      setTargetIndexInput(String(currentIndex + 1)); // 1-base로 표시
    }
  }, [currentIndex]);


  const handleGoToIndex = () => {
    if (!hasWeekContext) return;
    const raw = targetIndexInput.trim();
    if (raw === "") return;
    const parsed = Number(raw);
    const idx = parsed - 1; // UI is 1-based, internal is 0-based
    if (!Number.isInteger(parsed) || idx < 0 || idx >= weekProblems.length) {
      setNavError(`번호는 1에서 ${weekProblems.length} 사이의 정수를 입력하세요.`);
      return;
    }
    setNavError(null);
    goToIndex(idx);
  };

  // 실행 입력 초기값: 공개 샘플 첫 번째 input_text를 기본으로 사용
  useEffect(() => {
    if (!problem) {
      setRunInput("");
      setRunOutput(null);
      return;
    }
    const sampleInput = problem.public_samples?.[0];
    if (sampleInput) {
      setRunInput(formatInput(sampleInput.raw_input_text ?? sampleInput.input_text ?? ""),);
    }
    
    setRunOutput(null);
    setRunError(null);      
  }, [problem?.id, problem?.public_samples]);

  // 실행 (채점 없이 즉시 결과 확인)
  const runCode = useCallback(async () => {
    if (!Number.isFinite(pid)) return;
    setLeftTab("run");
    if (isRobotProblem) {
      setRunError("로봇 문제는 실행이 아닌 제출로만 확인 가능합니다.");
      return;
    }
    if (!me) {
      setRunError("로그인이 필요합니다. 먼저 로그인하세요.");
      return;
    }
    if (!me.is_verified) {
      setRunError("이메일 인증이 필요합니다. 이메일을 확인하세요.");
      return;
    }
    setRunningCode(true);
    setRunError(null);
    setRunOutput(null);

    let mode: "payload" | "stdin" = "stdin";
    let payload: any = null;
    let stdinText = runInput;
    if (runInput.trim() !== "") {
      try {
        payload = JSON.parse(runInput);
        mode = "payload";
        stdinText = "";
      } catch {
        const converted = tryConvertArgsKwargsInput(runInput);
        if (converted) {
          payload = converted;
          mode = "payload";
          stdinText = "";
        } else {
          payload = null;
          mode = "stdin";
        }
      }
    } else {
      payload = { args: [], kwargs: {} };
      mode = "payload";
      stdinText = "";
    }

    try {
      const res = await api.post("/sandbox/run", {
        source_code: code,
        payload: mode === "payload" ? payload : null,
        stdin_text: mode === "stdin" ? stdinText : "",
      });
      setRunOutput(res.data);
    } catch (e: any) {
      const msg =
        e?.response?.status === 401
          ? "Not authenticated. Please log in and try again."
          : e?.response?.data?.detail || "실행 실패";
      setRunError(msg);
    } finally {
      setRunningCode(false);
    }
  }, [pid, me, runInput, code, tryConvertArgsKwargsInput, isRobotProblem]);

  // 제출
  const submit = useCallback(async () => {
    if (!Number.isFinite(pid)) return;
    setLeftTab("submit");

    if (!me) {
      setError("로그인이 필요합니다. 먼저 로그인하세요.");
      return;
    }
    if (!me.is_verified) {
      setError("Email not verified. Please verify your email.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResults(null);
    setSubId(null);
    setStatus(null);
    try {
      const res = await api.post<{ submission_id: number; status: string }>(`/submissions`, {
        problem_id: pid,
        source_code: code,
      });
      setSubId(res.data.submission_id);
      setStatus(res.data.status as SubmissionSummary["status"]);
    } catch (e: any) {
      const msg =
        e?.response?.status === 401
          ? "Not authenticated. Please log in and try again."
          : e?.response?.data?.detail || "제출 실패";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [pid, code, me]);

  const resetCodeToStarter = useCallback(() => {
    if (!problem) return;
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm("작성한 코드를 모두 지우고 초기 starter code로 되돌릴까요?")
        : true;
    if (!confirmed) return;

    const nextCode = problem.starter_code || DEFAULT_CODE;
    setCode(nextCode);
  }, [problem]);

  // 상태 폴링
  useEffect(() => {
    if (!subId) return;
    let active = true;
    const interval = setInterval(async () => {
      try {
        const s = await api.get<SubmissionSummary>(`/submissions/${subId}`);
        if (!active) return;
        setStatus(s.data.status);
        if (
          ["accepted", "wrong_answer", "tle", "runtime_error", "compile_error", "system_error"].includes(
            s.data.status
          )
        ) {
          const r = await api.get<SubmissionResultsResponse>(`/submissions/${subId}/results`);
          if (!active) return;
          setResults(r.data.results);
          setTotalTestcases(r.data.total_testcases);
          clearInterval(interval);
        }
      } catch {
        // 폴링 중 에러는 무시
      }
    }, 600);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [subId]);

  return (
    <div className="min-h-screen bg-gray-50 lg:h-full lg:overflow-hidden">
      <main className="w-full px-2 sm:px-3 lg:px-4 py-3 lg:py-0 lg:h-full lg:overflow-hidden lg:box-border">
        {loading && <div className="text-gray-500">Loading…</div>}

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error} {!me && <a className="ml-2 underline" href="/login">로그인으로 이동</a>}
          </div>
        )}

        {!loading && hasWeekContext && !error && (
          <div className="mb-3 rounded border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <button
                  type="button"
                  onClick={() => setShowIndexList((v) => !v)}
                  className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {showIndexList ? "Hide problems" : "Show problems"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrev}
                  disabled={
                    navLoading ||
                    currentIndex === null ||
                    currentIndex <= 0 ||
                    weekProblems.length === 0
                  }
                  className={`rounded border px-3 py-1 text-xs ${
                    navLoading || currentIndex === null || currentIndex <= 0 || weekProblems.length === 0
                      ? "cursor-not-allowed border-gray-200 text-gray-300"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Previous
                </button>
                <input
                  type="text"
                  min={1}
                  max={weekProblems.length || undefined}
                  value={targetIndexInput}
                  onChange={(e) => setTargetIndexInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (navLoading || currentIndex === null || weekProblems.length === 0) {
                      setNavError("Not valid index");
                      return;
                    }
                    e.preventDefault();
                    handleGoToIndex();
                  }}
                  className="w-10 rounded border border-gray-300 px-1 py-1 text-xs text-gray-700 hover:bg-gray-50 text-center"
                />
                <button
                  onClick={handleNext}
                  disabled={
                    navLoading ||
                    currentIndex === null ||
                    weekProblems.length === 0 ||
                    currentIndex >= weekProblems.length - 1
                  }
                  className={`rounded border px-3 py-1 text-xs ${
                    navLoading ||
                    currentIndex === null ||
                    weekProblems.length === 0 ||
                    currentIndex >= weekProblems.length - 1
                      ? "cursor-not-allowed border-gray-200 text-gray-300"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
            {showIndexList && weekProblems.length > 0 && (
              <div className="mt-2 max-h-40 w-full overflow-y-auto rounded border border-gray-200 bg-white p-2 text-xs text-gray-700">
                <div className="mb-1 font-semibold">Problems in this week</div>
                <ul className="space-y-1">
                  {weekProblems.map((p, i) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (navLoading || weekProblems.length === 0) {
                            setNavError("Not valid index");
                            return;
                          }
                          setTargetIndexInput(String(i + 1)); // 입력칸도 맞춰주고
                          setShowIndexList(false);
                          goToIndex(i); // 바로 이동
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-gray-50"
                      >
                        <span className="font-mono text-gray-600">{i + 1}</span>
                        <span className="ml-2 flex-1 truncate">{p.title}</span>
                        {currentIndex === i && <span className="ml-2 text-indigo-600">Current</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {navLoading && <div className="mt-2 text-xs text-gray-500">Loading week problems…</div>}
            {navError && <div className="mt-2 text-xs text-red-600 text-right">{navError}</div>}
          </div>
        )}

        {!loadingMe && me && !me.is_verified && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your email is not verified. Please check your inbox (or use the verify link shown after sign-up in dev mode).
          </div>
        )}

        {!loading && problem && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 lg:items-start lg:h-full lg:overflow-hidden">
            {/* 문제 본문 */}
            <section className="space-y-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">{problem.title}</h1>
                  <span
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      problem.difficulty === "easy" && "bg-green-100 text-green-700",
                      problem.difficulty === "medium" && "bg-yellow-100 text-yellow-700",
                      problem.difficulty === "hard" && "bg-red-100 text-red-700"
                    )}
                  >
                    {problem.difficulty}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {me && (
                    <div className="text-xs text-gray-600">
                      Status:{" "}
                      {solved ? (
                        <span className="font-semibold text-green-600">Solved</span>
                      ) : (
                        <span className="font-semibold text-gray-500">Not solved</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { key: "problem", label: "문제" },
                      { key: "run", label: "실행" },
                      { key: "submit", label: "제출" },
                    ].map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setLeftTab(t.key as LeftTab)}
                        className={clsx(
                          "rounded-md px-3 py-1.5 text-sm font-semibold",
                          leftTab === t.key
                            ? "bg-slate-800 text-white"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {leftTab === "problem" && (
                <>
                  <div className="prose prose-sm max-w-none rounded-lg border bg-white px-5 py-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {(problem.statement_md ?? "").replace(/\\n/g, "\n")}
                    </ReactMarkdown>
                  </div>

                  <div className="rounded-lg border bg-white">
                    <div className="border-b px-4 py-2.5 text-sm font-semibold">Public Samples</div>
                    <ul className="divide-y">
                      {problem.public_samples.length === 0 && (
                        <li className="px-4 py-3 text-sm text-gray-500">None</li>
                      )}
                      {problem.public_samples.map((s) => (
                        <li key={s.idx} className="grid grid-cols-2 gap-3 px-4 py-3 text-sm">
                          <div>
                            <div className="text-gray-500">Input</div>
                            <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-2">
                              {formatInput(s.raw_input_text ?? s.input_text)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-gray-500">Expected</div>
                            <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-2">
                              {formatInput(s.raw_expected_text ?? s.expected_text)}
                            </pre>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
              {leftTab === "run" && isRobotProblem && (
                <div className="rounded-lg border bg-white p-3 space-y-3">
                  <canvas ref={runCanvasRef} width={360} height={200} className="w-full rounded-md bg-gray-50" />
                  <div className="rounded-md border bg-gray-50 p-3 text-xs">
                    <div className="font-semibold text-gray-700">Raw JSON</div>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-mono">
                      {runOutput ? JSON.stringify(runOutput, null, 2) : ""}
                    </pre>
                  </div>
                </div>
              )}
              {leftTab === "run" && !isRobotProblem && (
                <div className="rounded-lg border bg-white p-3">
                  {!runError && !runOutput && (
                    <div className="text-sm text-gray-500">실행 결과가 여기에 표시됩니다.</div>
                  )}
                  {runError && (
                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{runError}</div>
                  )}
                  {runOutput && (
                    <div className="space-y-2 rounded-md border bg-gray-50 p-3 text-xs">
                      <div className="flex flex-wrap gap-3 text-gray-700">
                        <span className="font-semibold">Mode:</span> <span className="font-mono">{runOutput.mode}</span>
                        <span className="font-semibold">Time:</span> <span className="font-mono">{runOutput.time_ms} ms</span>
                        <span className="font-semibold">Exit:</span> <span className="font-mono">{runOutput.return_code}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">Return value</div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 text-[12px] font-mono">
                          {formatResult(runOutput.result)}
                        </pre>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">Stdout</div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 text-[12px] font-mono">
                          {runOutput.stdout || ""}
                        </pre>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">Stderr</div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 text-[12px] font-mono text-red-700">
                          {runOutput.stderr || ""}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {leftTab === "submit" && isRobotProblem && (
                <div className="rounded-lg border bg-white p-3 space-y-3">
                  {robotResult && !(robotResult.stderr || "").trim() ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-700 min-h-[30px] py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!robotResult || totalFrames === 0) return;
                            if (isPlaying) {
                              setIsPlaying(false);
                              return;
                            }
                            if (frameIndex >= totalFrames - 1) {
                              setFrameIndex(0);
                            }
                            setIsPlaying(true);
                          }}
                          disabled={!robotResult || totalFrames === 0}
                          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {isPlaying ? "Pause" : "Play"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setFrameIndex((v) => Math.max(0, v - 1));
                          }}
                          disabled={!robotResult || totalFrames === 0}
                          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setFrameIndex((v) => Math.min(Math.max(totalFrames - 1, 0), v + 1));
                          }}
                          disabled={!robotResult || totalFrames === 0}
                          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Next
                        </button>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={Math.max(totalFrames - 1, 0)}
                            value={Math.min(frameIndex, Math.max(totalFrames - 1, 0))}
                            onChange={(e) => {
                              setIsPlaying(false);
                              setFrameIndex(Number(e.target.value));
                            }}
                            disabled={!robotResult || totalFrames === 0}
                            className="w-40"
                          />
                          <span className="font-mono text-[11px] text-gray-500">
                            {totalFrames === 0 ? "0/0" : `${Math.min(frameIndex + 1, totalFrames)}/${totalFrames}`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right font-mono text-[13px] text-gray-600">
                        <div>{`coin: ${currentCoins}`}</div>
                        <div>{currentAction ? `action: ${currentAction}` : 'action: '}</div>
                      </div>
                    </div>
                  ) : null}
                  {robotResult && (robotResult.stderr || "").length > 0 ? null : (
                    <canvas ref={submitCanvasRef} width={360} height={200} className="w-full rounded-md bg-gray-50" />
                  )}
                  <div className="rounded-md border bg-gray-50 p-3 text-xs">
                    <div className="font-semibold text-gray-700">Stdout</div>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-mono">
                      {robotResult?.stdout ?? ""}
                    </pre>
                  </div>
                  {robotResult && (robotResult.stderr || "").length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs">
                      <div className="font-semibold text-red-700">Stderr</div>
                      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-red-700">
                        {robotResult?.stderr ?? ""}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              {leftTab === "submit" && !isRobotProblem && (
                <div className="rounded-lg border bg-white">
                  <div className="border-b px-4 py-2.5 text-sm font-semibold">Results</div>
                  {!results && (
                    <div className="px-4 py-3 text-sm text-gray-500">제출 결과가 여기에 표시됩니다.</div>
                  )}
                  {results && (
                    <div className="px-4 py-2 text-sm text-gray-700">
                      Passed: <span className="font-semibold">{passedCount}</span>
                      {"/"}
                      <span className="font-semibold">{totalCount}</span>
                    </div>
                  )}
                  {results && displayedResults && displayedResults.length === 0 && (
                    <div className="px-4 py-3 text-sm text-green-700">All testcases passed.</div>
                  )}
                  {displayedResults && displayedResults.length > 0 && (
                    <div className="overflow-x-auto p-3">
                      <table className="min-w-full border text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="border px-2 py-1 text-left">Verdict</th>
                            <th className="border px-2 py-1 text-right">Time (ms)</th>
                            <th className="border px-2 py-1 text-left">Input</th>
                            <th className="border px-2 py-1 text-left">Expected</th>
                            <th className="border px-2 py-1 text-left">Return value</th>
                            <th className="border px-2 py-1 text-left">Stdout</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedResults.map((r, i) => (
                            <tr key={r.result_id ?? i} className="odd:bg-white even:bg-gray-50">
                              <td className="border px-2 py-1">
                                <span className={verdictClass(r.verdict)}>{r.verdict}</span>
                              </td>
                              <td className="border px-2 py-1 text-right">{r.time_ms}</td>
                              <td className="border px-2 py-1">
                                {r.verdict === "ok" ? (
                                  ""
                                ) : (
                                  <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">
                                    {formatInput(r.input_text)}
                                  </pre>
                                )}
                              </td>
                              <td className="border px-2 py-1">
                                {r.verdict === "ok" ? (
                                  ""
                                ) : (
                                  <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">
                                    {formatExpected(r.expected_text)}
                                  </pre>
                                )}
                              </td>
                              <td className="border px-2 py-1">
                                {r.verdict === "ok" ? (
                                  ""
                                ) : (
                                  <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">
                                    {r.return_value === null || r.return_value === undefined ? "" : formatResult(r.return_value)}
                                  </pre>
                                )}
                              </td>
                              <td className="border px-2 py-1">
                                {r.verdict === "ok" ? (
                                  ""
                                ) : (
                                  <pre className="max-h-40 whitespace-pre-wrap break-words text-[12px]">{r.stdout}</pre>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {displayedResults && displayedResults.some((r) => r.stderr) && (
                    <div className="px-3 pb-3">
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs">
                        <div className="font-semibold text-red-700">Stderr</div>
                        <div className="mt-2 space-y-2">
                          {displayedResults.map((r, i) =>
                            r.stderr ? (
                              <div key={r.result_id ?? i}>
                                <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 text-[12px] text-red-700">
                                  {r.stderr}
                                </pre>
                              </div>
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
            {/* 에디터/제출/결과 (오른쪽) */}
            <section className="flex flex-col gap-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1">
              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold">Editor (Python)</div>
                <div className="p-3">
                  <div className="overflow-hidden rounded-md border">
                    <MonacoEditor
                      height="420px"
                      defaultLanguage="python"
                      value={code}
                      onChange={(v) => setCode(v ?? "")}
                      options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 2 }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={runCode}
                      disabled={runningCode || !canSubmit || isRobotProblem}
                      className="inline-flex items-center rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {!me
                        ? "로그인 후 실행"
                        : !me.is_verified
                        ? "이메일 인증 후 실행"
                        : isRobotProblem
                        ? "로봇 문제는 제출로 확인"
                        : runningCode
                        ? "실행 중…"
                        : "실행"}
                    </button>
                    <button
                      onClick={submit}
                      disabled={submitting || !canSubmit}
                      className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {!me ? "로그인 후 제출" : !me.is_verified ? "이메일 인증 후 제출" : submitting ? "제출 중…" : "제출"}
                    </button>
                    <button
                      onClick={resetCodeToStarter}
                      disabled={!problem}
                      className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      초기화
                    </button>

                    {subId && (
                      <div className="text-sm text-gray-700">
                        <span className="text-gray-500">Submission:</span>{" "}
                        <span className="font-mono">{subId}</span>{" "}
                        <span className="ml-2 text-gray-500">Status:</span>{" "}
                        <span className={status ? statusClass(status) : "px-2 py-0.5 text-xs text-gray-500"}>
                          {status ?? "-"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-white">
                <div className="border-b px-4 py-2.5 text-sm font-semibold flex items-center justify-between gap-3">
                  <span>실행</span>
                  <div className="flex items-center gap-2 justify-end">
                    {[0, 1, 2].map((i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const sample = problem?.public_samples?.[i];
                          if (sample)
                            setRunInput(
                              formatInput(sample.raw_input_text ?? sample.input_text ?? ""),
                            );
                        }}
                        disabled={!problem?.public_samples?.[i]}
                        className="inline-flex items-center rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {problem?.public_samples?.[i] ? `샘플 ${i + 1}` : `샘플 ${i + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                    rows={4}
                    value={runInput}
                    onChange={(e) => setRunInput(e.target.value)}
                    placeholder='예) {"args": [1, [2,3]], "kwargs": {}} 또는 "raw stdin"'
                  />
                </div>
              </div>

            </section>
          </div>
        )}
      </main>
    </div>
  );
}

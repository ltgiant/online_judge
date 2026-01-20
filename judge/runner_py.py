import subprocess, tempfile, os, time, json, textwrap, sys

PYTHON_BIN = os.environ.get("PYTHON_BINARY") or sys.executable or "python3"

HARNESS_CODE = """
import json, sys, importlib.util, contextlib, io

def convert(obj):
    if isinstance(obj, tuple):
        return [convert(x) for x in obj]
    if isinstance(obj, set):
        return [convert(x) for x in sorted(obj)]
    if isinstance(obj, list):
        return [convert(x) for x in obj]
    if isinstance(obj, dict):
        return {k: convert(v) for k, v in obj.items()}
    return obj

def load_module():
    spec = importlib.util.spec_from_file_location("user_main", "Main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def main():
    data = json.loads(sys.stdin.read())
    if isinstance(data, dict):
        args = data.get("args", [])
        kwargs = data.get("kwargs", {})
    elif isinstance(data, list):
        args = data
        kwargs = {}
    else:
        args = [data]
        kwargs = {}

    module = load_module()
    if not hasattr(module, "answer"):
        raise AttributeError("answer function not found")

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        result = module.answer(*args, **kwargs)

    payload = {"result": convert(result), "stdout": buf.getvalue()}
    json.dump(payload, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
"""

HARNESS_ROBOT_CODE = """
import json, sys, contextlib, io, traceback, random

DIRS = ["top", "right", "bottom", "left"]

def _turn(dir_name, step):
    idx = DIRS.index(dir_name)
    return DIRS[(idx + step) % len(DIRS)]

def _front_cell(x, y, dir_name):
    if dir_name == "top":
        return x, y + 1
    if dir_name == "bottom":
        return x, y - 1
    if dir_name == "left":
        return x - 1, y
    return x + 1, y

def _in_bounds(x, y, w, h):
    return 0 <= x < w and 0 <= y < h

def _bfs_reachable(start, walls, w, h):
    from collections import deque
    sx, sy = start
    if not _in_bounds(sx, sy, w, h):
        return set()
    if (sx, sy) in walls:
        return set()
    q = deque([(sx, sy)])
    seen = {(sx, sy)}
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0), (-1,0), (0,1), (0,-1)):
            nx, ny = x + dx, y + dy
            if not _in_bounds(nx, ny, w, h):
                continue
            if (nx, ny) in walls:
                continue
            if (nx, ny) in seen:
                continue
            seen.add((nx, ny))
            q.append((nx, ny))
    return seen

def _sample_cells(candidates, count, rng):
    if count <= 0:
        return []
    if count >= len(candidates):
        return list(candidates)
    return rng.sample(list(candidates), count)

class Robot:
    def __init__(self, grid, start, walls, coins, max_steps):
        self.w = grid["width"]
        self.h = grid["height"]
        self.x = start["x"]
        self.y = start["y"]
        self.dir = start["dir"]
        self.walls = {(c["x"], c["y"]) for c in walls}
        self.coins = {(c["x"], c["y"]) for c in coins}
        self.coins_collected = 0
        self.actions = []
        self.path = []
        self.max_steps = max_steps

    def _record(self, action):
        self.actions.append(action)
        self.path.append({
            "x": self.x,
            "y": self.y,
            "dir": self.dir,
            "coins": self.coins_collected,
        })
        if self.max_steps is not None and len(self.actions) > self.max_steps:
            raise RuntimeError("step_limit_exceeded")

    def _is_blocked(self, x, y):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return True
        return (x, y) in self.walls

    def move(self):
        nx, ny = _front_cell(self.x, self.y, self.dir)
        blocked = self._is_blocked(nx, ny)
        if blocked:
            self._record({"cmd": "move", "moved": False, "hit_wall": True, "picked": []})
            return False
        self.x, self.y = nx, ny
        self._record({"cmd": "move", "moved": True, "hit_wall": False, "picked": []})
        return True

    def turn_left(self):
        self.dir = _turn(self.dir, -1)
        self._record({"cmd": "turn_left"})

    def turn_right(self):
        self.dir = _turn(self.dir, 1)
        self._record({"cmd": "turn_right"})

    def is_wall(self):
        nx, ny = _front_cell(self.x, self.y, self.dir)
        result = self._is_blocked(nx, ny)
        self._record({"cmd": "is_wall", "result": result})
        return result

    def is_coin(self):
        result = (self.x, self.y) in self.coins
        self._record({"cmd": "is_coin", "result": result})
        return result

    def pick_coin(self):
        if (self.x, self.y) in self.coins:
            self.coins.remove((self.x, self.y))
            self.coins_collected += 1
            self._record({"cmd": "pick_coin", "result": True, "picked": [{"x": self.x, "y": self.y}]})
            return True
        self._record({"cmd": "pick_coin", "result": False, "picked": []})
        return False

    def position(self):
        result = [self.x, self.y]
        self._record({"cmd": "position", "result": result})
        return result

    def direction(self):
        self._record({"cmd": "direction", "result": self.dir})
        return self.dir

def check_goal(goal, final_state, path, coins_collected, coins_remaining):
    if not goal:
        return True
    ok = True
    if "final" in goal:
        g = goal["final"] or {}
        if "x" in g and final_state["x"] != g["x"]:
            ok = False
        if "y" in g and final_state["y"] != g["y"]:
            ok = False
        if "dir" in g and final_state["dir"] != g["dir"]:
            ok = False
    if "coins_collected" in goal and coins_collected != goal["coins_collected"]:
        ok = False
    if "coins_remaining" in goal and len(coins_remaining) != goal["coins_remaining"]:
        ok = False
    if "path_max_steps" in goal and len(path) > goal["path_max_steps"]:
        ok = False
    if "path_must_include" in goal:
        required = goal["path_must_include"] or []
        for item in required:
            rx, ry = item.get("x"), item.get("y")
            if rx is None or ry is None:
                continue
            if not any(p["x"] == rx and p["y"] == ry for p in path):
                ok = False
                break
    return ok

def main():
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw else {}
    cfg = payload.get("config") or payload
    goal = cfg.get("goal") or {}
    max_steps = goal.get("path_max_steps")
    if max_steps is None:
        max_steps = payload.get("max_steps")
    if max_steps is None:
        max_steps = 10000

    seed = cfg.get("seed")
    rng = random.Random(seed)

    grid = dict(cfg["grid"])
    rg = cfg.get("random_grid") or {}
    if rg and isinstance(rg.get("width"), list) and isinstance(rg.get("height"), list):
        try:
            w_min, w_max = rg["width"][0], rg["width"][1]
            h_min, h_max = rg["height"][0], rg["height"][1]
            w_min, w_max = int(w_min), int(w_max)
            h_min, h_max = int(h_min), int(h_max)
            if w_min > w_max:
                w_min, w_max = w_max, w_min
            if h_min > h_max:
                h_min, h_max = h_max, h_min
            grid["width"] = rng.randint(w_min, w_max)
            grid["height"] = rng.randint(h_min, h_max)
        except (TypeError, ValueError, IndexError):
            pass

    w, h = grid["width"], grid["height"]
    base_start = cfg["start"]
    base_walls = [c for c in cfg.get("walls", []) if _in_bounds(c.get("x"), c.get("y"), w, h)]
    base_coins = [c for c in cfg.get("coins", []) if _in_bounds(c.get("x"), c.get("y"), w, h)]
    goal = cfg.get("goal") or {}
    if not cfg.get("random_start") and not _in_bounds(base_start["x"], base_start["y"], w, h):
        base_start = {**base_start, "x": 0, "y": 0}

    def build_randomized():
        # 1) random walls
        walls = {(c["x"], c["y"]) for c in base_walls}
        rw = cfg.get("random_walls") or {}
        if rw:
            avoid_start = bool(rw.get("avoid_start", True))
            avoid_goal = bool(rw.get("avoid_goal", False))
            count = rw.get("count")
            density = rw.get("density")
            if count is None and density is not None:
                try:
                    density_val = float(density)
                except (TypeError, ValueError):
                    density_val = 0.0
                max_cells = w * h
                count = int(round(max_cells * max(0.0, min(1.0, density_val))))
            if count is None:
                count = 0
            blocked = set(walls)
            if avoid_start:
                blocked.add((base_start["x"], base_start["y"]))
            if avoid_goal and isinstance(goal.get("final"), dict):
                g = goal["final"]
                if "x" in g and "y" in g:
                    blocked.add((g["x"], g["y"]))
            candidates = [
                (x, y)
                for x in range(w)
                for y in range(h)
                if (x, y) not in blocked
            ]
            for cell in _sample_cells(candidates, count, rng):
                walls.add(cell)

        # 2) random start
        start = dict(base_start)
        if cfg.get("random_start"):
            candidates = [
                (x, y)
                for x in range(w)
                for y in range(h)
                if (x, y) not in walls
            ]
            if candidates:
                sx, sy = rng.choice(candidates)
                start["x"], start["y"] = sx, sy
            if "dir" not in start or start["dir"] not in DIRS:
                start["dir"] = rng.choice(DIRS)

        # 3) random coins
        coins = {(c["x"], c["y"]) for c in base_coins}
        rc = cfg.get("random_coins") or {}
        if rc:
            avoid_start = bool(rc.get("avoid_start", True))
            avoid_walls = bool(rc.get("avoid_walls", True))
            count = rc.get("count")
            if count is None:
                count = 0
            blocked = set()
            if avoid_start:
                blocked.add((start["x"], start["y"]))
            if avoid_walls:
                blocked |= walls
            blocked |= coins
            candidates = [
                (x, y)
                for x in range(w)
                for y in range(h)
                if (x, y) not in blocked
            ]
            for cell in _sample_cells(candidates, count, rng):
                coins.add(cell)

        return start, walls, coins

    def targets_reachable(start, walls, coins, goal):
        reachable = _bfs_reachable((start["x"], start["y"]), walls, w, h)
        for (cx, cy) in coins:
            if (cx, cy) not in reachable:
                return False
        g = goal.get("final") if isinstance(goal.get("final"), dict) else None
        if g and "x" in g and "y" in g:
            if (g["x"], g["y"]) not in reachable:
                return False
        return True

    start = base_start
    walls = {(c["x"], c["y"]) for c in base_walls}
    coins = {(c["x"], c["y"]) for c in base_coins}
    if cfg.get("random_start") or cfg.get("random_walls") or cfg.get("random_coins"):
        for _ in range(50):
            start, walls, coins = build_randomized()
            if targets_reachable(start, walls, coins, goal):
                break

    robot = Robot(
        grid,
        start,
        [{"x": x, "y": y} for (x, y) in walls],
        [{"x": x, "y": y} for (x, y) in coins],
        max_steps,
    )
    is_valid = True

    out_buf = io.StringIO()
    err_buf = io.StringIO()
    try:
        with open("Main.py", "r", encoding="utf-8") as f:
            user_code = f.read()
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            exec(user_code, {"hubo": robot})
    except Exception as e:
        is_valid = False
        tb = traceback.format_exc()
        err_buf.write(tb)

    coins_remaining = [{"x": x, "y": y} for (x, y) in sorted(robot.coins)]
    final_state = {"x": robot.x, "y": robot.y, "dir": robot.dir}

    result = {
        "is_valid": is_valid,
        "is_correct": is_valid and check_goal(goal, final_state, robot.path, robot.coins_collected, coins_remaining),
        "grid": grid,
        "start": start,
        "final": final_state,
        "actions": robot.actions,
        "path": robot.path,
        "walls": [{"x": x, "y": y} for (x, y) in sorted(robot.walls)],
        "coins": [{"x": x, "y": y} for (x, y) in sorted(robot.coins)],
        "coins_remaining": coins_remaining,
        "stdout": out_buf.getvalue(),
        "stderr": err_buf.getvalue(),
    }
    json.dump(result, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
"""

def run_python(source_code: str, stdin_data: str, timeout_ms: int):
    """개발용 실행기: 보안 없음. 나중에 Docker runner로 교체."""
    with tempfile.TemporaryDirectory() as td:
        main_path = os.path.join(td, "Main.py")
        with open(main_path, "w", encoding="utf-8") as f:
            f.write(source_code)

        start = time.time()
        try:
            proc = subprocess.run(
                [PYTHON_BIN, main_path],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=timeout_ms/1000.0
            )
            elapsed = int((time.time() - start) * 1000)
            return proc.returncode, proc.stdout, proc.stderr, elapsed
        except FileNotFoundError:
            elapsed = int((time.time() - start) * 1000)
            return 127, "", f"PYTHON_BIN not found: {PYTHON_BIN}", elapsed
        except subprocess.TimeoutExpired:
            elapsed = int((time.time() - start) * 1000)
            return 124, "", "TIMEOUT", elapsed

def run_python_answer(source_code: str, payload: dict | list, timeout_ms: int):
    with tempfile.TemporaryDirectory() as td:
        main_path = os.path.join(td, "Main.py")
        with open(main_path, "w", encoding="utf-8") as f:
            f.write(source_code)

        harness_path = os.path.join(td, "invoke_answer.py")
        with open(harness_path, "w", encoding="utf-8") as f:
            f.write(HARNESS_CODE)

        start = time.time()
        try:
            proc = subprocess.run(
                [PYTHON_BIN, harness_path],
                input=json.dumps(payload, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=timeout_ms / 1000.0,
                cwd=td,  # ← 이 줄 추가!
            )
            elapsed = int((time.time() - start) * 1000)
            return proc.returncode, proc.stdout, proc.stderr, elapsed
        except FileNotFoundError:
            elapsed = int((time.time() - start) * 1000)
            return 127, "", f"PYTHON_BIN not found: {PYTHON_BIN}", elapsed
        except subprocess.TimeoutExpired:
            elapsed = int((time.time() - start) * 1000)
            return 124, "", "TIMEOUT", elapsed

def run_python_robot(source_code: str, config: dict, timeout_ms: int):
    with tempfile.TemporaryDirectory() as td:
        main_path = os.path.join(td, "Main.py")
        with open(main_path, "w", encoding="utf-8") as f:
            f.write(source_code)

        harness_path = os.path.join(td, "invoke_robot.py")
        with open(harness_path, "w", encoding="utf-8") as f:
            f.write(HARNESS_ROBOT_CODE)

        start = time.time()
        try:
            payload = json.dumps({"config": config}, ensure_ascii=False)
            proc = subprocess.run(
                [PYTHON_BIN, harness_path],
                input=payload,
                capture_output=True,
                text=True,
                timeout=timeout_ms / 1000.0,
                cwd=td,
            )
            elapsed = int((time.time() - start) * 1000)
            return proc.returncode, proc.stdout, proc.stderr, elapsed
        except FileNotFoundError:
            elapsed = int((time.time() - start) * 1000)
            return 127, "", f"PYTHON_BIN not found: {PYTHON_BIN}", elapsed
        except subprocess.TimeoutExpired:
            elapsed = int((time.time() - start) * 1000)
            return 124, "", "TIMEOUT", elapsed

import subprocess, tempfile, os, time, json, textwrap

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

def run_python(source_code: str, stdin_data: str, timeout_ms: int):
    """개발용 실행기: 보안 없음. 나중에 Docker runner로 교체."""
    with tempfile.TemporaryDirectory() as td:
        main_path = os.path.join(td, "Main.py")
        with open(main_path, "w", encoding="utf-8") as f:
            f.write(source_code)

        start = time.time()
        try:
            proc = subprocess.run(
                ["python", main_path],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=timeout_ms/1000.0
            )
            elapsed = int((time.time() - start) * 1000)
            return proc.returncode, proc.stdout, proc.stderr, elapsed
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
                ["python", harness_path],
                input=json.dumps(payload, ensure_ascii=False),
                capture_output=True,
                text=True,
                timeout=timeout_ms / 1000.0,
            )
            elapsed = int((time.time() - start) * 1000)
            return proc.returncode, proc.stdout, proc.stderr, elapsed
        except subprocess.TimeoutExpired:
            elapsed = int((time.time() - start) * 1000)
            return 124, "", "TIMEOUT", elapsed

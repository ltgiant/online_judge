import subprocess, tempfile, os, time, textwrap

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
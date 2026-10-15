"""Shared local-only boot/test implementation for the PowerShell and Bash entrypoints."""
import argparse
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import venv
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV = ROOT / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


@contextmanager
def local_lock():
    """Protect shared npm/venv state from concurrent dev/test invocations."""
    VENV.mkdir(exist_ok=True)
    with (VENV / "foodtour-local.lock").open("a+b") as handle:
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise RuntimeError("Another dev/test script is active; stop it before running this command") from None
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def run(command, *, cwd=ROOT, env=None):
    print("RUN:", " ".join(str(x) for x in command), flush=True)
    return subprocess.run([str(x) for x in command], cwd=cwd, env=env, check=True)


def environment():
    result = os.environ.copy()
    result.update(PYTHONPATH=str(ROOT / "backend"), PYTHONDONTWRITEBYTECODE="1",
                  PYTHONUTF8="1", NEXT_TELEMETRY_DISABLED="1")
    return result


def bootstrap(env):
    if sys.version_info < (3, 11):
        raise RuntimeError("Python 3.11+ required")
    print(f"Bootstrap interpreter: Python {sys.version.split()[0]}", flush=True)
    if not PYTHON.exists():
        print("Creating ignored .venv", flush=True)
        venv.EnvBuilder(with_pip=True).create(VENV)
    run([PYTHON, "-m", "pip", "install", "-r", ROOT / "backend/requirements.txt"], env=env)


def npm_command():
    if os.name == "nt":
        npm = shutil.which("npm.cmd")
        node = shutil.which("node")
        if npm and node:
            cli = Path(npm).parent / "node_modules/npm/bin/npm-cli.js"
            if cli.exists():
                # Invoke node directly: no cmd.exe command interpolation or extra window.
                return [node, str(cli)]
        raise RuntimeError("Node/npm required; npm-cli.js must be adjacent to npm.cmd")
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("Node/npm required for the frontend")
    return [npm]


def install_frontend(env, *, always=False):
    front = ROOT / "frontend"
    lock = front / "package-lock.json"
    stamp = VENV / "foodtour-npm-lock.sha256"
    digest = hashlib.sha256(lock.read_bytes()).hexdigest()
    if (always or not (front / "node_modules/.package-lock.json").exists()
            or not stamp.exists() or stamp.read_text() != digest):
        run(npm_command() + ["ci"], cwd=front, env=env)
        stamp.write_text(digest, encoding="ascii")
    else:
        print("Frontend dependencies match lockfile; reusing npm ci installation", flush=True)


def test(env):
    # Continue independent checks after a failure, but any failed check is fatal.
    failed = []
    for label, command, cwd in (
        ("backend", [PYTHON, ROOT / "scripts/run_unittests.py"], ROOT),
        ("OpenAPI drift", [PYTHON, ROOT / "tools/export_openapi.py", "--check"], ROOT),
    ):
        try:
            run(command, cwd=cwd, env=env)
        except subprocess.CalledProcessError:
            failed.append(label)
    front = ROOT / "frontend"
    if front.exists():
        try:
            install_frontend(env, always=True)
        except (OSError, RuntimeError, subprocess.CalledProcessError):
            failed.append("frontend npm ci")
        else:
            for label, args in (("frontend build", ["run", "build"]), ("frontend tests", ["test"])):
                if args == ["test"] and not json.loads((front / "package.json").read_text())["scripts"].get("test"):
                    print("EXPECTED-SKIP: no npm test script in this tree", flush=True)
                    continue
                try:
                    run(npm_command() + args, cwd=front, env=env)
                except subprocess.CalledProcessError:
                    failed.append(label)
            node = shutil.which("node")
            if node and (ROOT / "qa/e2e/test_components.mjs").exists():
                try:
                    run([node, ROOT / "qa/e2e/test_components.mjs"], cwd=ROOT, env=env)
                except subprocess.CalledProcessError:
                    failed.append("frontend component tests")
    else:
        print("SKIP: frontend directory absent", flush=True)
    # Quality gate without network: rule extractor on the labelled synthetic fixture only.
    eval_env = {k: v for k, v in env.items() if k not in ("FOODTOUR_DATA_PATH", "FOODTOUR_LLM", "FOODTOUR_EXPLAIN")}
    eval_env["PYTHONPATH"] = str(ROOT / "backend")
    # An absent absolute path makes the loader fall back to the labelled synthetic fixture.
    eval_env["FOODTOUR_DATA_PATH"] = str(ROOT / ".ci-no-private-data" / "absent.json")
    for label, script, extra in (("quality eval (rules, synthetic)", "qa/eval/run_eval.py", ["--repeat", "1"]),
                                 ("geo plausibility audit (synthetic)", "qa/eval/geo_audit.py", [])):
        if (ROOT / script).exists():
            try:
                run([PYTHON, ROOT / script, *extra], cwd=ROOT, env=eval_env)
            except subprocess.CalledProcessError:
                failed.append(label)
    if failed:
        print("FAILED CHECKS:", ", ".join(failed), flush=True)
        return 1
    print("PASS: all available checks passed; expected skips are listed above", flush=True)
    return 0


def available(port):
    if not 1 <= port <= 65535:
        raise RuntimeError("Port must be in 1..65535")
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise RuntimeError(f"Port {port} is already in use; choose another port") from None


def start(command, cwd, env):
    options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    process = subprocess.Popen([str(x) for x in command], cwd=cwd, env=env, **options)
    print(f"Started task-owned process {process.pid}", flush=True)
    return process


def stop(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    else:
        os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGKILL)
        process.kill()
        process.wait(timeout=5)
    print(f"Stopped task-owned process {process.pid}", flush=True)


def wait_http(url, process, *, health=False, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Task-owned server exited before readiness")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                return json.load(response) if health else response.status
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.2)
    raise RuntimeError("Server readiness timed out")


def dev(args, env):
    available(args.port)
    if args.frontend:
        if args.frontend_port == args.port:
            raise RuntimeError("API and frontend ports must differ")
        available(args.frontend_port)
        install_frontend(env)
        env["NEXT_PUBLIC_API_URL"] = f"http://127.0.0.1:{args.port}"
        env.setdefault("WEB_ORIGIN", f"http://127.0.0.1:{args.frontend_port}")
    children = []
    with tempfile.TemporaryDirectory(prefix="foodtour-dev-fallback-") as fallback:
        if not env.get("FOODTOUR_DATA_PATH"):
            # Explicitly request absent-path fallback even if a private default exists.
            env["FOODTOUR_DATA_PATH"] = str(Path(fallback) / "absent.json")
            print("FOODTOUR_DATA_PATH unset: requesting LABELED SYNTHETIC fallback", flush=True)
        try:
            api = start([PYTHON, "-m", "uvicorn", "app.server:app", "--host", "127.0.0.1", "--port", args.port], ROOT / "backend", env)
            children.append(api)
            health = wait_http(f"http://127.0.0.1:{args.port}/health", api, health=True)
            print("HEALTH:", json.dumps(health, ensure_ascii=True, sort_keys=True), flush=True)
            if health.get("dataset_source") == "synthetic":
                print("DATASET: SYNTHETIC fixture; not real venues", flush=True)
            print(f"API: http://127.0.0.1:{args.port}/docs", flush=True)
            if args.frontend:
                front = start(npm_command() + ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", str(args.frontend_port)], ROOT / "frontend", env)
                children.append(front)
                status = wait_http(f"http://127.0.0.1:{args.frontend_port}", front)
                print(f"FRONTEND: http://127.0.0.1:{args.frontend_port} HTTP {status}", flush=True)
            if args.smoke_test:
                print("SMOKE PASS: readiness verified; stopping both task-owned servers", flush=True)
                return 0
            print("Ready. Ctrl+C stops both task-owned servers.", flush=True)
            while True:
                if any(p.poll() is not None for p in children):
                    raise RuntimeError("A task-owned server exited unexpectedly")
                time.sleep(0.25)
        except KeyboardInterrupt:
            print("Ctrl+C received; stopping task-owned servers", flush=True)
            return 0
        finally:
            for process in reversed(children):
                stop(process)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("dev", "test"))
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--frontend", action="store_true")
    parser.add_argument("--frontend-port", type=int, default=3000)
    parser.add_argument("--smoke-test", action="store_true", help="Boot, verify readiness and cleanly stop")
    args = parser.parse_args()
    env = environment()
    try:
        with local_lock():
            bootstrap(env)
            return dev(args, env) if args.command == "dev" else test(env)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        return 1
    except KeyboardInterrupt:
        print("Interrupted", flush=True)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())

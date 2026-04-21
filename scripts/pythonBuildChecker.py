from __future__ import annotations

import ast
import importlib.util
import subprocess
import sys
from pathlib import Path

# Maps import names to pip install package names when they differ.
PIP_NAME_MAP = {
    "cv2": "opencv-python",
    "PIL": "pillow",
    "bs4": "beautifulsoup4",
    "yaml": "pyyaml",
    "sklearn": "scikit-learn",
}

IGNORE_DIRS = {
    ".git",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "__pycache__",
}

DATA_DIR = "data"
REQUIRED_DATA_FILES = {
    "master_all_seasons.csv": "combineToMasterData.py",
    "act_character_dataset.csv": "buildActCharacterDataset.py",
}
TRANSCRIPT_GLOB = "transcript-s*e*.csv"


def discover_python_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*.py"):
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.name == Path(__file__).name:
            continue
        files.append(path)
    return sorted(files)


def discover_local_module_names(py_files: list[Path], root: Path) -> set[str]:
    local_names: set[str] = set()
    for file_path in py_files:
        local_names.add(file_path.stem)

    for init_file in root.rglob("__init__.py"):
        if any(part in IGNORE_DIRS for part in init_file.parts):
            continue
        local_names.add(init_file.parent.name)

    return local_names


def find_imported_modules(py_files: list[Path]) -> set[str]:
    modules: set[str] = set()
    for file_path in py_files:
        source = file_path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(file_path))

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    modules.add(alias.name.split(".", 1)[0])
            elif isinstance(node, ast.ImportFrom):
                if node.level and not node.module:
                    continue
                if node.module:
                    modules.add(node.module.split(".", 1)[0])

    return modules


def stdlib_module_names() -> set[str]:
    names = set(getattr(sys, "stdlib_module_names", set()))
    names.update(sys.builtin_module_names)
    return names


def is_installed(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def project_root_from_script() -> Path:
    script_dir = Path(__file__).resolve().parent
    if script_dir.name.lower() == "scripts":
        return script_dir.parent
    return script_dir


def detect_missing_data(project_root: Path) -> dict[str, bool | list[str]]:
    data_dir = project_root / DATA_DIR
    missing_messages: list[str] = []

    has_transcripts = any(data_dir.glob(TRANSCRIPT_GLOB)) if data_dir.exists() else False
    needs_filter = not has_transcripts
    if needs_filter:
        missing_messages.append("No transcript episode CSV files found in data/.")

    needs_combine = False
    needs_build_act = False

    for filename, producer_script in REQUIRED_DATA_FILES.items():
        file_path = data_dir / filename
        if file_path.exists():
            continue
        missing_messages.append(f"Missing {filename}.")
        if producer_script == "combineToMasterData.py":
            needs_combine = True
        elif producer_script == "buildActCharacterDataset.py":
            needs_build_act = True

    return {
        "missing_messages": missing_messages,
        "needs_filter": needs_filter,
        "needs_combine": needs_combine,
        "needs_build_act": needs_build_act,
    }


def run_data_script(project_root: Path, script_name: str) -> bool:
    script_path = project_root / "scripts" / script_name
    if not script_path.exists():
        print(f"Cannot run {script_name}: script not found at {script_path}")
        return False

    print(f"Running {script_name}...")
    result = subprocess.run([sys.executable, str(script_path)], cwd=project_root)
    if result.returncode != 0:
        print(f"{script_name} failed with exit code {result.returncode}.")
        return False
    print(f"{script_name} completed.")
    return True


def ensure_data_ready(project_root: Path) -> bool:
    status = detect_missing_data(project_root)
    missing_messages = status["missing_messages"]

    if not missing_messages:
        print("All required data files are present.")
        return True

    print("\nData checks found missing content:")
    for message in missing_messages:
        print(f" - {message}")

    if status["needs_filter"] and not run_data_script(project_root, "filterTranscripts.py"):
        return False

    if status["needs_combine"] and not run_data_script(project_root, "combineToMasterData.py"):
        return False

    if status["needs_build_act"] and not run_data_script(project_root, "buildActCharacterDataset.py"):
        return False

    final_status = detect_missing_data(project_root)
    if final_status["missing_messages"]:
        print("\nData is still missing after attempted rebuild:")
        for message in final_status["missing_messages"]:
            print(f" - {message}")
        return False

    print("\nData generation complete. Required files are present.")
    return True


def main() -> int:
    project_root = project_root_from_script()
    py_files = discover_python_files(project_root)

    if not py_files:
        print("No Python files found to analyze.")
        return 0

    imported = find_imported_modules(py_files)
    local_modules = discover_local_module_names(py_files, project_root)
    stdlib = stdlib_module_names()

    third_party = sorted(
        name
        for name in imported
        if name not in stdlib and name not in local_modules and name != "__future__"
    )

    if not third_party:
        print("No third-party libraries were detected.")
        return 0

    missing = [name for name in third_party if not is_installed(name)]

    print("Detected third-party libraries:")
    for name in third_party:
        print(f" - {name}")

    if not missing:
        print("\nAll required libraries are installed.")
        data_ok = ensure_data_ready(project_root)
        return 0 if data_ok else 1

    print("\nMissing libraries:")
    for name in missing:
        pip_name = PIP_NAME_MAP.get(name, name)
        print(f" - {name} (install with: pip install {pip_name})")

    print("\nInstall missing libraries first, then run this checker again to build data files.")

    return 1


if __name__ == "__main__":
    raise SystemExit(main())

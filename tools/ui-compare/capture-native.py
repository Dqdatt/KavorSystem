"""Chụp từng trạng thái của app native trên simulator iPhone 11 qua deep link kavor://qa/<state>.

Yêu cầu: app build với EXPO_PUBLIC_KAVOR_QA=1 đang chạy trên simulator đã boot.
Chạy: python3 -I tools/ui-compare/capture-native.py [state ...]
Ảnh gốc (828×1792) lưu ở $UI_RAW/native nếu có biến môi trường UI_RAW; ảnh 390×844 lưu ở docs/ui-comparison/native/.
"""
import os, re, subprocess, sys, time
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "ui-comparison" / "native"
STATES = re.findall(r'^\s+"?([a-z0-9-]+)"?: `', (ROOT / "tools/ui-compare/states.mjs").read_text(), re.M)
RAW = os.environ.get("UI_RAW")
WAIT = float(os.environ.get("UI_WAIT", "2.4"))


def run(*cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    names = sys.argv[1:] or STATES
    OUT.mkdir(parents=True, exist_ok=True)
    for name in names:
        run("xcrun", "simctl", "openurl", "booted", f"kavor://qa/{name}")
        time.sleep(0.6 if name == "error-e26-slow-network" else WAIT + (1.2 if name in ("spring-home", "pin", "home-scrolled") else 0))
        tmp = Path(RAW or "/tmp") / "native" / f"{name}.png"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        run("xcrun", "simctl", "io", "booted", "screenshot", str(tmp))
        Image.open(tmp).convert("RGB").resize((390, 844), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)
        print("captured", name)


if __name__ == "__main__":
    main()

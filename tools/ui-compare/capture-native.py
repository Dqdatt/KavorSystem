"""Chụp từng trạng thái của app native qua deep link kavor://qa/<state>.

iOS (mặc định): simulator iPhone 11 đã boot → docs/ui-comparison/native/.
Android (UI_PLATFORM=android): emulator đặt màn 828×1792 @320dpi (= 414×896 dp như iPhone 11)
  bằng `adb shell wm size 828x1792 && adb shell wm density 320` → docs/ui-comparison/android/.
Yêu cầu: app build với EXPO_PUBLIC_KAVOR_QA=1.
Chạy: python3 -I tools/ui-compare/capture-native.py [state ...]
Ảnh gốc lưu ở $UI_RAW/<platform> nếu có biến môi trường UI_RAW; ảnh 390×844 lưu trong docs/ui-comparison/.
"""
import os, re, subprocess, sys, time
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PLATFORM = os.environ.get("UI_PLATFORM", "ios")
OUT = ROOT / "docs" / "ui-comparison" / ("android" if PLATFORM == "android" else "native")
STATES = re.findall(r'^\s+"?([a-z0-9-]+)"?: `', (ROOT / "tools/ui-compare/states.mjs").read_text(), re.M)
RAW = os.environ.get("UI_RAW")
WAIT = float(os.environ.get("UI_WAIT", "2.4" if PLATFORM == "ios" else "5.0"))
ADB = os.environ.get("ADB", str(Path.home() / "Library/Android/sdk/platform-tools/adb"))


def run(*cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def open_url(url):
    if PLATFORM == "android":
        run(ADB, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url, "vn.kavor.mobile")
    else:
        run("xcrun", "simctl", "openurl", "booted", url)


def screenshot(path):
    if PLATFORM == "android":
        with open(path, "wb") as f:
            subprocess.run([ADB, "exec-out", "screencap", "-p"], check=True, stdout=f)
    else:
        run("xcrun", "simctl", "io", "booted", "screenshot", str(path))


def main():
    names = sys.argv[1:] or STATES
    OUT.mkdir(parents=True, exist_ok=True)
    for name in names:
        open_url(f"kavor://qa/{name}")
        time.sleep((0.6 if PLATFORM == "ios" else 1.6) if name == "error-e26-slow-network" else WAIT + (1.2 if name in ("spring-home", "pin", "home-scrolled") else 0))
        tmp = Path(RAW or "/tmp") / OUT.name / f"{name}.png"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        screenshot(tmp)
        Image.open(tmp).convert("RGB").resize((390, 844), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)
        print("captured", name)


if __name__ == "__main__":
    main()

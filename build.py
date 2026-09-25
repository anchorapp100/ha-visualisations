"""Build HA Visualisations: concatenate src/*.js -> dist/voice-visuals.js (+ version.json, the gallery and the loader).

Non-ASCII characters are escaped (\\uXXXX) so the bundle decodes identically whatever charset it is served with.
Run:  python build.py   (then `node --check` runs automatically if Node.js is installed)
"""
import datetime, glob, json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")


def main():
    parts = sorted(glob.glob(os.path.join(ROOT, "src", "*.js")))
    ver = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    js = "\n".join(open(p, encoding="utf-8").read() for p in parts).replace("__VV_VERSION__", ver)
    js = "".join(c if ord(c) < 128 else "\\u%04x" % ord(c) for c in js)
    os.makedirs(DIST, exist_ok=True)
    with open(os.path.join(DIST, "voice-visuals.js"), "w", encoding="ascii", newline="\n") as f:
        f.write(js)
    with open(os.path.join(DIST, "version.json"), "w", encoding="ascii", newline="\n") as f:
        json.dump({"version": ver}, f)
    shutil.copyfile(os.path.join(ROOT, "gallery.html"), os.path.join(DIST, "gallery.html"))
    shutil.copyfile(os.path.join(ROOT, "loader.js"), os.path.join(DIST, "voice-visuals-loader.js"))
    if shutil.which("node"):
        for name in ("voice-visuals.js", "voice-visuals-loader.js"):
            r = subprocess.run(["node", "--check", os.path.join(DIST, name)], capture_output=True, text=True)
            if r.returncode:
                print(r.stderr); sys.exit("syntax check failed: " + name)
    print("built", ver, "-", len(js), "bytes from", len(parts), "sources")


if __name__ == "__main__":
    main()

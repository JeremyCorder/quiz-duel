#!/usr/bin/env python3
"""Builds site/ from src/: one index.html with everything inlined, plus the fonts."""
import pathlib, shutil
root = pathlib.Path(__file__).parent
src, out = root / "src", root / "site"
out.mkdir(exist_ok=True)
read = lambda n: (src / n).read_text(encoding="utf8")
def safe(js):  # a script may not contain the text "</script"
    return js.replace("</script", "<\\/script")
import os, json
# where students download the Quiz Duel app: the GitHub releases of this project
# (Netlify sets REPOSITORY_URL while it builds; QD_DOWNLOAD_BASE overrides it)
repo = os.environ.get("QD_DOWNLOAD_BASE") or (os.environ.get("REPOSITORY_URL", "").rstrip("/") + "/releases/latest/download" if os.environ.get("REPOSITORY_URL", "").startswith("https://github.com/") else "https://github.com/JeremyCorder/quiz-duel/releases/latest/download")
downloads = {"win": repo + "/QuizDuel-Setup.exe" if repo else "", "mac": repo + "/QuizDuel.dmg" if repo else ""}
html = read("template.html")
html = html.replace("/*EXAMBLOB*/", "window.QD_DOWNLOADS = " + json.dumps(downloads) + ";\n" + safe(read("exam_blob.js")), 1)
html = html.replace("/*CORE*/", safe(read("core.js") + "\n" + read("builtin.js") + "\n" + read("music.js")), 1)
html = html.replace("/*APP*/", safe(read("app.js")), 1)
(out / "index.html").write_text(html, encoding="utf8")
shutil.copytree(src / "fonts", out / "fonts", dirs_exist_ok=True)
print(f"built site/index.html {len(html) // 1024} KB; app downloads: {downloads['win'] or '(not set)'}")

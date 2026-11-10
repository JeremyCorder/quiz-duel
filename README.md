# Quiz Duel

Live quizzes for any subject. Teachers run quizzes (one per class period if they like),
students join with a code, and high-security quizzes run in the Quiz Duel app, which locks
the computer.

## What's in this folder

| Folder / file | What it is |
|---|---|
| `src/` | The website's code. `build.py` turns it into `site/` (Netlify does this for you). |
| `netlify.toml` | Tells Netlify how to build the site. |
| `desktop/` | The Quiz Duel app for Windows and Mac. |
| `.github/workflows/desktop.yml` | Builds the app installers on GitHub. |

## Setting it up (once)

1. **Put the project on GitHub.** Make a free account at github.com, then **New repository**,
   name it `quiz-duel`, choose **Public** (students need to download the app from it), and create it.
   On the new repository's page click **uploading an existing file** and drag in everything
   inside this folder. Commit.
   - Check that `.github/workflows/desktop.yml` arrived. If it didn't (some browsers skip
     folders that start with a dot), click **Add file → Create new file**, type
     `.github/workflows/desktop.yml` as the name, paste in the file's contents, and commit.
2. **Connect Netlify to it.** In Netlify open your site (quizduelsite) → **Site configuration →
   Build & deploy → Link repository** → GitHub → `quiz-duel`. Netlify reads `netlify.toml`, so
   leave the build settings as they are.
3. **Deploy.** Netlify → **Deploys → Trigger deploy**.
4. **Build the app.** On GitHub: **Releases → Draft a new release → Choose a tag** → type
   `app-v1.0.0` → **Publish release**. In about 10 minutes the **Actions** tab finishes and the
   release has `QuizDuel-Setup.exe` (Windows) and `QuizDuel.dmg` (Mac). The website's download
   buttons point there automatically.
   - If your site isn't `https://quizduelsite.netlify.app/`, first add a repository variable
     (**Settings → Secrets and variables → Actions → Variables**) named `QUIZDUEL_SITE_URL`
     with your site's address.

## Installing the app (students)

The app isn't code-signed yet, so the computer warns the first time:
- **Windows:** "Windows protected your PC" → **More info → Run anyway**.
- **Mac:** open the .dmg, drag Quiz Duel to Applications, then right-click it → **Open**. On newer
  Macs: **System Settings → Privacy & Security → Open Anyway**.

A Windows code-signing certificate (a few hundred dollars a year) and an Apple Developer account
($99/year) remove these warnings.

## Changing the code

Edit `src/`, then run `python3 build.py` to make `site/` and open `site/index.html`
through a local web server. Pushing to GitHub redeploys Netlify automatically.

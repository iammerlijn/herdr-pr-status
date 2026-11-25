// PR status: for each space, the pull request of the git branch its terminals
// are on, as one icon. Shared as shared("pr-status") = { [space id]: { icon, color, url } }
// (icon: an SVG file for svg()). A sidebar mod draws it (see space-folders).
// Needs `gh`, logged in, on this computer.
import { View, div } from "gpui-kit";
import { spaces, panes, exec, setShared, appHome } from "herdr";
import * as fs from "fs/promises";

const EVERY = 120000;

// A space with more than one PR shows the first state here that it has.
// Icons: GitHub Octicons (MIT, github.com/primer/octicons), 16 px. Colors: GitHub's dark theme.
const STATES = [
  { state: "failing", color: "#f85149", path: "M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" },
  { state: "draft", color: "#9198a1", path: "M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" },
  { state: "open", color: "#3fb950", path: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" },
  { state: "approved", color: "#3fb950", path: "M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z" },
  { state: "merged", color: "#ab7df8", path: "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z" },
  { state: "closed", color: "#f85149", path: "M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" },
];
// Herdr draws images only from real folders, and this mod's folder can be a link:
// the icons go to the app's data folder.
const ICONS = "data/pr-status";
const FAILED = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]);

function stateOf(pr) {
  if (pr.state === "MERGED") return "merged";
  if (pr.state === "CLOSED") return "closed";
  if (pr.isDraft) return "draft";
  if ((pr.statusCheckRollup ?? []).some((c) => FAILED.has(c.conclusion || c.state))) return "failing";
  return pr.reviewDecision === "APPROVED" ? "approved" : "open";
}

// A program's exit code and output; a failed start (a machine that is offline,
// no `gh`) counts as an exit code too.
const run = (cmd, args, opts) => exec(cmd, args, opts).catch(() => ({ code: -1, stdout: "" }));

// The GitHub repo of a folder ("owner/name") and its default branch, which has no PR
// of its own. Kept per folder once found.
const repos = new Map();
async function repoOf(cwd, on) {
  const key = `${on ?? ""}\n${cwd}`;
  if (repos.has(key)) return repos.get(key);
  const url = await run("git", ["-C", cwd, "remote", "get-url", "origin"], { on });
  const name = url.code === 0 && url.stdout.trim().match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];
  if (!name) return null;
  const head = await run("git", ["-C", cwd, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { on });
  const repo = { name, base: head.stdout.trim().replace(/^origin\//, "") };
  repos.set(key, repo);
  return repo;
}

async function prOf(repo, branch) {
  const r = await run("gh", ["pr", "view", branch, "-R", repo, "--json", "state,isDraft,reviewDecision,statusCheckRollup,url"]);
  try { return r.code === 0 ? JSON.parse(r.stdout) : null; } catch { return null; }
}

async function writeIcons() {
  await fs.mkdir(`${appHome()}/${ICONS}`, { recursive: true });
  await Promise.all(STATES.map(({ state, path }) =>
    fs.writeFile(`${appHome()}/${ICONS}/${state}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="${path}"/></svg>`)));
}

// The icon of one space: the PRs of the branches its terminals are on.
async function statusOf(space, ps) {
  const tabs = new Set(space.tabs.map((t) => t.id));
  const folders = new Map(ps.filter((p) => p.branch && p.cwd && tabs.has(p.tab)).map((p) => [p.cwd, p.branch]));
  const found = await Promise.all([...folders].map(async ([cwd, branch]) => {
    const repo = await repoOf(cwd, space.machine);
    const pr = repo && repo.base !== branch ? await prOf(repo.name, branch) : null;
    return pr && { state: stateOf(pr), url: pr.url };
  }));
  const shown = STATES.find((x) => found.some((f) => f?.state === x.state));
  return shown && { icon: `${ICONS}/${shown.state}.svg`, color: shown.color, url: found.find((f) => f?.state === shown.state).url };
}

async function statuses() {
  const all = spaces(), ps = panes();
  const icons = await Promise.all(all.map((s) => statusOf(s, ps)));
  return Object.fromEntries(all.map((s, i) => [s.id, icons[i]]).filter(([, icon]) => icon));
}

export default class PrStatus extends View {
  init(_props, cx) {
    this.icons = writeIcons();
    this.refresh(cx);
    cx.timer.every(EVERY, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async () => {
      try {
        await this.icons;
        setShared("pr-status", await statuses());
      } finally { this.busy = false; }
    });
  }

  render() {
    return div();
  }
}

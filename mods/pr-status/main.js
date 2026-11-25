// PR status: for each space, the pull request of the git branch its terminal
// panes are on, as one icon. Shared as shared("pr-status") = { [space id]: { icon, color } }
// (icon: an SVG file for svg()). A sidebar mod draws it (see space-folders).
// Needs `gh`, logged in, on this computer.
import { View, div } from "gpui-kit";
import { spaces, panes, exec, setShared, checking } from "herdr";

const EVERY = 120000;

// A space with more than one PR shows the first state here that it has.
// Icons: GitHub Octicons (MIT, github.com/primer/octicons), 16 px, in icons/<state>.svg.
// Colors: GitHub's dark theme.
const STATES = [
  { state: "failing", color: "#f85149" },
  { state: "draft", color: "#9198a1" },
  { state: "open", color: "#3fb950" },
  { state: "approved", color: "#3fb950" },
  { state: "merged", color: "#ab7df8" },
  { state: "closed", color: "#f85149" },
];
const ICONS = "mods/pr-status/icons";
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

// The hosts `gh` is logged in to: github.com and GitHub Enterprise hosts. Kept once found
// (one look at a time); without an answer (no `gh`, an old `gh`) only github.com, and the
// next check asks again.
let hosts = null;
function ghHosts() {
  hosts ??= run("gh", ["auth", "status", "--json", "hosts"]).then((r) => {
    try { return new Set(Object.keys(JSON.parse(r.stdout).hosts).map((h) => h.toLowerCase())); }
    catch { hosts = null; return new Set(["github.com"]); }
  });
  return hosts;
}

// Host and "owner/name" of a remote: a URL (https://host/o/n.git, ssh://git@host:22/o/n)
// or the SCP form git@host:o/n.git.
const REMOTE = [
  /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i,
  /^(?:[^@/:]+@)?([^/:]+):([^/]+\/[^/]+?)(?:\.git)?$/i,
];
const parseRemote = (remote) => REMOTE.map((re) => remote.match(re)).find(Boolean);

// The GitHub repo of a folder ("host/owner/name", for `gh -R`) and its default branch,
// which has no PR of its own. Kept per folder once found; a failure is tried again
// at the next check. Folders that look at the same time share one look.
const repos = new Map();
function repoOf(cwd, on) {
  const key = `${on ?? ""}\n${cwd}`;
  if (!repos.has(key)) repos.set(key, findRepo(cwd, on).then((repo) => (repo || repos.delete(key), repo)));
  return repos.get(key);
}
async function findRepo(cwd, on) {
  const url = await run("git", ["-C", cwd, "remote", "get-url", "origin"], { on });
  const m = url.code === 0 && parseRemote(url.stdout.trim());
  if (!m || !(await ghHosts()).has(m[1].toLowerCase())) return null;
  const head = await run("git", ["-C", cwd, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { on });
  const base = head.code === 0 && head.stdout.trim().match(/^origin\/(.+)$/)?.[1];
  if (!base) return null;
  return { name: `${m[1].toLowerCase()}/${m[2]}`, base };
}

async function prOf(repo, branch) {
  const r = await run("gh", ["pr", "view", branch, "-R", repo, "--json", "state,isDraft,reviewDecision,statusCheckRollup"]);
  try { return r.code === 0 ? JSON.parse(r.stdout) : null; } catch { return null; }
}

// The icon of one space: the PRs of the branches its terminal panes are on.
// `prs`: the PR look of each repo and branch in this check, shared by all spaces.
async function statusOf(space, ps, prs) {
  const tabs = new Set(space.tabs.map((t) => t.id));
  const folders = new Map(ps.filter((p) => p.branch && p.cwd && tabs.has(p.tab)).map((p) => [p.cwd, p.branch]));
  const found = await Promise.all([...folders].map(async ([cwd, branch]) => {
    const repo = await repoOf(cwd, space.machine);
    if (!repo || repo.base === branch) return null;
    const key = `${repo.name}\n${branch}`;
    if (!prs.has(key)) prs.set(key, prOf(repo.name, branch));
    const pr = await prs.get(key);
    return pr && stateOf(pr);
  }));
  const shown = STATES.find((x) => found.includes(x.state));
  return shown && { icon: `${ICONS}/${shown.state}.svg`, color: shown.color };
}

async function statuses() {
  const all = spaces(), ps = panes(), prs = new Map();
  const icons = await Promise.all(all.map((s) => statusOf(s, ps, prs)));
  return Object.fromEntries(all.map((s, i) => [s.id, icons[i]]).filter(([, icon]) => icon));
}

export default class PrStatus extends View {
  init(_props, cx) {
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(EVERY, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async () => {
      try {
        setShared("pr-status", await statuses());
      } finally { this.busy = false; }
    });
  }

  render() {
    return div();
  }
}

import { exec as _exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const exec = promisify(_exec);

export async function performSelfUpdate() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const repoRoot = join(__dirname, '..', '..');
  const backendDir = join(__dirname, '..');

  const steps = [];
  const run = async (cmd, cwd) => {
    const res = await exec(cmd, { cwd, windowsHide: true });
    return { stdout: res.stdout?.trim(), stderr: res.stderr?.trim() };
  };

  // Detect git repo
  let inRepo = false;
  try {
    const { stdout } = await run('git rev-parse --is-inside-work-tree', repoRoot);
    inRepo = stdout === 'true';
  } catch (_) {}

  let pulled = null;
  let currentBranch = null;
  let before = null;
  let after = null;
  let deps = null;

  try {
    if (inRepo) {
      // Identify branch and current commit
      currentBranch = (await run('git rev-parse --abbrev-ref HEAD', repoRoot)).stdout;
      before = (await run('git rev-parse --short HEAD', repoRoot)).stdout;
      // Fetch and pull
      await run('git fetch --all --prune', repoRoot);
      await run(`git pull --rebase --autostash origin ${currentBranch}`, repoRoot);
      after = (await run('git rev-parse --short HEAD', repoRoot)).stdout;
      pulled = before !== after;
      steps.push({ step: 'git', ok: true, before, after, branch: currentBranch, pulled });
    } else {
      steps.push({ step: 'git', ok: false, reason: 'No es un repositorio git' });
    }
  } catch (err) {
    steps.push({ step: 'git', ok: false, error: err?.message });
  }

  try {
    // Install backend deps
    deps = await run('npm ci --omit=dev', backendDir);
    steps.push({ step: 'deps', ok: true, out: deps.stdout?.slice(0, 200) });
  } catch (err) {
    steps.push({ step: 'deps', ok: false, error: err?.message });
  }

  return {
    success: true,
    git: { inRepo, branch: currentBranch, before, after, pulled },
    steps
  };
}

export default { performSelfUpdate };


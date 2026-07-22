const core = require('@actions/core');
const github = require('@actions/github');
const { minimatch } = require('minimatch');

const MARKER = '<!-- merge-conflict-radar -->';

async function run() {
  try {
    const token = core.getInput('github-token', { required: false }) || process.env.GITHUB_TOKEN;
    if (!token) {
      core.setFailed('No GitHub token available. Pass `github-token` or ensure GITHUB_TOKEN is set.');
      return;
    }

    const ignorePatterns = core
      .getInput('ignore-paths')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const minShared = parseInt(core.getInput('min-shared-files') || '1', 10);

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const pull_number = github.context.payload.pull_request?.number;

    if (!pull_number) {
      core.info('No pull request in this event context, skipping.');
      return;
    }

    const isIgnored = (filename) => ignorePatterns.some((pattern) => minimatch(filename, pattern));

    const currentFiles = await getChangedFiles(octokit, owner, repo, pull_number, isIgnored);

    const openPulls = await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });

    const collisions = [];
    for (const pr of openPulls) {
      if (pr.number === pull_number) continue;
      const otherFiles = await getChangedFiles(octokit, owner, repo, pr.number, isIgnored);
      const shared = currentFiles.filter((f) => otherFiles.includes(f));
      if (shared.length >= minShared) {
        collisions.push({ number: pr.number, title: pr.title, files: shared });
      }
    }

    await upsertComment(octokit, owner, repo, pull_number, collisions);
    core.setOutput('collisions', JSON.stringify(collisions));
    core.info(`Found ${collisions.length} colliding pull request(s).`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function getChangedFiles(octokit, owner, repo, pull_number, isIgnored) {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  return files.map((f) => f.filename).filter((f) => !isIgnored(f));
}

async function upsertComment(octokit, owner, repo, pull_number, collisions) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pull_number,
    per_page: 100,
  });
  const existing = comments.find((c) => c.body && c.body.includes(MARKER));

  if (collisions.length === 0) {
    if (existing) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body: `${MARKER}\n✅ No overlap with other open pull requests right now.`,
      });
    }
    return;
  }

  const body = [
    MARKER,
    '⚠️ **Possible merge conflict ahead.** This PR shares changed files with other open pull requests:',
    '',
    ...collisions.map((c) => `- #${c.number} **${c.title}** — \`${c.files.join('`, `')}\``),
    '',
    'Coordinate merge order, or plan to rebase after one of these lands.',
  ].join('\n');

  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: pull_number, body });
  }
}

run();

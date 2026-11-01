// One command for the whole publish routine: images, videos, draft flag, commit
// and push. Each step is awaited, and nothing is committed while the note still
// has local media, because Blogs/assets/ is gitignored and those links would
// break on the site.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { MarkdownView, Notice, Plugin } = require('obsidian');

const run = promisify(execFile);

const IMAGE_PLUGIN = 'image-upload-toolkit';
const VIDEO_PLUGIN = 'attachment-uploader';
const GIT_PLUGIN = 'obsidian-git';
// The toolkit's only action; it also copies the note to the clipboard.
const IMAGE_ACTION = 'PUBLISH';

const POSTS_FOLDER = 'Blogs/';
const FAILURE_NOTICE_MS = 15000;
const LOCAL_EMBED = /!\[\[[^\]]+\]\]|!\[[^\]]*\]\((?!https?:\/\/)[^)]+\)/g;

function findLocalEmbeds(markdown) {
  return markdown.match(LOCAL_EMBED) ?? [];
}

class PublishPostPlugin extends Plugin {
  isPublishing = false;

  async onload() {
    this.addCommand({
      id: 'publish',
      name: 'Publish',
      callback: () => this.publishActiveNote(),
    });
    this.addRibbonIcon('rocket', 'Publish post', () => this.publishActiveNote());
  }

  async publishActiveNote() {
    if (this.isPublishing) {
      new Notice('Already publishing.');
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file?.path.startsWith(POSTS_FOLDER)) {
      new Notice(`Open a post in ${POSTS_FOLDER} first.`);
      return;
    }

    this.isPublishing = true;
    const status = new Notice('Publishing...', 0);
    try {
      await this.publish(view, status);
      new Notice(`Published "${view.file.basename}". The site rebuilds now.`);
    } catch (error) {
      new Notice(`Publish stopped: ${error.message}`, FAILURE_NOTICE_MS);
    } finally {
      status.hide();
      this.isPublishing = false;
    }
  }

  async publish(view, status) {
    const file = view.file;

    status.setMessage('Uploading images...');
    await this.requirePlugin(IMAGE_PLUGIN).imageTagProcessor.process(IMAGE_ACTION);

    await view.save();
    if (findLocalEmbeds(await this.app.vault.read(file)).length > 0) {
      status.setMessage('Compressing and uploading videos. This can take minutes...');
      await this.requirePlugin(VIDEO_PLUGIN).uploadEditorAttachment();
    }

    await view.save();
    const remaining = findLocalEmbeds(await this.app.vault.read(file));
    if (remaining.length > 0) {
      throw new Error(`nothing pushed, still local: ${remaining.join(', ')}`);
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.draft = false;
    });

    status.setMessage('Committing and pushing...');
    await this.commitAndPush(file);
  }

  async commitAndPush(file) {
    const git = this.requirePlugin(GIT_PLUGIN);
    // Queued like Obsidian Git's own commands so it can't overlap a running one.
    await new Promise((resolve) => {
      git.promiseQueue.addTask(
        () => git.commitAndSync({ fromAutoBackup: false, commitMessage: `publish: ${file.basename}` }),
        resolve,
      );
    });
    await this.assertPushed(file);
  }

  // Obsidian Git shows its errors but doesn't report them to callers.
  async assertPushed(file) {
    const cwd = this.app.vault.adapter.getBasePath();
    const { stdout: uncommitted } = await run('git', ['status', '--porcelain', '--', file.path], { cwd });
    if (uncommitted.trim()) {
      throw new Error('commit failed, see the Obsidian Git message');
    }
    const { stdout: unpushed } = await run('git', ['rev-list', '--count', '@{upstream}..HEAD'], { cwd });
    if (unpushed.trim() !== '0') {
      throw new Error('committed but push failed, see the Obsidian Git message');
    }
  }

  requirePlugin(id) {
    const plugin = this.app.plugins.plugins[id];
    if (!plugin) {
      throw new Error(`plugin "${id}" is not enabled`);
    }
    return plugin;
  }
}

module.exports = PublishPostPlugin;

# PlainOB 1.4.2

Prepared on 2026-11-13. Community directory listing is not yet complete.

## Changes

- Pause automatic task-property updates and category routing on fresh installs until the user confirms setup. Preserve this pause across restarts. Existing saved installations without a setup marker remain compatible.
- Cancel pending startup callbacks and queued operations after unloading; clear view debounce and note-dialog focus timers, and discard closed or cancelled search results.
- Prevent repeated Enter presses from starting duplicate note creation.
- Search all Markdown notes in the vault, including the vault root and folders outside the workbench mappings. Task management continues to use the configured folders.
- Use a descriptive plugin-directory summary and add the maintainer's public profile and Ko-fi URL to the manifest. The tagline remains Simple Notes & Tasks.

## Validation and release boundary

79 automated checks pass locally. The source archive rebuilds to the same runtime and can package itself; archive checksums and local documentation links are verified. These checks use API/filesystem simulations, not native Obsidian UI automation.

The user reported that Windows 1.4.2 search, task movement, reopening and project archiving work, and that macOS upgrade/use from 1.4.0 works. On Mac, an apparent old-version issue was resolved by moving a duplicate backup plugin folder outside `plugins`. These are user reports, not independently observed UI tests. Extended fresh-install checks remain unconfirmed, and the official directory review has not run. See the [community review](COMMUNITY-REVIEW.md) and [release checklist](RELEASE-CHECKLIST.md).

Windows and macOS desktop, Obsidian 1.15.0+. For testing an upgrade, close PlainOB, replace only `main.js`, `manifest.json` and `styles.css` in its existing plugin folder, then re-enable it. Keep `data.json`, notes, templates and backups. Do not run new-system setup to upgrade an existing installation.

---

主要修复首次安装未确认向导时仍可能自动修改项目状态的问题，以及关闭插件后残留的排队操作；补充重复创建保护，并让搜索覆盖整个笔记库的 Markdown 笔记。任务和归类仍按已配置目录运行。

79 项自动检查通过；源码重建、打包和校验通过。已收到 Windows 端 1.4.2 测试正常与 Mac 端从 1.4.0 升级使用正常的反馈。升级时将整份插件备份放在 plugins 目录之外，保留原有 data.json、笔记与模板。扩展首次安装场景与官方社区审核仍待完成。

Keep whole-folder plugin backups outside the `plugins` directory to avoid duplicate plugin discovery. See the [upgrade guide](INSTALL.en.md#upgrade).

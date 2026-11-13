# Community submission review / 社区上架前检查

Review date: 2026-11-13. Reviewed runtime: 1.4.2. Earlier public preview: 1.4.1.

## Findings addressed / 已处理

| Finding | Change | Evidence |
| --- | --- | --- |
| Fresh startup could update existing project summaries before setup confirmation. | Gate startup reconciliation, deletion-triggered summaries and category routing on confirmed setup; persist the pending state. | Integration tests cover restart, metadata/create/delete events and confirmed/legacy saved settings. |
| Late layout callbacks or queued work could execute after unload. | Guard callbacks and queued jobs, cancel pending frontmatter reads and view timers. | Unload and in-flight read regression tests. |
| Repeated Enter could create concurrent requests. | Allow only one note-creation request at a time. | Deferred-write regression test. |
| Global search excluded Markdown notes outside mapped workbench roots. | Read all vault Markdown notes, retain bounded highlighted results and navigation, discard stale results on close/unload. | Root/outside-folder title and passage search tests; no note writes. |
| Manifest description was only the tagline. | Describe the three functions; add public author and funding URLs. | Manifest/archive inspection. |

## Code, installation and privacy / 代码、安装与隐私

- Runtime imports only Obsidian; no Node/Electron imports, network client, telemetry, self-update or dependency installer was found in the reviewed runtime.
- Supported distribution remains Windows/macOS desktop with relative vault paths. Mobile is outside this review. Chinese/English interface language is independent of folder presets.
- Note changes use Vault/FileManager APIs. Archive/restore paths are bounded by the configured roots and recorded origins; name conflicts stop movement. Existing tests cover whole-project recovery and independent task recovery.
- Installation previews and preflights changes, preserves existing templates/lists by default, and journals optional writes with backups. Source/installer packaging uses an explicit allowlist without reading a personal vault.
- Optional Metadata Menu support uses Obsidian's internal plugin registry for presence checks and a version-gated local configuration adapter. The currently supported preset version is 0.8.12; configuration changes require that plugin to be disabled. This internal API is a compatibility risk and remains a point for official scanner review. It is not a required dependency.
- Optional AI rules and video embeds are disclosed separately in [Privacy](PRIVACY.md); third-party tools and external pages have their own network behavior.

## Verified locally / 本地验证

- 79 automated tests passed, including setup language/folder combinations, task transitions, project summaries, archive recovery, ordering, search and lifecycle regressions.
- Installer/source archive integrity and SHA-256 checks passed; relative Markdown links resolve and private example notes, saved settings and backups are excluded.
- Extracted sources rebuild to byte-identical runtime output and can repackage independently. Build command: `python work/build_workbench.py`; Python 3 and Node.js 22 are documented development prerequisites. No Python installation is required by plugin users.
- The local review did not change an installed personal vault. The public 1.4.1 release files remain unchanged; publication status for 1.4.2 is available on GitHub. Community submission is a separate step.

## Before publication/submission / 后续验证

1. In separate Windows/macOS test vaults, check a fresh installation stays paused before confirming the wizard; restart once before confirmation.
2. Upgrade a copy of a configured 1.4.1 test vault by replacing only the three runtime files. Confirm settings, notes and templates remain; exercise task movement, completion/reopening, project archive/restore and same-column sorting.
3. Search a root-level note and a note outside mapped folders, then confirm sentence navigation in the real editor. Confirm closing search or disabling the plugin leaves no delayed UI action.
4. Run the official community directory review against the exact candidate commit and inspect code, CSS, manifest, dependency and build findings. No official scan result is claimed here; scanner compatibility with the documented Python build has not been verified.
5. Publish an incremented GitHub release only after acceptance, with a tag matching the manifest and the three runtime assets. Submit through the current community directory process; local checks do not constitute approval or listing.

For 1.4.2, the user reported successful Windows testing and successful macOS upgrade/use from 1.4.0. The Windows confirmation covered search, task movement, reopening and project archiving. The Mac duplicate-backup-folder issue was resolved without changing runtime code. Extended fresh-install scenarios remain unconfirmed. Prior CI runs for 1.4.1 are historical evidence; inspect Actions for the exact 1.4.2 release commit.

## Official references / 官方依据

- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Plugin submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Lifecycle management](https://docs.obsidian.md/plugins/guides/lifecycle-management)
- [Submit a plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin)
- [Directory reviews and preview scans](https://docs.obsidian.md/community-directory/manage-entry)

本轮代码、安装边界和发布材料检查已完成，已发现的问题已修复并通过自动检查。已收到 1.4.2 双端使用正常的反馈，备份目录说明已补充。GitHub 发布状态以 Releases 为准；官方社区扫描与上架仍需单独完成。

# Contributing

Use Python 3 and Node.js 22 LTS or later. Build with `python work/build_workbench.py`, run `node --test work/workbench/*.test.js`, then run `python work/package_public.py`. No npm dependencies are needed. GitHub Actions runs the same checks on Windows and macOS; these are automated checks, not native Obsidian UI tests.

Keep runtime code vault-relative and dependent only on the Obsidian API and browser environment. Use Vault/FileManager APIs for note changes. Preserve existing content on conflicts. Interface language must not rename user folders or translate user-authored note titles.

Change `work/public-release/` for public documentation. Public packages must never read files from a developer's vault, `data.json`, profiles or backups. `work/package_public.py` is the allowlist and privacy boundary; add new files deliberately. Source code uses legacy identifiers only for backward compatibility.

When reporting a bug, include the plugin version, Obsidian version, operating system, interface language, directory preset and minimal steps in a test vault. Share redacted property examples if needed. Do not post credentials, full vault backups or private profiles.

Before release, complete `docs/RELEASE-CHECKLIST.md`. Public publication and community directory submission are separate manual actions.

## Publishing an update / 发布更新

1. Implement the change, preserving vault-relative mappings and existing note properties. Keep the plugin ID `plainob` stable. If a future change needs a settings or note-format migration, design and test it explicitly with backups before release; do not assume the setup wizard migrates old data.
2. Set the new version in `work/workbench/manifest.json`. Add the corresponding minimum Obsidian version in `work/workbench/versions.json`, retaining every previously published entry. Update version-specific documentation and changelog. Use patch versions for fixes, minor versions for compatible additions and major versions for incompatible changes.
3. Build, test and package; test an upgrade from the previous release on Windows and macOS, with customized settings and task notes. Check optional integrations separately when affected.
4. Review the source and release assets. With publication approval, push to the chosen repository and create a GitHub Release tagged with the exact manifest version, without a `v` prefix. Attach the built `main.js`, `manifest.json`, `styles.css` as individual assets; the installer ZIP is an additional convenience. Keep root `manifest.json` and `versions.json` current.
5. Before community listing, offer manual installation and optionally BRAT. After listing, use Obsidian's normal update mechanism. PlainOB itself must not download or install its own updates or dependencies.

升级沿用相同插件 ID，只替换发布代码，保留使用者配置和笔记。新建向导不作为版本升级步骤。若未来涉及设置或属性格式变化，需单独实现并验证迁移；当前并未提供通用的自动笔记格式迁移功能。发布步骤均在用户决定发布后执行。

Official references: [release files and version tags](https://github.com/obsidianmd/obsidian-sample-plugin#releasing-new-releases), [community update instructions](https://help.obsidian.md/community-plugins), [BRAT](https://tfthacker.com/BRAT), [developer policies](https://docs.obsidian.md/community-directory/developer-policies).

## Repository About text / 仓库简短介绍

English: A simple Obsidian dashboard for finding notes, browsing your knowledge and managing everyday tasks.

中文：一个简单的 Obsidian 工作台：搜索笔记、浏览知识目录、管理日常任务。

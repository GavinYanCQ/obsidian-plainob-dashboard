# Changelog

## 1.4.2 — Release

- Keep fresh-install automatic task updates and category routing paused until setup is confirmed, including across restarts. Preserve compatibility with earlier saved installations.
- Guard delayed startup, queued jobs and search reads after plugin unload; clean up pending view and note-dialog timers.
- Prevent duplicate note-creation requests from repeated Enter presses.
- Search every Markdown note in the vault, including root notes and folders outside the workbench mappings.
- Replace the manifest tagline with a functional description and add the public author and Ko-fi URLs.
- Pass 79 local automated checks. The user reported Windows testing and a macOS upgrade from 1.4.0 as working. Official directory scanning remains pending; see [candidate notes](docs/RELEASE-1.4.2.md) and [community review](docs/COMMUNITY-REVIEW.md).

修复安装确认前及插件关闭后的自动处理边界，补充重复创建保护，并扩大搜索范围。已收到 Windows 端 1.4.2 测试正常与 Mac 端升级使用正常的反馈；升级说明补充备份应放在 plugins 目录之外。社区上架尚未完成。

## 1.4.1 — Preview

Published on 2026-11-13. [Release notes and downloads](https://github.com/GavinYanCQ/obsidian-plainob-dashboard/releases/tag/1.4.1).

- Prepare a generic installer for Windows and macOS desktop, using the same runtime on both.
- Replace one-direction migration and named-sync-service setup hints with neutral wording.
- Remove unused personal branding from interface translations. Greeting defaults remain blank; author credit remains GavinCQ.
- Replace personal onboarding documents with bilingual public installation, upgrade, privacy and troubleshooting guides.
- Present repository homepages in English, Simplified Chinese, Traditional Chinese, Japanese and Korean, with language links, installer downloads, a changelog, a centered introduction, quick start, everyday-use examples and project support.
- Focus the project introduction on search, four knowledge directories and simple task management; record user-reported Windows/macOS acceptance.
- Document manual, BRAT and community update routes; validate a maintained version compatibility history during packaging.
- Build public archives from an explicit allowlist; exclude saved settings, migration profiles, vault content, private backups and historical native validation scripts.
- Add release-boundary checks and generic multilingual setup coverage. Preserve earlier task behavior and compatibility identifiers.

通用化安装与发布包，不改变已调试的任务流转规则。1.4.1 预览版已于 2026-11-13 公开发布；安装与升级请按说明手动进行。项目首页提供五种语言，以及安装包和更新记录入口；插件界面目前支持简体中文和英文。

## 1.4.0 — Earlier local preview

- Four-step setup, existing-folder mappings, bilingual UI and directory presets.
- Portable configuration profiles, optional Metadata Menu integration and AI rules.
- Notes, references and ideas; task/project management, archive recovery, search and bookshelves.

Earlier local previews are development history and are not public release assets.

# Release checklist / 发布清单

## Automated release preparation

- [x] Build the runtime and pass all 72 automated tests, including a rebuild from the extracted source archive.
- [x] Package with the explicit allowlist; inspect the manifest, versions file and SHA-256 checksums.
- [x] Verify installer/source archives contain no personal settings, migration profiles, note content, credentials or backups.
- [x] Prepare five linked project-page languages (English, Simplified Chinese, Traditional Chinese, Japanese and Korean), bilingual installation instructions, and the MIT license with author credit GavinCQ.
- [x] Integrate the maintainer-supplied Ko-fi link and unchanged WeChat payment image in all five project pages.

Local preparation verified: public Markdown links resolve; extracted sources rebuild to the identical runtime and can package independently. Archive member counts are recorded in the local verification report. GitHub Actions has also passed the build, all 72 checks and packaging on both Windows and macOS for the published 1.4.1 commit; see the [verified run](https://github.com/GavinYanCQ/obsidian-plainob-dashboard/actions/runs/43394461440). The five project-page languages do not add plugin interface languages: the interface still supports Simplified Chinese and English only. Translated pages have not yet received independent native-speaker review.

Real Windows demo captures are included for both PlainOB interface languages: home, body-text search/navigation, custom bookshelf covers and independent project steps. The search and task animations are keyframe sequences of actual UI operations, not continuous recordings. Task transitions in these animations use the card menu; automated drag input did not trigger the drop, so these captures are not evidence of drag behavior. Prior user acceptance remains the reported evidence for dragging. No personal vault content is included in the published captures.

## Native acceptance on Windows and macOS

Use a separate test vault on each OS. Automated filesystem/API simulations do not replace these checks.

**User-reported desktop acceptance:** the generic 1.4.1 installer was tested in initially empty Windows and macOS vaults and reported working on both. The Windows report explicitly included Chinese/English setup and Task Management; the macOS follow-up reported no problems with the requested acceptance round. This is user acceptance, not an independently observed UI test. Individual extended scenarios not specifically reported below remain unconfirmed.

**双端使用者验收反馈：**Windows 空白测试库的中英文安装和任务管理反馈正常；Mac 端随后也反馈本轮测试正常。双端基础安装与任务管理验收完成。未逐项反馈的扩展场景不据此标记完成。

- [x] Baseline installation and task-use acceptance reported on both Windows and macOS.

- [ ] Fresh install with no other plugins: no personal greeting, note, project or fixed disk path.
- [ ] English UI + English folders; Chinese UI + Chinese folders; mixed UI/folder scheme.
- [ ] Custom mappings into an existing vault keep old files unchanged during setup.
- [ ] Check the setup preview, create missing starter files, rerun without duplicating or overwriting.
- [ ] Capture idea, create/apply templates, choose category, use covers and search navigation.
- [ ] Task completion/reopening, independent project steps, whole-project archive/restore and same-column sorting.
- [ ] Optional Metadata Menu 0.8.12 integration and preserved conflicting fields.
- [ ] Import a profile on the other OS; verify relative mappings and documents before enabling optional sync.
- [ ] Upgrade an existing installation while preserving saved settings and notes.
- [ ] Light/dark appearance, keyboard access and actual note-position navigation.

Earlier user acceptance covered Windows/macOS task use and cross-device dragging on 1.4.0. These boxes describe clean-install acceptance for the generic 1.4.1 distribution and have not been marked complete on that basis.

## Publication status / 发布状态

- [x] Choose the public GitHub repository and review the exact source archive.
- [x] Run the Windows/macOS CI matrix in that repository and inspect results.
- [x] Confirm native acceptance results and remaining limitations; set a release tag matching manifest version.
- [x] Upload the three runtime files and installer archive to a GitHub preview release.
- [x] Verify all seven release-asset SHA-256 digests; download the public installer and checksum file without login and confirm they match.
- [x] Add installer download and changelog links to all five project-page languages.
- [ ] Complete the community-submission code and documentation review before requesting listing.
- [ ] Submit PlainOB to the Obsidian Community directory.

截至 2026-11-13，[GitHub 仓库](https://github.com/GavinYanCQ/obsidian-plainob-dashboard)与 [1.4.1 预览版 Release](https://github.com/GavinYanCQ/obsidian-plainob-dashboard/releases/tag/1.4.1)已公开，七个附件校验通过，并已验证未登录用户可下载安装包。五种语言首页均提供安装包与更新记录入口。Obsidian 社区上架前检查和提交仍待后续进行。

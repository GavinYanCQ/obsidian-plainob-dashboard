# Release checklist / 发布清单

## 1.4.2 evidence / 验证记录

- [x] Review the code and public materials; [findings and remaining boundaries](COMMUNITY-REVIEW.md).
- [x] Fix automatic processing before setup confirmation, lifecycle cleanup, repeated creation and global search scope.
- [x] Pass 79 local automated checks; verify archive integrity, checksums, relative links, identical source rebuild and independent repackaging.
- [x] User-reported Windows 1.4.2 testing: search, task movement, completion/reopening and project archiving work.
- [x] User-reported macOS upgrade/use from 1.4.0 works. The old displayed version was resolved by moving the duplicate backup plugin folder outside `plugins`.
- [x] Explain in both upgrade guides that whole-plugin backups belong outside `plugins`; preserve `data.json`, notes, templates and setup backups when updating.
- [x] Keep plugin ID `plainob`, MIT author credit GavinCQ, and compatibility history including 1.4.1.
- [x] Keep the existing 1.4.1 release assets unchanged.

The reports above came from the user on 2026-11-13. They are not independently observed native tests. The user did not specify the previous Windows version. Fresh-install edge cases for 1.4.2 have automated coverage but have not all received individual native acceptance.

For the exact release commit, inspect [Windows/macOS Actions](https://github.com/GavinYanCQ/obsidian-plainob-dashboard/actions) and [1.4.2 release assets](https://github.com/GavinYanCQ/obsidian-plainob-dashboard/releases/tag/1.4.2). Build, test and package results must pass before publication. The release must use tag `1.4.2`, matching the manifest, with individual `main.js`, `manifest.json` and `styles.css` assets. The installer/source ZIPs and checksums are additional assets.

## Remaining native scenarios / 扩展验收

- [ ] Fresh install with no other plugins; restart before confirming setup and verify no automatic note changes.
- [ ] Independently observe Chinese/English UI with English/Chinese/custom folders on both systems.
- [ ] Verify real editor navigation into root-level and outside-mapping search hits.
- [ ] Exercise optional Metadata Menu 0.8.12 integration separately, including preserved conflicting fields.
- [ ] Independently observe upgrade, archive conflicts, interrupted setup and profile import on both systems.

## Community listing / 社区上架

- [ ] Run the official directory scan against the exact release commit and assets; address errors and inspect warnings.
- [ ] Confirm how the official build verifier handles the documented Python build; local reproducibility is verified, official scanner compatibility is not yet verified.
- [ ] Complete the community listing submission and address feedback. No approval or listing is claimed here.

## Historical baseline / 历史记录

The public 1.4.1 preview had 72 checks and [Windows/macOS CI](https://github.com/GavinYanCQ/obsidian-plainob-dashboard/actions/runs/43394461440). The user reported initial installation and task use in empty Windows/macOS test vaults, with Chinese/English setup explicitly covered on Windows. Seven release-asset hashes and anonymous installer download were verified. This evidence applies to 1.4.1, not unreported scenarios for 1.4.2.

Screenshots/GIFs show actual Windows demo-vault operations. Animations are keyframe sequences, not continuous recordings; task captures use card menus and do not independently prove drag behavior. No personal vault content is included. The five README languages do not add plugin UI languages: the interface remains Simplified Chinese/English. Translations have not received independent native-speaker review.

1.4.2 已收到双端使用正常的反馈，79 项本地自动检查通过。整份插件备份应放在 plugins 目录之外。GitHub 发布结果以 Releases 和 Actions 为准；官方扫描、扩展验收与社区上架仍单独记录，不视为已获批准。

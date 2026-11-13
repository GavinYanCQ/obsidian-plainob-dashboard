# Installation, upgrades and a second device

Windows and macOS desktop, Obsidian 1.15.0 or later. This preview uses manual installation.

## Install

1. Back up any existing vault content.
2. Extract the plugin download. Place `plainob` in your vault's `.obsidian/plugins/` directory, or the `plugins/` directory under your custom Obsidian configuration folder.
3. The folder must directly contain `main.js`, `manifest.json` and `styles.css`.
4. Enable PlainOB in Settings → Community plugins. Setup opens on first activation; it is also available from settings or the Open setup wizard command.

On macOS, use `Command + Shift + .` in Finder to reveal hidden folders. All paths are relative to your own vault; no drive letter or home directory is needed.

## The four steps

1. Choose a new system, an existing vault or an existing workbench; choose the interface language and an optional greeting name, blank by default.
2. Choose numbered English folders, numbered Chinese folders, or custom mappings. In an existing vault, map Inbox, Projects and the other roles to your current folders. New installations use stable `backlog / active / done` status values; existing installations retain their rules.
3. Optionally create missing templates, adapt Metadata Menu selectors or add AI rules. Existing documents are kept. Install optional plugins yourself. Metadata Menu configuration is currently supported only for 0.8.12; disable it temporarily before writing changed settings, then enable it again. AI accounts are configured separately.
4. Review Create / Keep / Append / Configure / Blocked entries and apply. Resolve blocked paths before trying again.

English roots are `00_Inbox`, `01_Projects`, `02_Areas`, `03_Resources`, `04_Archive`, `05_Templates`, `06_System`, `99_Attachments`. Chinese roots are `00_收件箱`, `01_项目`, `02_领域`, `03_资源`, `04_归档`, `05_模板`, `06_系统`, `99_附件`. Optional starter categories are generic areas and resource topics. No personal projects, example tasks or personal notes are shipped. Functional subfolders such as `Ideas`, `Configuration` and `Indexes` retain stable names.

Interface language and folder names are independent. Changing the language does not rename folders. Automatic migration after manually renaming installed folders is not supported, nor is bulk relocation or property conversion of old notes.

## Another Windows or macOS device

1. Copy or sync your notes, templates, lists, rules and attachments with a method of your choice. Wait for the initial transfer before creating competing starter files on each device.
2. Install the same PlainOB version on the other device. Install optional plugins and configure AI accounts separately if needed.
3. Export a migration profile from the original device, import it in setup on the other device and review the existing-workbench plan. Profile paths are vault-relative and portable across both operating systems.
4. Existing starter documents on the second device are kept. Profiles do not copy documents or overwrite them; use your sync tool to resolve differences.
5. Test one task in each direction: status changes, completion/reopening and same-column ordering. Wait for each operation to sync before editing on the other device. Resolve concurrent edits in the sync tool.

No specific sync service is required. PlainOB does not connect to sync servers, choose sync directions or resolve remote conflicts.

## Upgrade

Save edits and disable PlainOB. Replace only `main.js`, `manifest.json` and `styles.css`, then enable it again. Keep your own `data.json` and `setup-backups`. Never replace them with another user's settings. Existing settings remain in use; do not rerun new-system setup to upgrade. Back up before downgrading: older versions may reject newer settings formats.

Store full plugin-folder backups outside the `plugins` directory, for example in a separate backup location outside the vault. A copy such as `plainob_backup` containing `manifest.json` inside `plugins` can be recognized as another plugin. Keep the three runtime files directly in the active `plainob` folder. On Mac, use `Command + Q` to fully quit before reopening and checking the version.

Manual replacement is the current method. Users can optionally add `GavinYanCQ/obsidian-plainob-dashboard` to [BRAT](https://tfthacker.com/BRAT) and check for updates; BRAT downloads the update and reloads the plugin. After community directory listing, use Obsidian Settings → Community plugins → Check for updates. Community plugins do not update automatically through Obsidian.

Update and verify the plugin version separately in each Windows/macOS vault. Note synchronization does not imply plugin code was upgraded. Existing templates, category lists and AI rules are user files and are kept; a code update does not overwrite them with new defaults. Any new release requiring changes to these files must explain them separately.

See [Obsidian's update instructions](https://help.obsidian.md/community-plugins) and the [maintainer release process](../CONTRIBUTING.md#publishing-an-update--发布更新).

## Interrupted setup and uninstalling

Run journals and backups of changed configuration are saved under `plugins/plainob/setup-backups/<run-id>/` in the configuration directory. Reopen setup to check and resume an interrupted run. Concurrent edits stop the process. Created files are not automatically deleted. To restore configuration, disable the affected plugin first and follow the journal's backup mappings.

Uninstalling PlainOB leaves notes, created folders and Markdown task properties in place.

## Troubleshooting

- Metadata Menu's optional Dataview notice can be hidden using Global settings → Disable dataview notice. PlainOB and plain-list selectors do not require Dataview.
- For missing dropdowns, check Metadata Menu 0.8.12 is enabled and FileClass settings are not overriding the field. Native property editing also works.
- For changes missing on another device, inspect the same note's Markdown properties first. Profiles do not transfer notes; check the sync tool's conflicts and indexing next.
- File/folder type collisions, case aliases and Unicode-equivalent paths stop setup. Choose the correct mapping; setup will not delete or overwrite content to fix these conflicts.

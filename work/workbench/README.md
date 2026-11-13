# PlainOB — Development source

A desktop Obsidian workbench for Windows and macOS. The public bilingual README, installation guide, privacy statement, MIT license and release checklist are maintained in [public-release](../public-release/README.md). The manifest is the source of the current version and minimum Obsidian version.

## Installation

Place the plainob folder containing main.js, manifest.json and styles.css in your vault configuration folder's plugins directory. Enable it in Obsidian, then run Open setup wizard or use its settings page. First-time activation in a new vault opens the wizard without applying changes.

The wizard offers Create a new system, Connect an existing vault, and Connect an existing workbench. Preview changes before applying. Existing notes are not moved or rewritten in bulk; existing templates and lists are kept. Interrupted runs can be resumed after checking for edits. Backups stay in the plugin's local setup-backups folder.

Export migration profile copies directory, language, greeting and task rules without credentials or note contents. Import it on the other device. Metadata Menu is optional; automatic preset configuration is verified only with 0.8.12 and requires that plugin to be disabled when changes are needed. Claudian rules are optional; AI tools and accounts are configured separately. No sync service is required or configured by this plugin.

The workbench itself does not send notes to a remote service. Optional video embeds in AI-organized notes contact the relevant video platform. Third-party AI and sync tools follow their own settings and policies.

## Build and test

Python 3 and a current Node.js LTS are required for development. No package installation is needed.

```
python work/build_workbench.py
node --test work/workbench/*.test.js
```

Automated checks cover the task workflow, sorting, search, language, setup planning, adapter-boundary integration, conflicts, backups, interrupted runs, portable profiles and public release boundaries. The self-contained runtime is generated at work/workbench/dist/main.js. Development-only simulations are not native app verification.

Build public installer and source archives using `python work/package_public.py`. The packager uses an explicit file allowlist, without reading an installed vault. MIT licensed. Repository publication and community submission are separate actions; follow the public release checklist before publishing.

## Idea capture

Quick Capture includes Capture idea and the command palette includes Capture idea / Apply idea capture template. Ideas go to the configured Inbox/Ideas folder, with type note, task false and no category. Template hints are HTML comments. Setup and portable profiles include the idea template path.

## Folder schemes

New setup offers numbered English folders, numbered Chinese folders, and existing/custom mappings. Interface language is independent of the chosen paths. Connecting an existing vault preserves its mapping; no automatic directory renaming is performed. The Chinese preset also supplies Chinese default category names. Functional child folders such as Ideas and Configuration keep stable names.

## Brand and compatibility

PlainOB — Simple Notes & Tasks. The plugin ID is plainob. Legacy migration profiles and saved workspace views are accepted for compatibility. Greeting names remain personal vault settings and are not shipped in public packages.

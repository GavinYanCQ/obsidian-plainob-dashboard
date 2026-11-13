# Privacy and dependencies / 隐私与依赖

## Included / 随包提供

The public installer contains three runtime files, documentation and the MIT license. It contains no saved `data.json`, migration profile, personal vault, local backup, AI credential or sync connection. The source archive includes only explicitly selected runtime sources, automated tests, build scripts and public documentation.

公开安装包包含三个运行文件、说明和 MIT 许可证，不含个人配置、迁移配置、笔记库、本地备份、AI 密钥或同步连接。源码包使用明确的文件清单，不把开发工作目录整体打包。

Author credit is GavinCQ. Compatibility identifiers from earlier versions remain in code only where needed to read old views/profiles or avoid duplicate automation. They do not supply a greeting or a personal vault path.

作者署名为 GavinCQ。代码中的旧版本兼容标识仅用于读取旧标签页、旧配置或避免重复自动化，不会设置个人称呼或个人笔记库路径。

## Local data / 本地数据

PlainOB reads Markdown and frontmatter through Obsidian, stores settings locally, and changes task properties, note locations and ordering as users operate the workbench. Setup creates selected folders/templates after preview. Reviewed existing configuration changes have local backups under the plugin directory. These backups and exported profiles may contain user-chosen names and paths; they are personal files, not public release assets.

工作台通过 Obsidian 读取 Markdown 和属性，在本地保存设置，并随用户操作修改任务属性、位置及排序。向导在预览确认后创建所选目录和模板，修改已有配置前保存本地备份。用户自行导出的配置和备份可能含自选名称与路径，不应当作公开发布文件。

## Network and optional tools / 网络与可选工具

PlainOB contains no network client, remote telemetry, analytics or bundled AI/sync service. External plugins are not installed or enabled automatically. Enabling the optional Metadata Menu adapter changes only the reviewed presets in that plugin's local configuration; its current supported version is 0.8.12.

PlainOB 不包含联网客户端、远程统计、AI 或同步服务，不自动安装或开启其他插件。可选 Metadata Menu 适配器只合并预览过的本地字段配置，当前支持版本为 0.8.12。

AI rule files are instructions for a separately configured AI tool. That tool's requests, permissions and handling of note content depend on the user's provider. Official video iframes in generated notes connect to the relevant platform when viewed. Clicking external links opens the selected site. Sync plugins have their own storage and conflict policies.

AI 规则是交给独立 AI 工具的说明，其请求、权限和内容处理取决于用户选择的服务商。生成笔记中的官方视频播放器在查看时连接视频平台；点击外链会打开相应网站。同步插件另有存储与冲突处理政策。

## Sponsorship artwork / 赞助图示

The Ko-fi badge is provided by the [official Ko-fi creator kit](https://more.ko-fi.com/brand-assets). Ko-fi's branding belongs to its owner and is not original PlainOB artwork under the project MIT license. The badge is stored locally; viewing the README image does not require a Ko-fi request. The sponsorship section links to the maintainer's supplied Ko-fi page and displays the WeChat payment image supplied for public use. Clicking the badge opens Ko-fi; viewing the image alone does not initiate a payment. The payment image is included unchanged in the public documentation and release archives.

Ko-fi 徽标采用官方创作者素材，品牌标识归原权利人所有，不属于 PlainOB 的原创 MIT 授权图稿。图片本地存放。赞助区使用作者提供的 Ko-fi 链接和收款码；点击徽标会打开 Ko-fi，仅查看图片不会发起付款。收款码原图按作者要求加入公开文档与发布包，未作修改。

# OneTake 视频工作台 0.5.0

这是开源源码启动包，适用于 macOS、Windows 和 Linux；不是免环境安装器。已包含锁定版本的 ZIP 运行依赖及其 MIT 许可，不包含用户工程、视频、账号或 Key。

## 启动

1. 安装 Node.js 22 或更新版本（https://nodejs.org/）以及 FFmpeg、ffprobe（https://ffmpeg.org/download.html），确保三个命令可在终端运行。
2. 解压到固定目录。Mac 运行 `start.command`；Windows 运行 `start.cmd`；Linux 在目录中运行 `node launcher.cjs`。若 Mac 阻止双击，在终端切换到解压目录后运行 `bash start.command`，无需关闭系统安全保护。
3. 浏览器打开 http://127.0.0.1:3010 。启动器会检查依赖，不自动下载或安装软件。
4. “我的模型”填写你自己的 API Key 并保存；没有 Key 也可使用手工模板。选模型、主题、语言，生成并编辑每段口播词、章节、提纲、双语字幕与重点词；可上传或生成图片。
5. 保存工程，选择本地测试网址或 https://onetake.show ，点击导入。也可下载 `project.onetake.json` 手动导入网页或手机口播模式。白板工程供网页版使用。
6. 网页录制完成后，PRO 可配对工作台进行去空白、封面合成、导出。按页面提示确认剪点和封面，原片保留。独立命令行媒体处理不要求网页会员。

## 数据、更新与故障

- 工程默认在用户 Documents 下的“ OneTake视频工作台 ”目录（目录名无首尾空格）；私有设置和 Key 在用户目录 `.onetake-pro`。这些不在程序目录里。更新前保存正在编辑的稿件，停止旧工作台，再启动新目录；不要删除私有设置或工程目录。
- 模型请求发送至自己选择的服务商并可能产生费用。工程结构会校验，事实、版权及翻译仍需人工复核。字幕是按稿件计划分配的分句字幕，不是语音识别结果。
- 只监听本机；线上网页首次连接时，浏览器可能要求允许本地网络访问。配对码不要分享。PRO 联动仍须有效会员，下载软件不等于开通会员。
- 端口占用时先关闭旧版本；缺少依赖时按报错安装对应工具。不要把日志、配置或带有私人资料的工程公开到 GitHub。
- 中文完整指南见 USER_GUIDE.zh-CN.md。下载校验文件与 ZIP 在同一下载入口提供。

OneTake 一录 · 浩哥 AI 实验室 — https://onetake.show
Prepare locally, record with OneTake, finish on your own computer.

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { mediaInfo, silenceCuts, renderVideo, saveExport } = require("./src/quick-edit.cjs");

async function localFile(value) {
  if (!value) throw new Error("缺少文件路径");
  const file = path.resolve(value);
  if (!(await fs.lstat(file)).isFile()) throw new Error("仅支持普通本地文件，不接受链接");
  return file;
}
async function main() {
  const [command, input, cover, optionsFile] = process.argv.slice(2);
  if (!command || command === "--help") { console.log("node cli.cjs analyze <video>\nnode cli.cjs render <video> <cover.png> <options.json>\noptions: {cuts:[{start,end,enabled}],outputName}; export to Downloads without replacing originals"); return; }
  if (!["analyze", "render"].includes(command)) throw new Error("未知命令");
  const video = await localFile(input), metadata = await mediaInfo(video);
  if (command === "analyze") { console.log(JSON.stringify({ ...metadata, cuts: metadata.hasAudio ? await silenceCuts(video, metadata.duration, -35, 2) : [] }, null, 2)); return; }
  const image = await localFile(cover), png = await fs.readFile(image);
  if (png.length > 8 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("封面须为不超过 8 MB 的 PNG");
  const options = JSON.parse(await fs.readFile(await localFile(optionsFile), "utf8"));
  if (!Array.isArray(options.cuts) || options.cuts.length > 100 || options.cuts.some(c => !c || !Number.isFinite(c.start) || !Number.isFinite(c.end))) throw new Error("剪辑参数无效");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "onetake-cli-export-"));
  try {
    const output = path.join(temp, "output.mp4");
    await renderVideo({ input: video, cover: image, output, metadata, cuts: options.cuts.map(c => ({ ...c, enabled: c.enabled === true })) });
    console.log(JSON.stringify(await saveExport(output, options.outputName || `${path.basename(video, path.extname(video))}_OneTake.show.mp4`), null, 2));
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch(() => { console.error("本地处理失败，请检查普通文件、参数及 FFmpeg；原片不会被覆盖"); process.exitCode = 1; });

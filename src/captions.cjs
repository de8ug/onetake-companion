// Same authored-caption contract as OneTake web/iPhone. No ASR is implied.
function validateCaptions(value) {
  if (value === undefined) return undefined;
  if (!value || !['off', 'key', 'full'].includes(value.mode) || !Array.isArray(value.lines) || value.lines.length > 30) throw new Error('分句字幕格式无效');
  return { mode: value.mode, lines: value.lines.map(line => {
    if (!line || typeof line.text !== 'string' || !line.text.trim() || line.text.length > 72) throw new Error('每条字幕原文需为 1–72 字');
    const result = { text: line.text };
    for (const [key, max] of [['translation', 160], ['emphasis', 24], ['translationEmphasis', 48]]) {
      if (line[key] !== undefined) { if (typeof line[key] !== 'string' || line[key].length > max) throw new Error('字幕翻译或重点词过长'); result[key] = line[key]; }
    }
    if (result.emphasis && !result.text.includes(result.emphasis) || result.translationEmphasis && !result.translation?.includes(result.translationEmphasis)) throw new Error('字幕重点词必须出现在对应文字中');
    if (line.dwell !== undefined) { if (!Number.isFinite(line.dwell) || line.dwell < .5 || line.dwell > 2) throw new Error('字幕停留权重需为 0.5–2'); result.dwell = line.dwell; }
    return result;
  }) };
}
module.exports = { validateCaptions };

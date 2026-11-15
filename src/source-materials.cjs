const crypto = require("node:crypto");

function validateMaterials(value) {
  if (!value || typeof value !== "object" || typeof value.text !== "string" || value.text.length > 20000 || !Array.isArray(value.images) || value.images.length > 24) throw new Error("参考资料无效或过长");
  let size = 0;
  const ids = new Set();
  const images = value.images.map(image => {
    if (!image || typeof image.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(image.id) || ids.has(image.id) || typeof image.name !== "string" || image.name.length > 200 || typeof image.dataUrl !== "string") throw new Error("资料图片编号无效");
    ids.add(image.id);
    size += image.dataUrl.length;
    if (size > 2500000) throw new Error("资料图片过大，请减少选择");
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl);
    if (!match) throw new Error("资料图片只支持 PNG/JPEG");
    const bytes = Buffer.from(match[2], "base64");
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (bytes.length < 100 || (match[1] === "png" ? !png : !jpg)) throw new Error("资料图片格式不匹配");
    return { id: image.id, name: image.name, dataUrl: image.dataUrl };
  });
  return { text: value.text, images };
}

function createSourceInbox(now = Date.now) {
  const entries = new Map();
  return {
    put(input, origin) {
      if (typeof input.topic !== "string" || !input.topic.trim() || input.topic.length > 500) throw new Error("请填写创作目标");
      const materials = validateMaterials(input.materials);
      if (!materials.text.trim()) throw new Error("参考文字为空");
      for (const [key, entry] of entries) if (entry.expires <= now()) entries.delete(key);
      if (entries.size >= 8) throw new Error("待接收资料过多，请先在工作台接收或稍后重试");
      const ticket = crypto.randomBytes(24).toString("hex");
      entries.set(ticket, { topic: input.topic.trim(), materials, origin, expires: now() + 600000 });
      return ticket;
    },
    consume(ticket) {
      const entry = entries.get(ticket);
      if (!entry || entry.expires <= now()) { entries.delete(ticket); throw new Error("资料凭证已过期，请从 OneTake 重新发送"); }
      entries.delete(ticket);
      return { topic: entry.topic, materials: entry.materials, origin: entry.origin };
    },
  };
}
module.exports = { validateMaterials, createSourceInbox };

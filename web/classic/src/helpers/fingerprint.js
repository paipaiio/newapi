// 轻量浏览器指纹(无三方依赖)。用于邀请注册滥用检测——同一台设备反复注册小号时,
// 指纹大概率相同。仅作为「疑似」信号之一,不用于强身份识别,故简单稳定即可。
//
// 采集若干相对稳定的浏览器/设备属性 + 一段 canvas 渲染指纹,拼接后做 SHA-256,
// 输出 64 位十六进制字符串。任何异常都回退为空串(后端把空指纹当作无该信号)。

async function sha256Hex(str) {
  try {
    const buf = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    return '';
  }
}

function canvasSignature() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('fp-指纹-✨', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('fp-指纹-✨', 4, 17);
    return canvas.toDataURL();
  } catch (e) {
    return '';
  }
}

export async function getBrowserFingerprint() {
  try {
    const n = navigator || {};
    const s = window.screen || {};
    const parts = [
      n.userAgent || '',
      n.language || '',
      (n.languages || []).join(','),
      String(n.hardwareConcurrency || ''),
      String(n.deviceMemory || ''),
      String(n.maxTouchPoints || ''),
      n.platform || '',
      String(s.width || '') + 'x' + String(s.height || ''),
      String(s.colorDepth || ''),
      String(new Date().getTimezoneOffset()),
      (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
      canvasSignature(),
    ];
    return await sha256Hex(parts.join('||'));
  } catch (e) {
    return '';
  }
}

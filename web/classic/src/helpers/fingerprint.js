// 轻量浏览器指纹(无三方依赖)。用于邀请注册滥用检测——同一台设备反复注册小号时,
// 指纹大概率相同。仅作为「疑似」信号之一,不用于强身份识别,故简单稳定即可。
//
// 采集若干相对稳定的浏览器/设备属性 + canvas/WebGL/AudioContext 渲染指纹,
// 拼接后做 SHA-256,输出 64 位十六进制字符串。任何异常都回退为空串
// (后端把空指纹当作无该信号)。指纹是概率信号而非身份证明:对普通换邮箱重注册
// 有效,对专业指纹浏览器/改指纹工具无效,故仅作为多信号交叉判定中的一路。

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

// WebGL 指纹:显卡厂商/型号(UNMASKED_*)+ 若干上下文参数。区分度较高且相对稳定。
function webglSignature() {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const parts = [];
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      parts.push(String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || ''));
      parts.push(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ''));
    }
    parts.push(String(gl.getParameter(gl.VENDOR) || ''));
    parts.push(String(gl.getParameter(gl.RENDERER) || ''));
    parts.push(String(gl.getParameter(gl.VERSION) || ''));
    parts.push(String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || ''));
    parts.push(String(gl.getParameter(gl.MAX_TEXTURE_SIZE) || ''));
    parts.push(String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || ''));
    const sp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (sp) parts.push(`${sp.precision},${sp.rangeMin},${sp.rangeMax}`);
    return parts.join(',');
  } catch (e) {
    return '';
  }
}

// AudioContext 指纹:离线渲染一段振荡器信号,取结果的汇总值。音频栈的细微差异
// 使不同设备产生稳定但不同的输出。用 OfflineAudioContext 不发声、不影响用户。
function audioSignature() {
  return new Promise((resolve) => {
    try {
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AC) return resolve('');
      const ctx = new AC(1, 44100, 44100);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      // 固定参数,保证同一设备可复现
      try {
        comp.threshold.value = -50;
        comp.knee.value = 40;
        comp.ratio.value = 12;
        comp.attack.value = 0;
        comp.release.value = 0.25;
      } catch (e) {}
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      ctx.oncomplete = (evt) => {
        try {
          const data = evt.renderedBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 4500; i < 5000; i++) {
            sum += Math.abs(data[i]);
          }
          done(sum.toString());
        } catch (e) {
          done('');
        }
      };
      ctx.startRendering();
      // 兜底:2s 内未完成则放弃该信号,不阻塞注册
      setTimeout(() => done(''), 2000);
    } catch (e) {
      resolve('');
    }
  });
}

export async function getBrowserFingerprint() {
  try {
    const n = navigator || {};
    const s = window.screen || {};
    let audio = '';
    try {
      audio = await audioSignature();
    } catch (e) {
      audio = '';
    }
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
      webglSignature(),
      audio,
    ];
    return await sha256Hex(parts.join('||'));
  } catch (e) {
    return '';
  }
}

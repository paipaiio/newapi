/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/**
 * Lightweight browser fingerprint (no third-party deps). Used for invite-abuse
 * detection: when the same device repeatedly registers throwaway accounts, the
 * fingerprint is likely identical. It is only one "suspicion" signal, not a
 * strong identity — simple and stable is enough.
 *
 * Collects relatively stable browser/device attributes plus canvas / WebGL /
 * AudioContext rendering signatures, joins them, and SHA-256 hashes the result
 * into a 64-char hex string. Any error falls back to an empty string (the
 * backend treats an empty fingerprint as "no signal").
 */

async function sha256Hex(str: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

function canvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("fp-指纹-✨", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("fp-指纹-✨", 4, 17);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

// WebGL fingerprint: GPU vendor/model (UNMASKED_*) plus some context params.
// Fairly distinctive and relatively stable.
function webglSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const parts: string[] = [];
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      parts.push(String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || ""));
      parts.push(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ""));
    }
    parts.push(String(gl.getParameter(gl.VENDOR) || ""));
    parts.push(String(gl.getParameter(gl.RENDERER) || ""));
    parts.push(String(gl.getParameter(gl.VERSION) || ""));
    parts.push(String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || ""));
    parts.push(String(gl.getParameter(gl.MAX_TEXTURE_SIZE) || ""));
    parts.push(String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || ""));
    const sp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (sp) parts.push(`${sp.precision},${sp.rangeMin},${sp.rangeMax}`);
    return parts.join(",");
  } catch {
    return "";
  }
}

// AudioContext fingerprint: offline-render an oscillator signal and summarize
// the result. Subtle audio-stack differences yield stable but distinct output.
// OfflineAudioContext is silent and does not affect the user.
function audioSignature(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const AC =
        window.OfflineAudioContext ||
        (
          window as unknown as {
            webkitOfflineAudioContext?: typeof OfflineAudioContext;
          }
        ).webkitOfflineAudioContext;
      if (!AC) {
        resolve("");
        return;
      }
      const ctx = new AC(1, 44100, 44100);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      try {
        comp.threshold.value = -50;
        comp.knee.value = 40;
        comp.ratio.value = 12;
        comp.attack.value = 0;
        comp.release.value = 0.25;
      } catch {
        /* some params may be read-only in older engines */
      }
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      let settled = false;
      const done = (v: string) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      ctx.oncomplete = (evt) => {
        try {
          const data = evt.renderedBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
          done(sum.toString());
        } catch {
          done("");
        }
      };
      ctx.startRendering();
      // Fallback: give up after 2s so registration is never blocked.
      setTimeout(() => done(""), 2000);
    } catch {
      resolve("");
    }
  });
}

/** Compute the browser fingerprint hash; returns '' on any failure. */
export async function getBrowserFingerprint(): Promise<string> {
  try {
    const n = navigator;
    const s = window.screen;
    let audio = "";
    try {
      audio = await audioSignature();
    } catch {
      audio = "";
    }
    const parts = [
      n.userAgent || "",
      n.language || "",
      (n.languages || []).join(","),
      String(n.hardwareConcurrency || ""),
      String((n as unknown as { deviceMemory?: number }).deviceMemory || ""),
      String(n.maxTouchPoints || ""),
      (n as unknown as { platform?: string }).platform || "",
      `${s.width || ""}x${s.height || ""}`,
      String(s.colorDepth || ""),
      String(new Date().getTimezoneOffset()),
      Intl?.DateTimeFormat?.().resolvedOptions().timeZone || "",
      canvasSignature(),
      webglSignature(),
      audio,
    ];
    return await sha256Hex(parts.join("||"));
  } catch {
    return "";
  }
}

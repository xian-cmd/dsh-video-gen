/**
 * dsh-video-gen —— 视频生成插件（多平台）
 *
 * 支持：通义万相 Wan（DashScope）、火山方舟（即梦/Seedance）
 * 钥匙存在 DSH 凭证服务里，名字与图片插件一致（DASHSCOPE_API_KEY / ARK_API_KEY），
 * 这样用户已经填过的 Key 可以直接复用。
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'video'

// defineTool 由宿主提供（peer 依赖，插件目录里不一定解析得到）。拿不到就用原样对象。
let defineTool = (spec) => spec
try {
  const tools = await import('@deepseek-ai/dsh-tools')
  if (tools && typeof tools.defineTool === 'function') defineTool = tools.defineTool
} catch { /* 宿主没暴露就按原样对象注册 */ }

// 声明真正会用到的服务：tools（工具）+ credentials（存/读 Key）+ webServer（设置页接口）
export const inject = ['tools', 'credentials', 'webServer']

// 平台定义：每个平台的创建任务 / 查询任务 / 鉴权方式
//
// 凭证设计（2026-10-30 按用户要求合并）：
//   · 走百炼 DashScope 的四家（万相/可灵/爱诗/Vidu）**共用一把 Key**
//     → VIDEO_DASHSCOPE_API_KEY。它们本来就是同一个服务，只需在百炼控制台
//       分别开通对应模型，没必要填四次。
//   · 火山方舟是独立平台，单独一把 → VIDEO_ARK_API_KEY。
//   · 都不复用 dsh-image-gen 的 DASHSCOPE_API_KEY / ARK_API_KEY ——
//     两个插件的 Key 必须分开，互不影响。
const DASHSCOPE_KEY_ENV = 'VIDEO_DASHSCOPE_API_KEY'

const PROVIDERS = {
  wan: {
    label: '通义万相 Wan（阿里云 DashScope）',
    keyEnv: DASHSCOPE_KEY_ENV,
    // 接口地址：视频任务用 /api/v1，模型列表用主机根路径（listModels 里会处理）
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'wan3.0-video',
    // ⚠️ /models 接口**不会列出视频模型**（实测只返回 wan2.7-image*），
    //    所以这里按官方文档写死视频模型清单（2026-10-30 查自
    //    help.aliyun.com/zh/model-studio/wan-api-reference 及其子页）。
    //    第 3 列是给用户看的说明。
    models: [
      { id: 'wan3.0-video', label: '万相3.0 标准版（最长30秒，文生/图生/参考生）' },
      { id: 'wan3.0-video-prime', label: '万相3.0 高速版（能力对齐标准版）' },
      { id: 'wan2.7-t2v', label: '万相2.7 文生视频' },
      { id: 'wan2.6-t2v', label: '万相2.6 文生视频' },
      { id: 'wan2.6-i2v', label: '万相2.6 图生视频（首帧）' },
      { id: 'wan2.5-t2v', label: '万相2.5 文生视频' },
      { id: 'wan2.5-i2v', label: '万相2.5 图生视频' },
      { id: 'wanx2.1-t2v-turbo', label: '万相2.1 文生视频 高速版' },
      { id: 'wanx2.1-t2v-plus', label: '万相2.1 文生视频 专业版' },
      { id: 'wanx2.1-i2v-turbo', label: '万相2.1 图生视频 高速版' },
      { id: 'wanx2.1-i2v-plus', label: '万相2.1 图生视频 专业版' },
    ],
    // 兜底列表（给 listModels 用不到时）
    fallbackModels: ['wan3.0-video', 'wan2.7-t2v', 'wan2.6-t2v', 'wan2.5-t2v'],
  },
  ark: {
    label: '火山方舟（即梦 / Seedance）',
    keyEnv: 'VIDEO_ARK_API_KEY',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seedance-2-5-260628',
    // 2026-10-30 从火山官方文档（docs.volcengine.com/docs/82379/1520757?format=json）提取的完整清单。
    // 文档是 SPA，普通抓取只有导航；加 ?format=json 才能拿到正文。
    models: [
      { id: 'doubao-seedance-2-5-260628', label: 'Seedance 2.5（最新）' },
      { id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
      { id: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro' },
      { id: 'doubao-seedance-1-0-lite-t2v-250428', label: 'Seedance 1.0 Lite 文生视频' },
      { id: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite 图生视频' },
    ],
    fallbackModels: ['doubao-seedance-2-5-260628', 'doubao-seedance-2-0-260128', 'doubao-seedance-1-0-pro-250528'],
  },
  kling: {
    label: '可灵 Kling（走百炼 DashScope）',
    keyEnv: DASHSCOPE_KEY_ENV,
    // 百炼里的可灵走同一个 video-synthesis 接口，只是模型名不同
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'kling/kling-v3-video-generation',
    models: [
      { id: 'kling/kling-v3-video-generation', label: '可灵 v3（文生/图生/首尾帧，可 4K）' },
      { id: 'kling/kling-v3-turbo-video-generation', label: '可灵 v3 Turbo（快速，固定带音）' },
      { id: 'kling/kling-v3-omni-video-generation', label: '可灵 v3 Omni（含参考生/视频编辑）' },
    ],
    note: '需在百炼控制台开通「可灵AI」；文生视频必填 aspect_ratio，时长 3-15 秒',
  },
  pixverse: {
    label: '爱诗 PixVerse（走百炼 DashScope）',
    keyEnv: DASHSCOPE_KEY_ENV,
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'pixverse/pixverse-v6-t2v',
    models: [
      { id: 'pixverse/pixverse-v6-t2v', label: 'PixVerse v6 文生视频' },
      { id: 'pixverse/pixverse-c1-t2v', label: 'PixVerse C1 文生视频' },
      { id: 'pixverse/pixverse-v5.6-t2v', label: 'PixVerse v5.6 文生视频' },
    ],
    note: '需在百炼控制台开通 PixVerse',
  },
  vidu: {
    label: 'Vidu（走百炼 DashScope）',
    keyEnv: DASHSCOPE_KEY_ENV,
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'vidu/viduq3-pro_text2video',
    models: [
      { id: 'vidu/viduq3-pro_text2video', label: 'Vidu Q3 Pro 文生视频' },
      { id: 'vidu/viduq3-turbo_text2video', label: 'Vidu Q3 Turbo 文生视频' },
      { id: 'vidu/viduq2_text2video', label: 'Vidu Q2 文生视频' },
    ],
    note: '需在百炼控制台开通 Vidu',
  },
}

// 走百炼的四个平台共用一把 Key：设置页里只显示一次 Key 输入
const DASHSCOPE_GROUP = ['wan', 'kling', 'pixverse', 'vidu']

/* ───────────── 通用 HTTP ───────────── */

async function fetchJson(url, opts = {}, timeoutMs = 60000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON */ }
    return { ok: r.ok, status: r.status, json, text }
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String((e && e.message) || e) }
  } finally {
    clearTimeout(timer)
  }
}

/* ───────────── 百炼 DashScope 系（万相 / 可灵 / 爱诗 / Vidu）───────────── */
//
// 这四家走同一个接口，但 parameters 的字段名不一样：
//   · wan            → { duration, ratio, resolution }   分辨率枚举 480P/720P/1080P
//   · kling / pixverse → { duration, aspect_ratio, ... }  分辨率用 mode: std/pro
//   · vidu           → { duration, aspect_ratio, resolution }
// 2026-10-30 按各家官方文档写；如果某家报参数错，日志里会原样返回服务端 message。

async function dashscopeCreate({ provider, apiKey, baseUrl, model, prompt, duration, ratio, resolution }) {
  const url = `${baseUrl}/services/aigc/video-generation/video-synthesis`

  let parameters
  if (provider === 'wan') {
    parameters = { duration, ratio, resolution }
  } else if (provider === 'kling' || provider === 'pixverse') {
    // 可灵/爱诗：时长 + 宽高比 + 清晰度档位（std=720P / pro=1080P）
    parameters = {
      duration,
      aspect_ratio: ratio,
      mode: String(resolution).toUpperCase() === '1080P' ? 'pro' : 'std',
    }
  } else {
    // vidu / 其他：时长 + 宽高比 + 分辨率
    parameters = { duration, aspect_ratio: ratio, resolution }
  }

  return fetchJson(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({ model, input: { prompt }, parameters }),
  })
}

async function wanQuery({ apiKey, baseUrl, taskId }) {
  return fetchJson(`${baseUrl}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
}

/* ───────────── 火山方舟（即梦） ───────────── */

async function arkCreate({ apiKey, baseUrl, model, prompt, duration, ratio, resolution }) {
  // 火山用 --ratio / --dur 这类参数塞在 content.text 里
  const text = `${prompt} --ratio ${ratio} --dur ${duration}` + (resolution ? ` --rs ${resolution}` : '')
  return fetchJson(`${baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, content: [{ type: 'text', text }] }),
  })
}

async function arkQuery({ apiKey, baseUrl, taskId }) {
  return fetchJson(`${baseUrl}/contents/generations/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
}

/* ───────────── 统一入口 ───────────── */

function normalize(p, provider, raw) {
  const j = raw || {}
  if (provider === 'wan') {
    const o = j.output || {}
    return {
      taskId: o.task_id || '',
      status: o.task_status || 'UNKNOWN',
      videoUrl: o.video_url || '',
      error: j.code ? `${j.code}: ${j.message || ''}` : '',
    }
  }
  if (provider === 'ark') {
    // 火山的字段：id / status（queued/running/succeeded/failed）/ content.video_url
    return {
      taskId: j.id || '',
      status: (j.status || 'unknown').toUpperCase(),
      videoUrl: (j.content && j.content.video_url) || '',
      error: j.error ? JSON.stringify(j.error).slice(0, 200) : '',
    }
  }
  return { taskId: j.task_id || j.data?.task_id || '', status: j.task_status || j.data?.task_status || 'UNKNOWN', videoUrl: j.video_url || j.data?.task_result?.videos?.[0]?.url || '', error: '' }
}

async function resolveKey(ctx, provider) {
  const def = PROVIDERS[provider]
  const ref = def.keyEnv
  // 只读本插件自己的凭证（VIDEO_*_API_KEY），
  // **不回落**到 DASHSCOPE_API_KEY / ARK_API_KEY —— 那是 dsh-image-gen 的 Key，
  // 混用会让用户分不清「这个视频是谁的额度」。要让视频可用，必须在设置页里单独填。
  try {
    if (ctx.credentials && typeof ctx.credentials.resolve === 'function') {
      const c = await ctx.credentials.resolve(ref)
      const v = c && c.value ? String(c.value).trim() : ''
      if (v) return v
    }
  } catch { /* 落到 env */ }
  // 环境变量作为兜底（用户自己 export 的情况），同样只认本插件命名
  return String(process.env[ref] || '').trim()
}

/**
 * 返回该平台可用的**视频**模型清单。
 *
 * ⚠️ 为什么不调 /models 接口核对：
 *   2026-10-30 实测：这个 Key 能访问 184 个模型，但**全是文本/图像/音频模型**
 *   （qwen-image-3.0、wan2.7-image 等），一个 t2v/i2v 都没有。
 *   原因是百炼的**视频生成是单独开通的服务**，开通后的模型不出现在 /models 列表里。
 *   所以：
 *     · 清单以 PROVIDERS[*].models（按官方文档写死）为准 —— 这是唯一可靠来源；
 *     · **不做可达性核对** —— 否则会给每个视频模型打上误导性的「不可用」。
 *   是否真能跑通，用一次实际生成（或「测试连接」）来验证。
 */
async function listModels(provider, key, baseUrl) {
  const def = PROVIDERS[provider]
  const models = (def.models || []).map((m) => {
    const o = typeof m === 'string' ? { id: m, label: m } : m
    return { id: o.id, label: o.label || o.id }
  })
  let hint = '按官方文档列出的视频模型；是否已开通请以实际生成为准'
  if (!key) hint = '还没填 Key —— 下面是该平台支持的视频模型清单'
  return { ok: true, models, source: 'declared', hint }
}

/* ───────────── 插件主体 ───────────── */

export function apply(ctx, config) {
  const cfg = config || {}
  const workDir = cfg.workDir || join(homedir(), '.dsh', 'video-gen')
  try { mkdirSync(workDir, { recursive: true }) } catch { /* 忽略 */ }

  /* ───── 设置页后端：/api/video-gen/config ───── */
  // GET  → 返回各平台 Key 是否已配（**绝不回明文**）+ 默认平台
  // POST → 保存 Key / 切换默认平台 / 测试连接
  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/api/video-gen',
      handler: async (req, res) => {
        const sendJson = (code, obj) => {
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(obj))
        }
        // 安全：跨站一律拒；写操作必须来自本机回环（同抖音插件）
        const ra = String((req.socket && req.socket.remoteAddress) || '')
        const loopback = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1'
        const origin = String((req.headers && req.headers.origin) || '')
        if (origin) {
          try {
            if (new URL(origin).host !== String(req.headers.host || '')) {
              return sendJson(403, { ok: false, error: 'forbidden: 跨站请求' })
            }
          } catch { return sendJson(403, { ok: false, error: 'forbidden: origin 非法' }) }
        }
        if (req.method === 'POST' && !loopback) {
          return sendJson(403, { ok: false, error: 'forbidden: 改设置必须在本机操作' })
        }

        const url = new URL(req.url || '/', 'http://x')
        const sub = url.pathname.replace(/^\/api\/video-gen\/?/, '')

        // 读配置状态
        if (req.method === 'GET' && (sub === '' || sub === 'config')) {
          const platforms = {}
          for (const [id, def] of Object.entries(PROVIDERS)) {
            const key = await resolveKey(ctx, id)
            platforms[id] = {
              label: def.label,
              keyConfigured: Boolean(key),
              keyHint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : '',
              keyEnvName: def.keyEnv,
              // 走百炼的四个平台共用一把 Key，页面上按这个标记提示用户
              sharedKey: DASHSCOPE_GROUP.includes(id),
              // 直接给按官方文档列好的视频模型清单（不依赖 /models 接口）
              models: (def.models || []).map((m) => (typeof m === 'string' ? { id: m, label: m } : m)),
              defaultModel: (cfg[id] && cfg[id].model) || def.defaultModel,
              baseUrl: (cfg[id] && cfg[id].baseUrl) || def.baseUrl,
              note: def.note || '',
              hasKey: Boolean(key),
            }
          }
          return sendJson(200, { ok: true, provider: cfg.provider || 'wan', workDir, platforms })
        }

        // 读请求体
        let body = {}
        if (req.method === 'POST') {
          const chunks = []
          for await (const c of req) chunks.push(c)
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { body = {} }
        }

        // 处理「安装/清除 Key」之后按平台返回可用模型
        if (req.method === 'POST' && sub === 'models') {
          const provider = String(body.provider || '').trim()
          const def = PROVIDERS[provider]
          if (!def) return sendJson(400, { ok: false, error: '不认识的平台' })
          const key = await resolveKey(ctx, provider)
          if (!key) {
            // 没 Key 也把清单给出来，只是不做可达性核对
            const declared = (def.models || []).map((m) => (typeof m === 'string' ? { id: m, label: m } : m))
            return sendJson(200, { ok: true, models: declared, source: 'declared', hint: '还没填 Key，下面列出的是该平台支持的视频模型' })
          }
          const baseUrl = (cfg[provider] && cfg[provider].baseUrl) || def.baseUrl
          const r = await listModels(provider, key, baseUrl)
          return sendJson(200, {
            ok: true,
            models: r.models,
            source: r.source,
            probeTotal: r.probeTotal,
            hint: r.hint,
          })
        }

        // 保存接口地址和模型（每平台可覆盖默认值）
        if (req.method === 'POST' && sub === 'settings') {
          const provider = String(body.provider || '').trim()
          if (!PROVIDERS[provider]) return sendJson(400, { ok: false, error: '不认识的平台' })
          cfg[provider] = cfg[provider] || {}
          if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) cfg[provider].baseUrl = body.baseUrl.trim()
          if (typeof body.model === 'string' && body.model.trim()) cfg[provider].model = body.model.trim()
          // 落盘，重启后还在
          try {
            const st = join(workDir, 'config.json')
            let saved = {}
            try { saved = JSON.parse(readFileSync(st, 'utf8')) || {} } catch { saved = {} }
            saved.provider = cfg.provider || 'wan'
            saved[provider] = { baseUrl: cfg[provider].baseUrl, model: cfg[provider].model }
            writeFileSync(st, JSON.stringify(saved, null, 2), 'utf8')
          } catch { /* 存不下来不致命 */ }
          return sendJson(200, { ok: true, provider, baseUrl: cfg[provider].baseUrl || '', model: cfg[provider].model || '' })
        }

        // 保存 Key
        if (req.method === 'POST' && sub === 'key') {
          const provider = String(body.provider || '').trim()
          const value = String(body.key || '').trim()
          const def = PROVIDERS[provider]
          if (!def) return sendJson(400, { ok: false, error: '不认识的平台' })
          if (!value) return sendJson(400, { ok: false, error: 'Key 不能为空' })
          if (!ctx.credentials || typeof ctx.credentials.set !== 'function') {
            return sendJson(500, { ok: false, error: '凭证服务不可用，无法保存' })
          }
          await ctx.credentials.set(def.keyEnv, value)
          return sendJson(200, { ok: true, provider, saved: true, keyHint: `${value.slice(0, 4)}…${value.slice(-4)}` })
        }

        // 清除 Key
        if (req.method === 'POST' && sub === 'clear') {
          const provider = String(body.provider || '').trim()
          const def = PROVIDERS[provider]
          if (!def) return sendJson(400, { ok: false, error: '不认识的平台' })
          if (ctx.credentials && typeof ctx.credentials.unset === 'function') {
            await ctx.credentials.unset(def.keyEnv)
          }
          return sendJson(200, { ok: true, provider, cleared: true })
        }

        // 切换默认平台
        if (req.method === 'POST' && sub === 'provider') {
          const provider = String(body.provider || '').trim()
          if (!PROVIDERS[provider]) return sendJson(400, { ok: false, error: '不认识的平台' })
          cfg.provider = provider
          try {
            const st = join(workDir, 'config.json')
            writeFileSync(st, JSON.stringify({ provider }, null, 2), 'utf8')
          } catch { /* 存不下来也不致命 */ }
          return sendJson(200, { ok: true, provider })
        }

        // 测试连接：用一个极轻的请求验证 Key 是否有效
        if (req.method === 'POST' && sub === 'test') {
          const provider = String(body.provider || '').trim()
          const def = PROVIDERS[provider]
          if (!def) return sendJson(400, { ok: false, error: '不认识的平台' })
          const key = await resolveKey(ctx, provider)
          if (!key) return sendJson(200, { ok: false, reachable: false, error: '还没有配置 Key' })

          const baseUrl = (cfg[provider] && cfg[provider].baseUrl) || def.baseUrl
          if (provider === 'ark') {
            const r = await fetchJson(`${baseUrl}/contents/generations/tasks?page_num=1&page_size=1`, {
              headers: { Authorization: `Bearer ${key}` },
            }, 20000)
            const invalidKey = r.status === 401 || r.status === 403
            return sendJson(200, {
              ok: !invalidKey,
              reachable: r.status > 0,
              status: r.status,
              message: invalidKey ? 'Key 无效或已过期' : '连接正常，Key 有效',
            })
          }
          // 万相 / 可灵 / 爱诗 / Vidu 都走百炼：用一个不存在的任务 ID 探鉴权
          //   401/403 = Key 无效；其他（404/400 等）= Key 有效但任务不存在
          const r = await fetchJson(`${baseUrl}/tasks/00000000-0000-0000-0000-000000000000`, {
            headers: { Authorization: `Bearer ${key}` },
          }, 20000)
          const invalidKey = r.status === 401 || r.status === 403
          return sendJson(200, {
            ok: !invalidKey,
            reachable: r.status > 0,
            status: r.status,
            message: invalidKey ? 'Key 无效或已过期' : '连接正常，Key 有效（该平台模型需在百炼控制台单独开通）',
          })
        }

        return sendJson(404, { ok: false, error: 'unknown path: ' + sub })
      },
    }))
  } catch (e) {
    try { console.warn('[video] 注册设置页接口失败：' + ((e && e.message) || e)) } catch { /* 忽略 */ }
  }

  // 工具结果渲染：宿主要求每个工具都声明 output { schema, render }
  const TEXT = (text) => [{ type: 'text', text }]

  ctx.tools.register(defineTool({
    name: 'generate_video',
    description:
      '根据文字描述生成一段短视频（默认 5 秒）。需要先在「设置 → 插件 → 视频生成」里配置对应平台的 API Key。' +
      '生成是异步的：本工具会提交任务并等待结果（最长约 5 分钟），成功后返回本地视频文件路径。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '视频内容描述（中英文都可以）' },
        provider: {
          type: 'string',
          enum: Object.keys(PROVIDERS),
          description: '用哪个平台生成；不传就用设置里选的默认平台',
        },
        duration: { type: 'number', description: '时长（秒），默认 5。万相支持 2-15 秒' },
        ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '3:4', '4:3'], description: '宽高比，默认 9:16（抖音竖屏）' },
        resolution: { type: 'string', enum: ['720P', '1080P'], description: '分辨率档位，默认 720P（更便宜）' },
      },
      required: ['prompt'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          provider: { type: 'string' },
          model: { type: 'string' },
          videoPath: { type: 'string' },
          videoUrl: { type: 'string' },
          taskId: { type: 'string' },
          status: { type: 'string' },
          error: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const v = value || {}
        if (v.ok && v.videoPath) {
          return TEXT(`✓ 视频已生成（${v.provider} / ${v.model || ''}）\n文件：${v.videoPath}${v.bytes ? `\n大小：${(v.bytes / 1024 / 1024).toFixed(1)} MB` : ''}`)
        }
        if (v.ok && v.videoUrl) return TEXT(`✓ 已生成，源链接：${v.videoUrl}（24 小时内有效）`)
        return TEXT(`✗ 生成失败：${v.error || '未知原因'}${v.taskId ? `\n任务：${v.taskId}（状态 ${v.status || '?'}）` : ''}${v.howToFix ? `\n${v.howToFix}` : ''}`)
      },
    },
    async execute(args) {
      const provider = String(args.provider || cfg.provider || 'wan').trim()
      const def = PROVIDERS[provider]
      if (!def) return { ok: false, error: `不认识的平台：${provider}`, available: Object.keys(PROVIDERS) }

      // 走百炼 DashScope 的平台（同一个接口，不同模型名/参数）
      const DASHSCOPE_LIKE = ['wan', 'kling', 'pixverse', 'vidu']

      const apiKey = await resolveKey(ctx, provider)
      if (!apiKey) {
        return {
          ok: false,
          error: `平台「${def.label}」的 API Key 还没配置`,
          howToFix: `在 设置 → 插件 → 视频生成 里填写 ${def.label} 的 Key（凭证名 ${def.keyEnv}）`,
        }
      }

      // 模型优先级：工具参数 > 该平台的配置 > 平台默认
      const model = String(args.model || (cfg[provider] && cfg[provider].model) || def.defaultModel)
      const duration = Math.max(2, Math.min(15, Number(args.duration) || 5))
      const ratio = String(args.ratio || '9:16')
      const resolution = String(args.resolution || '720P')
      const baseUrl = String((cfg[provider] && cfg[provider].baseUrl) || def.baseUrl)

      const shared = { provider, apiKey, baseUrl, model, prompt: String(args.prompt), duration, ratio, resolution }

      const isDash = DASHSCOPE_LIKE.includes(provider)

      // ① 创建任务
      const created = isDash ? await dashscopeCreate(shared) : await arkCreate(shared)
      const c = normalize(null, provider, created.json)
      if (!created.ok || !c.taskId) {
        return {
          ok: false,
          error: `创建任务失败（HTTP ${created.status}）`,
          raw: (created.text || '').slice(0, 500),
        }
      }

      // ② 轮询
      //    实测：万相 720P / 5 秒的任务常常需要 5-12 分钟（2026-10-30 实测 9 分钟仍在 RUNNING），
      //    原来的 5 分钟上限太短，会把「其实正在跑」误判成失败。放宽到 15 分钟。
      const startAt = Date.now()
      const maxWaitMs = 15 * 60 * 1000
      let last = c
      while (Date.now() - startAt < maxWaitMs) {
        await new Promise((r) => setTimeout(r, 15000))
        const q = isDash
          ? await wanQuery({ apiKey, baseUrl, taskId: c.taskId })
          : await arkQuery({ apiKey, baseUrl, taskId: c.taskId })
        last = normalize(null, provider, q.json)
        if (/SUCCEEDED|SUCCESS/i.test(last.status)) break
        if (/FAILED|ERROR|CANCELED/i.test(last.status)) {
          return { ok: false, taskId: c.taskId, status: last.status, error: last.error || '生成失败' }
        }
      }

      if (!/SUCCEEDED|SUCCESS/i.test(last.status) || !last.videoUrl) {
        return { ok: false, taskId: c.taskId, status: last.status, error: '超时未完成（任务可能仍在跑）', hint: '可以稍后用 taskId 再查' }
      }

      // ③ 下载到本地
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const out = join(workDir, `video-${stamp}.mp4`)
      try {
        const r = await fetch(last.videoUrl)
        const buf = Buffer.from(await r.arrayBuffer())
        writeFileSync(out, buf)
        return {
          ok: true,
          provider,
          model,
          duration,
          ratio,
          videoPath: out,
          bytes: buf.length,
          sourceUrl: last.videoUrl,
          note: '源链接 24 小时后失效，本地文件已保存',
        }
      } catch (e) {
        return { ok: true, provider, model, videoUrl: last.videoUrl, downloadError: String((e && e.message) || e) }
      }
    },
  }))

  // 状态工具：看看哪些平台配好了 Key
  ctx.tools.register(defineTool({
    name: 'video_gen_status',
    description: '查看视频生成各平台的 Key 配置情况和默认平台',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          provider: { type: 'string' },
          workDir: { type: 'string' },
          platforms: { type: 'object', additionalProperties: true },
        },
      },
      render: (_args, value) => {
        const v = value || {}
        const lines = Object.entries(v.platforms || {}).map(([id, p]) =>
          `${p.keyConfigured ? '✓' : '✗'} ${p.label}（${id}）${p.keyConfigured ? ' Key 已配置' : ' 未配置 Key'}`
        )
        return TEXT(`默认平台：${v.provider}\n输出目录：${v.workDir}\n\n${lines.join('\n')}`)
      },
    },
    async execute() {
      const out = {}
      for (const [id, def] of Object.entries(PROVIDERS)) {
        out[id] = {
          label: def.label,
          keyConfigured: Boolean(await resolveKey(ctx, id)),
          models: (def.models || []).map((m) => (typeof m === 'string' ? m : m.id)),
          defaultModel: def.defaultModel,
        }
      }
      return { ok: true, provider: cfg.provider || 'wan', workDir, platforms: out }
    },
  }))
}
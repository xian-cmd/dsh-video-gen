# dsh-video-gen

> 给 [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) 用的**视频生成插件**。
> 在设置页填一次 API Key，之后直接对 AI 说「生成一段视频」，成品自动存到本地。

一个插件，接入 **5 个平台**：通义万相 Wan、火山方舟（即梦 / Seedance）、可灵 Kling、爱诗 PixVerse、Vidu。
挂载后 AI 会多出一个 `generate_video` 工具，生成完把 `.mp4` 直接落到你的硬盘上。

---

## 这是什么

DeepSeek Harness 是可以装插件的 AI 客户端。这个插件做的事很简单：

1. **在设置页管 Key** —— 每个平台的 Key 存进 DSH 的凭证服务，页面上永不回显明文
2. **注册一个工具** —— `generate_video`，AI 自己就能调用
3. **跑完整流程** —— 创建任务 → 轮询状态 → 下载成片 → 存本地

你只需要说一句：

> 「帮我生成一段 5 秒的视频：夜晚的城市天际线，霓虹灯在雨中闪烁」

AI 就会调工具、等结果（通常 1-15 分钟），然后告诉你文件存在哪。

---

## 支持的平台

| 平台 | 内部 ID | 凭证名 | 代表模型 | 说明 |
|---|---|---|---|---|
| **通义万相** Wan | `wan` | `VIDEO_DASHSCOPE_API_KEY` | `wan3.0-video` | 阿里云百炼，最长 30 秒，支持文生/图生/参考生 |
| **火山方舟** | `ark` | `VIDEO_ARK_API_KEY` | `doubao-seedance-2-5-260628` | 即梦 / Seedance 系，独立平台、独立 Key |
| **可灵** Kling | `kling` | `VIDEO_DASHSCOPE_API_KEY` | `kling/kling-v3-video-generation` | 走百炼，需在控制台单独开通；文生视频必填宽高比 |
| **爱诗** PixVerse | `pixverse` | `VIDEO_DASHSCOPE_API_KEY` | `pixverse/pixverse-v6-t2v` | 走百炼，需单独开通 |
| **Vidu** | `vidu` | `VIDEO_DASHSCOPE_API_KEY` | `vidu/viduq3-pro_text2video` | 走百炼，需单独开通 |

### 为什么是两把 Key 而不是五把

走百炼（DashScope）的四家 —— 万相、可灵、爱诗、Vidu —— **共用同一把 Key**。
它们本来就是同一个服务，只是要你在百炼控制台分别开通对应模型，没必要填四次。

火山方舟是独立平台，单独一把。

> ⚠️ **和生图插件互不影响。**
> 本插件只认 `VIDEO_*` 前缀的凭证，**不会**去复用 `dsh-image-gen` 的 `DASHSCOPE_API_KEY` / `ARK_API_KEY`。
> 这样你一眼就知道「这段视频花的是谁的额度」。

---

## 安装

### 前置条件

- DeepSeek Harness（DSH）已安装并运行
- Cordis `>= 4.0.4`（peer 依赖，DSH 自带）

### 方式一：本地目录安装

```bash
dsh plugin --profile <你的profile名> add <仓库根目录>/packages/video
```

然后在 profile 的 `package.json` 里，往 `dsh.profile.bundles` 数组加上 `"video"`：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["video", "...其他插件"]
    }
  }
}
```

### 方式二：软链到 node_modules

```powershell
# Windows：把 packages/video 链到 profile 的 node_modules
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\video" `
  -Target "D:\path\to\dsh-video-gen\packages\video"
```

> ⚠️ 目标必须是 **`packages/video`**，不是仓库根目录。
> DSH 要的是含 `package.json` + `cordis.patch.yml` 的那个包目录。

同样需要往 `dsh.profile.bundles` 加 `"video"`。

### 装完怎么确认

重启 DSH → **设置 → 插件 → 视频生成**，能看到 5 个平台的列表就说明挂载成功。

---

## 配置

在 **设置 → 插件 → 视频生成** 页面：

1. 顶部选**默认平台**（只有配了 Key 的平台能选）
2. 点开任意平台那一行，填入 API Key → 点「保存」
3. 点「**测试连接**」验证 Key 是否有效
4. 模型下拉框会列出该平台支持的视频模型，选一个

每个平台还能单独改**接口地址** —— 换代理 / 中转站时填这里。

配置会落盘到 `<workDir>/config.json`，重启不丢。

### 拿 Key

| 平台 | 控制台地址 |
|---|---|
| 通义万相 / 百炼系 | https://bailian.console.aliyun.com/ |
| 火山方舟 | https://console.volcengine.com/ark |

> **重点**：百炼的**视频生成是单独开通的服务**。开通后，这些视频模型**不会**出现在 `/models` 接口返回的列表里 —— 那个接口只返回文本/图像模型。
> 所以本插件的模型清单是**按官方文档写死的**，不做可达性核对。能不能真跑通，请用一次实际生成验证。

---

## 用法

### 对 AI 说

> 「生成一段 9:16 的竖屏视频，5 秒，雨中的城市霓虹」

### 工具参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `prompt` | string | **必填** | 视频内容描述，中英文都可以 |
| `provider` | enum | 设置里的默认平台 | `wan` / `ark` / `kling` / `pixverse` / `vidu` |
| `duration` | number | `5` | 时长（秒），会夹在 2-15 之间 |
| `ratio` | enum | `9:16` | `16:9` / `9:16` / `1:1` / `3:4` / `4:3` |
| `resolution` | enum | `720P` | `720P` / `1080P` |

### 另一个工具：`video_gen_status`

查看各平台 Key 的配置情况和默认平台：

```
默认平台：wan
输出目录：D:\项目\大肥鱼用\视频

✓ 通义万相 Wan（阿里云 DashScope）（wan） Key 已配置
✗ 火山方舟（即梦 / Seedance）（ark） 未配置 Key
✓ 可灵 Kling（走百炼 DashScope）（kling） Key 已配置
```

---

## 成片存在哪

默认 `~/.dsh/video-gen/`，可在 `cordis.patch.yml` 里用 `workDir` 改：

```yaml
- insert:
    - id: video
      name: video
      config:
        provider: wan
        workDir: 'D:\项目\大肥鱼用\视频'
```

文件命名：`video-<ISO时间戳>.mp4`，例如 `video-2026-10-30T05-38-12.mp4`。

---

## 一个必须知道的坑：等待时间

**生成是慢的。** 实测万相 720P / 5 秒的任务经常要 **5-12 分钟**，9 分钟还在 `RUNNING` 是常态。

插件原来的轮询上限是 5 分钟，会把「其实正在跑」的任务误判成失败。
现在放宽到 **15 分钟**，每 15 秒查一次。

如果你 15 分钟还没等到，工具会返回 `taskId`，可以稍后带着这个 ID 再查。

---

## 安全设计

插件开了一个设置页后端接口 `/api/video-gen`，做了这些限制：

- **跨站请求一律拒绝** —— 校验 `Origin` 头，不匹配就返回 403
- **写操作必须来自本机回环** —— POST 只接受 `127.0.0.1` / `::1`
- **Key 不回显明文** —— GET 接口只返回 `abcd…wxyz` 这种脱敏提示
- **Key 存 DSH 凭证服务** —— 不落到插件自己的文件里

---

## 项目结构

**代码包和说明文档同级并列** —— 文档在仓库根目录，代码全部收在 `packages/` 下。

```
dsh-video-gen/
├── README.md               # 本文档：这是什么、怎么装、怎么用
├── LICENSE                 # MIT
├── .gitignore
└── packages/
    └── video/              # ← 真正的插件包目录（DSH 挂载的就是它）
        ├── index.js        # 后端：平台定义、HTTP 调用、工具注册、设置页接口（621 行）
        ├── client.js       # 前端：设置页 React 组件（365 行）
        ├── cordis.patch.yml # DSH bundle 挂载声明
        └── package.json    # 包名 video + dsh 插件元数据
```

> 安装 / 软链时指向的是 **`packages/video`**，不是仓库根目录。

以后再加插件包，直接往 `packages/` 下开新目录即可，各包互不干扰。

### 两个关键设计点

**1. 各平台参数名不一样**

四家百炼系走同一个接口 `services/aigc/video-generation/video-synthesis`，但 `parameters` 字段不统一：

| 平台 | 参数字段 |
|---|---|
| `wan` | `{ duration, ratio, resolution }` |
| `kling` / `pixverse` | `{ duration, aspect_ratio, mode }`（`mode` 为 `std`/`pro`） |
| `vidu` | `{ duration, aspect_ratio, resolution }` |

火山方舟则把参数塞在 prompt 文本里：`"<prompt> --ratio 9:16 --dur 5 --rs 720P"`。

**2. 设置页挂载点**

前端挂到两个 slot，而不是 `settings.section`：

```js
ctx.slots.inject('plugins.bundle.config', ...)   // 插件管理页
ctx.slots.inject('settings.plugin.item', ...)    // 设置页里的一栏
```

因为 profile 的 `cordis.patch.yml` 里 `ui-settings` 是 `enabled: false`，走 `settings.section` 不生效。

---

## 已知限制

- **火山方舟的模型清单可能过期** —— 是按 2026-10-30 从官方文档提取的，官方上新模型不会自动同步
- **不做模型可达性核对** —— 见上文「视频模型不在 /models 里」的原因
- **轮询是同步阻塞的** —— 工具会一直等到出结果或 15 分钟超时，期间这个调用占着
- **没有批量生成** —— 一次一个任务
- **只做了 Windows 路径适配** —— `workDir` 默认值用了 `homedir()`，跨平台应该没问题，但主要是在 Windows 上用的

---

## 许可

MIT

---

## 免责声明

本项目是**个人自用插件**，与阿里云、火山引擎、快手（可灵）、爱诗科技、生数科技（Vidu）均无隶属关系。
所有 API 调用产生的费用由使用者自行承担。
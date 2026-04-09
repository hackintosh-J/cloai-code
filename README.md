# cloaiCode

<div align="center">

  <img src="preview.png" alt="cloaiCode Model Selector Preview" />
  <h1>cloaiCode</h1>
  <p><strong>面向多 Provider 原生接入增强的代码助手 CLI。🚀</strong></p>
  <p>专业、务实、可落地。适合需要稳定接入第三方模型、代理服务与自定义网关的开发环境。🚀</p>
  <p>
    <a href="README.md"><img src="https://img.shields.io/badge/runtime-Bun%20%2B%20Node-3b82f6" alt="Runtime" /></a>
    <a href="README.md"><img src="https://img.shields.io/badge/config-~%2F.cloai-8b5cf6" alt="Config" /></a>
    <a href="README.md"><img src="https://img.shields.io/badge/providers-Anthropic%20%2F%20OpenAI%20compatible-10b981" alt="Providers" /></a>
    <a href="README.md"><img src="https://img.shields.io/badge/status-active%20fork-f59e0b" alt="Status" /></a>
  </p>

</div>

---

## 近期重要更新

更新于 **2026 年 4 月 8 日**

- ⭐ **支持 `/context` 上下文来源显示与上下文窗口上限手动设置。**
- ⭐ **支持 Responses API 缓存命中，显著降低成本并提速。**

更多历史更新与细节说明请跳转查看：[详细更新日志](#详细更新日志)

---

## ✨ 项目简介

`cloaiCode` 是一个面向实际开发场景持续演进的 CLI 分支，是原生兼容多个模型供应商的 Claude Code 修改版。相比原版，我们让**第三方模型接入**做到了可用、好用、易维护。

我们舍弃了对外部切换器的依赖，在原版代码的基础上直接深度扩展了**原生接入能力**。

**典型适用场景：**

  * 🖥️ 在本地终端中直接调用自定义模型与 Provider。
  * 🌐 通过 Anthropic 兼容网关、OpenAI 兼容网关或 Gemini 兼容网关接入模型。
  * 🔐 无缝切换 API Key、OAuth 及不同 Provider 的专属鉴权模式。
  * 🧱 在无桌面环境（GUI）的服务器终端中高效完成配置与调用。
  * ⚙️ 统一集中管理配置、登录态与模型选择等行为至独立目录。

-----

## 🎯 核心痛点与解决方案

相比许多用户习惯通过 **CC Switch** 将第三方模型接入现有工具链， `cloaiCode` 更进一步，做到了体验更佳的**原生支持**！！！

**我们做到了：**

  * ⚡ **链路更短，响应更快**：省去中间切换与转接层。
  * 🧭 **闭环体验，直截了当**：Provider 选择、鉴权与模型切换均在工具内部一站式完成。
  * 🛠️ **开箱即用，降低依赖**：无需额外部署切换器即可实现基础接入。
  * 🖥️ **完美契合无头环境**：在无屏幕终端、远程 SSH 或 Docker 环境中配置极其便利。
  * 🔄 **配置统一，易于排障**：全局语义一致，问题定位更直观。

如果你的主力工作台是**云主机、跳板机、远程开发容器**或**无 GUI 的 Linux / Windows Server 终端**，这种“原生接入”将为你带来和原生 CLI 体验一致的爽感。

-----

## 🚀 核心增强特性

相比上游版本，本项目目前重点重构并增强了以下能力：

### 1\. 原生多 Provider 接入

支持在程序内部直接配置并无缝切换不同的 Provider，彻底摆脱对外部切换层的依赖。

### 2\. 原生多鉴权模式隔离

针对不同 Provider，支持独立持久化存储其对应的鉴权方式。有效解决“相同 Provider 却被错误复用 authMode”的历史遗留问题。

### 3\. 自定义模型与列表管理

提供更便捷的非默认模型接入方案。支持轻松维护本地模型列表，并在交互进程中实现即时点选。

### 4\. 深度优化的 OpenAI 兼容协议

除了完善的 Anthropic 兼容路径外，本项目正在持续深化 OpenAI 侧的协议与路由能力，已支持：

  * Chat Completions
  * Responses
  * OAuth(例如你购买了 ChatGPT Plus， 可以在这里使用)

### 5\. 独立配置目录与数据沙盒

默认采用 `~/.cloai` 作为全局配置根目录，从物理层面避免与其他同类工具发生配置、缓存或登录态的碰撞与污染。

-----

## ✅ 已验证模型与网关接入

本项目最核心的能力，就是**通过兼容网关直接接入不同模型**，而不是把模型切换逻辑外包给外围工具。

目前已经实际验证通过的主线路有三类：

### 1\. Anthropic 兼容网关

适用于提供 **Anthropic Messages / Claude 风格请求格式**的兼容服务、代理网关和第三方平台。

**已验证模型：**

| 模型名称 | 接入方式 | 推理努力 (Reasoning) | 思维链显示 |
| :--- | :--- | :---: | :---: |
| `minimax-m2.7-highspeed` | Anthropic-compatible gateway | √ | √ |

**这一类通常可以承接的模型方向：**

  * 任何被网关包装成 **Anthropic/Claude 兼容协议** 的第三方模型
  * 各类自建中转、聚合网关、代理平台中映射成 Claude 风格 API 的模型
  * 典型场景是：你不一定真的在调用 Anthropic 官方模型，但你可以通过 **Anthropic 兼容层**把目标模型接进 `cloaiCode`

### 2\. OpenAI 兼容网关

适用于提供 **Chat Completions / Responses / OAuth** 的 OpenAI 风格接口平台。这一条线路是当前最重要、也最值得详细写清楚的主线路之一。

**已验证模型：**

| 模型名称 | 接入方式 | 推理努力 (Reasoning) | 思维链显示 |
| :--- | :--- | :---: | :---: |
| `gpt-5.4` | OpenAI-compatible gateway via Chat Completions | √ | √ |
| `gpt-5.4` | OpenAI-compatible gateway via Responses | √ | √ |
| `gpt-5.4` | OpenAI-compatible gateway via OAuth | √ | √ |

**这一类可接入的模型方向：**

  * `gpt-5.4`
  * 其他被你的网关暴露为 **OpenAI Chat Completions** 接口的模型
  * 其他被你的网关暴露为 **OpenAI Responses** 接口的模型
  * 各类通过 OpenAI 风格 `baseURL + apiKey` 即可调用的第三方模型



### 3\. Gemini 兼容网关

适用于提供 **Gemini 风格接口**或 Gemini CLI OAuth 路径的服务。

**已验证模型：**

| 模型名称 | 接入方式 | 推理努力 (Reasoning) | 思维链显示 |
| :--- | :--- | :---: | :---: |
| `gemini-3-flash-preview` | Gemini-compatible gateway | - | √ |
| `gemini-3.1-pro-high` | Gemini-compatible gateway | - | √ |

**这一类可以重点接入的模型方向：**

  * `gemini-3-flash-preview`
  * `gemini-3.1-pro-high`
  * 其他被网关或 CLI 入口包装成 **Gemini-compatible** 请求路径的模型

`cloaiCode` 已经把三条关键网关接入打通：

  * **Anthropic 兼容网关接入第三方模型**
  * **OpenAI 兼容网关接入第三方模型**
  * **Gemini 兼容网关接入第三方模型**

-----

## 🧩 数据隔离与配置管理

为了保证多环境下的稳定性，本项目将所有用户数据统一收口至：

  * **配置根目录**：`~/.cloai`
  * **用户级配置文件**：`~/.cloai/settings.json`
  * **项目级配置文件**：`.claude/settings.json`
  * **本地项目配置文件**：`.claude/settings.local.json`

**本项目绝妙之处：**

  * 杜绝历史登录态的互相污染。
  * 防止不同网关或 Provider 的 Endpoint 发生串联。
  * 确保模型列表、鉴权方式及缓存状态彼此独立。
  * 为多环境（开发/生产）提供极其便捷的独立配置与备份手段。

对于需要长期维护多套底层环境的开发者而言，这种物理隔离设计将显著降低日常排障成本（你也不想在深夜一个人挠头debug吧）。🧰

### 上下文窗口配置方式

目前上下文窗口上限可以通过两种方式控制：

#### 1. 通过 `/config` 交互设置（强烈推荐）

在命令行中输入：

```text
/config
```

然后进入：

```text
Config → Context window override / Sampling temperature
```

切换方式：

- 使用 **← / → 方向键** 切换选项
- 或使用 **空格键** 循环切换当前选项

可选模式如下：

- `Auto`
  - 使用程序默认判断逻辑
  - Claude 官方模型继续走官方 capability / beta / experiment 逻辑
  - 命中本地模型注册表的兼容模型会按注册表上限计算
  - 未命中时回退为默认 `200k`
- `4k`
  - 强制将上下文窗口视为 `4,000 tokens`
- `32k`
  - 强制将上下文窗口视为 `32,000 tokens`
- `200k`
  - 强制将上下文窗口视为 `200,000 tokens`
- `1M`
  - 强制将上下文窗口视为 `1,000,000 tokens`

切换完成后，设置会写入：

```text
.claude/settings.local.json
```

换句话说，这个 override 只会在**项目目录**下生效，不会干扰全局配置

也可以在同一位置配置 `Sampling temperature`：

- `default`
  - 保持当前系统默认行为
  - 不改变现有 provider 分支逻辑
- `off`
  - 明确不发送 `temperature`
- `custom`
  - 发送指定数值 `temperature`
  - 取值范围限制为 `0 <= value <= 2`

这个设置同样默认写入：

```text
.claude/settings.local.json
```

如果启用了 Anthropic thinking 模式，仍会继续遵守当前兼容语义：请求中不发送 `temperature`。

#### 2. 直接修改配置文件

如果你更喜欢手动改文件，也可以直接编辑：

```json
{
  "modelContextWindowOverride": "auto"
}
```

支持的取值为：

```json
"auto" | "4k" | "32k" | "200k" | "1m"
```

示例：

```json
{
  "modelContextWindowOverride": "1m"
}
```

这表示：无论当前模型的默认窗口是多少，都强制按 `1M` 上下文窗口计算。

如果要恢复自动判断，改回：

```json
{
  "modelContextWindowOverride": "auto"
}
```

### `/context` 显示逻辑说明

执行：

```text
/context
```

时，顶部会显示当前上下文使用量与上限。

其中：

- **`[API]`** 表示顶部总量来自 transcript 中最近一次有效 API usage
- **`[Est]`** 表示当前无法取得有效 API usage，因此回退为本地估算

注意：

- 顶部总量与百分比优先使用 API usage
- 下方 `Estimated usage by category` 仍然主要是**按类别估算**
- 因此顶部总量与 `Messages` 分项不一定完全相等，这是正常现象

-----

## 📦 环境要求与安装

在开始之前，请确保本机环境满足以下前置依赖：

  * **Bun** \>= `1.3.5`
  * **Node.js** \>= `24`

### 安装依赖

```bash
bun install
```

**⚠️ 路径确认：**
请务必确认 Bun 的可执行目录已加入当前 shell 的 `PATH` 环境变量中。否则，执行 `bun link` 后 `cloai` 命令可能无法在全局生效。

```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

如果你在 **Windows** 上使用 `PowerShell`，可改为：

```powershell
$env:BUN_INSTALL = "$HOME\.bun"
$env:PATH = "$env:BUN_INSTALL\bin;$env:PATH"
```

如果希望对当前用户永久生效，可执行：

```powershell
[System.Environment]::SetEnvironmentVariable('BUN_INSTALL', "$HOME\.bun", 'User')
[System.Environment]::SetEnvironmentVariable(
  'PATH',
  "$HOME\.bun\bin;" + [System.Environment]::GetEnvironmentVariable('PATH', 'User'),
  'User'
)
```

如果你使用的是 `cmd`，则对应写法为：

```cmd
set BUN_INSTALL=%USERPROFILE%\.bun
set PATH=%BUN_INSTALL%\bin;%PATH%
```

永久设置可使用：

```cmd
setx BUN_INSTALL "%USERPROFILE%\.bun"
setx PATH "%USERPROFILE%\.bun\bin;%PATH%"
```

说明：

  * `export` / `$env:` / `set` 只对当前终端会话生效
  * `SetEnvironmentVariable(..., 'User')` / `setx` 会写入用户环境变量，需重新打开终端
  * Windows 的 `PATH` 分隔符是 `;`，不是 `:`

可通过以下命令进行环境自检：

```bash
which bun
echo $PATH
```

-----

## 🛠️ 部署与使用方式

### 方式一：源码全局部署（推荐）

在仓库根目录依次执行：

```bash
bun install
bun link
```

部署完成后，即可在任意终端通过全局命令启动：

```bash
cloai
```

  * **包名**：`@cloai-code/cli`
  * **全局命令**：`cloai`

*(💡 排错指南：如果提示 `command not found`，通常是 `~/.bun/bin` 缺失于 `PATH` 中；如果提示找不到 `bun`，请检查入口脚本底部的 `#!/usr/bin/env bun` 解析路径是否正确。)*

### 方式二：作为 Link 包引入项目

将本 CLI 链接至全局：

```bash
bun link @cloai-code/cli
```

或在目标项目的 `package.json` 中直接引用：

```json
{
  "dependencies": {
    "@cloai-code/cli": "link:@cloai-code/cli"
  }
}
```

-----

## ▶️ 常用命令字典

  * **开发模式热启动**：`bun run dev`
  * **生产环境全局启动**：`cloai`
  * **查看当前版本号**：`bun run version`

-----

## 🔐 灵活的鉴权与登录体系

在模型供应商添加方面，根据用户您选择的 Provider，支持以下鉴权策略：

### 1\. API Key 模式 (作者推荐)

  * **适用场景**：Anthropic 兼容服务、OpenAI 兼容服务、各类代理/网关及第三方模型中转平台（如反重力）。
  * **优势**：最稳定、最易于自动化集成。完美适配服务器、容器、远程终端等纯无头环境。🔑

### 2\. OAuth 模式

  * **适用场景**：部分原生支持 OAuth 的 Provider 或特殊接入路径。
  * **优势**：当运行环境已具备相应图形化或浏览器回调条件时，可作为 API Key 的补充方案，允许你使用你的 Codex 额度或 Gemini CLI 额度。

### 3\. Provider 级独立鉴权沙盒

系统会对 **“Provider + authMode”** 的组合关系进行严格的持久化绑定。彻底终结以下痛点：

  * 切换 Provider 后错误沿用上一家的鉴权令牌。
  * 同一 Provider 下，不同鉴权模式的数据被互相覆盖。
  * 重启 CLI 后初始鉴权选项识别紊乱。

这对于需要频繁在多家大模型服务商之间横跳的重度用户（薅羊毛人士）而言，将会大大大提升体验感🧠

-----

## 🧭 Provider 路由与选择指南

我们重新写了 Provider 的选择逻辑，使其更加自然且意图明确。在实际配置中，你通常需要面对以下三个维度的选择：

### 1\. Anthropic 兼容线路

  * **目标场景**：自建网关、代理服务、第三方兼容平台，以及已验证的 `minimax-m2.7-highspeed` 接入。
  * **特点**：追求稳定与极简路径的不二之选。

### 2\. OpenAI 兼容线路

  * **目标场景**：提供 Chat Completions / Responses 标准接口的平台，接入 `gpt-5.4` 等核心模型，或需要兼容 OAuth 工作流的场景。
  * **典型模型方向**：`gpt-5.4`，以及任意被你的网关映射成 OpenAI 风格协议的第三方模型。

### 3\. Gemini 兼容线路

  * **目标场景**：提供 Gemini 风格接口或 Gemini CLI OAuth 工作流的平台，接入 `gemini-3-flash-preview`、`gemini-3.1-pro-high` 等模型。
  * **特点**：适合需要接入 Gemini 系模型，但又希望统一纳入同一套 CLI 交互、配置与模型选择逻辑的场景。

### 4\. 相同 Provider 的多路鉴权分化

同一个 Provider 的不同鉴权模式，可以重复添加，保证多个模型供应商都可以同时接入，随时切换。

-----

## 🔄 深度 OpenAI 协议支持

本项目在底层网络层面对齐了更为完整的 OpenAI 协议规范。当前重点支持：

  * 全面接管 OpenAI Chat Completions 路由。
  * 全面接管 OpenAI Responses 路由。
  * 精准匹配相应的模型选择器与鉴权中间件。
  * 针对不同协议路径的智能请求转发与载荷适配。

将协议解析转化为 CLI 的原生能力，正是 `cloaiCode` 在多模型接入场景下，体验远超传统外部中转切换方案。

-----

## 📚 推荐工作流

### 首次拉取与初始化

```bash
git clone <your-repo-url>
cd cloai-code
bun install
bun link
cloai
```

### 日常迭代与更新

```bash
git pull
bun install
bun link
cloai
```

这套标准工作流非常适合通过源码方式持续追踪上游更新的用户，也便于你随时在本地验证新模型、新 Provider 或新的底层协议支持。

-----

## 🖥️ 为什么它是服务器环境的理想选择？

在真实的服务器生产环境中，传统的“外部切换器 + 图形登录 + 多层转发”方案往往会暴露诸多短板：

  * 需额外引入并长期维护脆弱的切换组件。
  * 登录流程强依赖 GUI 环境或繁琐的跨端人工拷贝。
  * 配置文件散落在系统各处，排障链路极长。
  * 在纯 CLI 工具（如 SSH / tmux / Docker）中即时切换 Provider 体验割裂。

`cloaiCode` 坚持将核心操作收敛回 CLI 内部闭环，因此在以下场景中展现出压倒性的优势：

  * 纯无头 Linux 远程服务器
  * Windows Server Core 终端
  * WSL (Windows Subsystem for Linux)
  * Docker / Dev Container 开发容器
  * 基于 SSH 的极客运维流

总结：**系统少一层转接折腾，运行就少一分不确定性。** 🧩

-----

## ⚠️ 免责与声明

  * 本项目为一个处于持续演进中的非官方分支，不代表任何官方立场。
  * 部分核心能力已在生产级场景验证稳定，但个别冷门协议与 Provider 适配仍在敏捷迭代中。
  * 如果你追求对第三方模型接入过程的“绝对掌控权”，这个项目方向将比“单纯复刻官方行为”释放出更大的定制价值。

-----

## 🙏 致谢

特别感谢 **doge-code** 项目及其作者提供的宝贵灵感与架构参考。他们在该领域的早期探索极具前瞻价值，使得我们有幸站在巨人的肩膀上。

  * 参考项目：[https://github.com/HELPMEEADICE/doge-code.git](https://github.com/HELPMEEADICE/doge-code.git)

-----

## 📌 总结

`cloaiCode` 的亮点如下

  * ✅ **原生重构**的多 Provider 核心。
  * ✅ **原生隔离**的多鉴权模式。
  * ✅ **真实案例**的模型使用测试
  * ✅ **原生解析**的多元协议路径。
  * ✅ **完美适配**的纯服务器与无屏幕终端（如酶与底物的结合般绝妙）。

如果你正在寻觅一个**更纯粹、更灵活、更能从容应对复杂网络与部署环境**的代码助手 CLI 方案，那么，欢迎使用 `cloaiCode`。🔥

-----

## 详细更新日志

### 2026 年 4 月 9 日更新

- 修复非 Anthropic Provider 下 `/context` 分类统计缺失的问题：OpenAI-compatible、Gemini-compatible 以及后续新增的非 Anthropic Provider 不再依赖 Anthropic token-count 接口，而是统一回退到本地粗略估算，因此 `System prompt`、`System tools`、`Skills` 等分类可以稳定显示。
- 修复非 Anthropic Provider 下 MCP 输出截断判断失效的问题：当无法调用 Anthropic token counting 时，会回退到本地内容大小估算，避免超大 MCP 输出漏判。
- Codex OAuth 作为 OpenAI-compatible 路径，同样适用上述粗略估算逻辑。

### 2026 年 4 月 8 日更新

- 修复 `/context` 上下文用量计算不一致的问题，统一 runtime model 下的 autocompact buffer 口径，并在 API usage 缺失或为 0 时正确回退到本地估算，避免显示异常偏小或 0 的总量。
- 新增 `/context` 顶部来源标记，区分当前总量来自 API usage 还是本地估算，方便判断兼容模型的 usage 是否正常落盘。
- 新增全局采样温度配置：可在 `/config → Sampling temperature` 中选择 `default / off / custom`，并在 custom 模式下输入 `0..2` 的数值，最终统一控制是否发送 `temperature`。
- 保持 thinking 模式下的兼容语义：即使配置了 `samplingTemperature`，Anthropic thinking 请求仍不会发送 `temperature`。
- 补充 `samplingTemperature` 的配置说明，包含 `/config` 交互方式、`.claude/settings.local.json` 持久化位置，以及 `default / off / number` 的语义。
- 修复多轮工具调用与 Plan Mode 自动切换场景下，API 请求异常失败的问题。

### 2026 年 4 月 4 日更新

- ⭐**支持 Responses API 的缓存命中，成本降低 90%，并提速**
- 修复上下文穿插造成的回复不连续问题
- 针对部分 OpenAI 兼容路由补充更稳的缓存键支持
- 支持多模态以及图像粘贴到对话框

![Responses API cache preview](https://github.com/user-attachments/assets/d34682db-88be-49f0-af6f-c1e249f1a8fe)

注：`/chat/completions` 不支持缓存。请确保使用 `/responses` 方式请求，才能命中缓存。支持缓存的模型：
- `gpt-5.4`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1-chat-latest`, `gpt-5`, `gpt-5-codex`, `gpt-4.1`
- 兼容 `prompt_cache_key` 的其他模型

### 2026 年 4 月 3 日更新

- Codex OAuth、Responses API、Gemini OAuth 和 Vertex API 支持
- 支持设定推理强度
- 支持思维链流式输出

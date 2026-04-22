# cloaiCode

<div align="center">

  <img src="preview.png" alt="cloaiCode Model Selector Preview" />
  <h1>cloaiCode</h1>
  <p><strong>`cloaiCode` 是原生兼容多个模型供应商的 Claude Code 修改版。🚀</strong></p>
  <p>兼容 MiniMax-M2.7、GPT-5.4、Codex OAuth、GitHub Copilot、Google Gemini 等</p>
  <p>
    <a href="README.md"><img src="https://img.shields.io/badge/runtime-Bun%20%2B%20Node-3b82f6" alt="Runtime" /></a>
    <a href="README.md"><img src="https://img.shields.io/badge/config-~%2F.cloai-8b5cf6" alt="Config" /></a>
    <a href="README.md"><img src="https://img.shields.io/badge/providers-Anthropic%20%2F%20OpenAI%20compatible-10b981" alt="Providers" /></a>
    <a href="README.md"><img src="https://img.shields.io/badge/status-active%20fork-f59e0b" alt="Status" /></a>
  </p>

</div>

---

## 近期重要更新

更新于 **2026 年 4 月 22 日** 
（cloai-desktop前端赶工中…）

- ⭐ **新增 GitHub Copilot OAuth 的 GPT 系列模型缓存支持**：补齐对应 OpenAI-compatible 路径上的 Responses 缓存命中能力。

- ⭐ **`/login` 登录体系重写**：新增账号管理、Provider 分组、官方/自定义子菜单、分步配置与 OAuth 回填，整个登录链路从一次性录入升级为可持续管理的闭环。
- ⭐ **正式支持 GitHub Copilot OAuth**：已实测 `gpt-5-mini`、`claude-haiku-4.5`、`gemini-3-flash-preview`，并补齐 OpenAI OAuth、Google AI Studio、Google Antigravity (OAuth) 等官方线路。
- ⭐ **官方 / OAuth 线路支持自动写入模型列表**：OpenAI Official / OAuth、Google AI Studio、Google Antigravity (OAuth)、GitHub Copilot OAuth 登录完成后即可在 `/model` 直接切换。

更多历史更新与细节说明请跳转查看：[详细更新日志](#详细更新日志)

---

## ✨ 项目简介

`cloaiCode` 是原生兼容多个模型供应商的 Claude Code 修改版。相比原版，我们让**第三方模型接入**做到了可用、好用、易维护。

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

## 🚀 `/login` 与 `/model` 命令快速入门

本项目提供两条关键命令来完成鉴权与模型管理：

> 提示：相较云端 `main`，当前仓库已经额外支持 `GitHub Copilot OAuth`、`Google Antigravity (OAuth)`、`Google AI Studio (API key)` 与新版 `/login` 多级菜单流程；如果你此前只看过 `main` 版文档，以下内容以当前仓库实现为准。

### 1\. `/login` — 新版多级登录入口

`/login` 现在不再只是“一次输入完 BaseURL 和 Key”的线性流程，而是一个可反复进入的账号管理与 Provider 配置入口。

#### 进入后的总流程

- **已有已保存账号时**：先进入 `Manage accounts`
- **首次使用或无已保存账号时**：直接进入 `Select provider`

#### 子菜单 1：`Manage accounts`

如果本地已经保存过 Provider，`/login` 会先展示账号管理列表，每个条目都会显示：

- Provider 显示名
- Provider 类型
- 当前已保存的模型数量

在这里你可以：

- 选择某个已保存 Provider，进入其操作子菜单
- 选择 `Add new account →` 新增一条 Provider 配置
- 选择 `Done →` 退出 `/login`

#### 子菜单 2：`Provider actions`

选中某个已保存 Provider 后，会进入操作菜单：

- `Logout`
- `Back`

其中 `Logout` 会继续进入确认删除菜单。确认后会删除这一条已保存的 Provider 配置，并自动切换到下一条可用 Provider；如果已经没有其他账号，则回到 Provider 选择入口。

#### 子菜单 3：`Select provider`

新增账号时，会进入 Provider 根菜单。当前入口包括：

- `Claude`：官方 Anthropic 登录
- `OpenAI →`：进入 OpenAI 子菜单
- `Google Gemini`：直达 Google AI Studio API key 配置
- `Antigravity`：Google Antigravity (OAuth)
- `GitHub Copilot OAuth`：官方 OAuth
- `Custom →`：手动配置兼容接口

#### 子菜单 4：`Provider variant select`

当前只有以下分组会展开子菜单：

- `OpenAI →`
  - `Official Responses API`
  - `OAuth`
- `Custom →`
  - `Anthropic-Like`
  - `OpenAI-Like`
  - `Google-Vertex-Like`

`Google Gemini` 不再进入子菜单，而是直接打开 `Google AI Studio (API key)` 输入页。

> 说明：`Gemini CLI OAuth` 新建入口已删除，因为这条线路对新账号几乎必然触发封号或严重限流；已保存的 legacy 账号仅保留兼容，不再推荐新增。

#### 子菜单 5：`Configure official provider` / `Configure custom provider`

选定线路后，会进入分步配置阶段，不同线路的输入步骤不同：

- **Claude Official / OpenAI OAuth / Google Antigravity (OAuth)**
  - 直接进入浏览器 OAuth 流程
- **GitHub Copilot OAuth**
  - 先输入可选的 `GitHub Enterprise domain`
  - 然后进入设备码 / 浏览器授权流程
- **OpenAI Official Responses API**
  - 输入 OpenAI API Key
  - CLI 会自动拉取官方模型列表并保存
- **Google Gemini / Google AI Studio (API key)**
  - 直接输入 API Key
  - CLI 会自动拉取支持 `generateContent` 的模型列表并保存
- **OpenAI-Like**
  - 先选择 `chat/completions` 或 `Responses API`
  - 再输入 BaseURL、API Key、模型列表
- **Anthropic-Like / Google-Vertex-Like**
  - 输入 BaseURL、API Key、模型列表

#### 子菜单 6：`Ready to start` / `Waiting for login`

当进入 OAuth 线路后，CLI 会自动开始授权流程：

- 自动尝试打开浏览器
- 在终端展示等待登录状态
- 无法自动回调时，可手动粘贴完整回调 URL，或粘贴 `code#state`
- `GitHub Copilot OAuth` 会额外显示 device flow 的提示信息

#### 登录完成后会发生什么

登录成功后，CLI 会：

- 将当前 Provider 以独立记录保存下来
- 按 `Provider + authMode + variant + baseURL` 维度隔离登录态
- 自动回填或写入该线路对应的模型列表
- 让 `/model` 立即可见并可切换这些模型

配置会写入项目级或用户级配置路径，例如：

- `.claude/settings.local.json`
- `~/.cloai/settings.json`

### 2\. `/model` — 读取已登录 Provider 并切换模型

`/model` 会读取 `/login` 已保存的 Provider 记录，并将它们作为可切换模型来源。

#### 基本使用

```text
/model
```

执行后，CLI 会显示：

- 当前可用模型列表
- 当前选中的模型
- 模型所属的 Provider / 账号 / 鉴权方式

#### 新版显示逻辑

在 `/model` 列表中：

- 模型条目会带上账号或 Provider 名称，便于区分同名模型来自哪一路登录
- 同一个模型名可以在不同 Provider 下并存
- `/login` 自动回填的 OAuth 模型列表会直接出现在这里，无需再手工补录

#### 推荐流程

1. 运行 `/login` 新增或管理 Provider
2. 完成 API Key / OAuth 登录
3. 运行 `/model` 选择目标模型
4. 开始会话与测试

#### 说明

- `/login` 负责“接哪一家、用哪种鉴权、保存哪一组模型”
- `/model` 负责“当前会话用哪一个具体模型”
- 二者配合后，可以稳定支持多 Provider、多账号、多鉴权方式并存

-----

## ✅ 已验证模型与网关接入

本项目最核心的能力，是把不同 Provider 的 API Key、OAuth 与 compatible gateway 统一收敛到 CLI 内部，而不是依赖外围切换器。

目前已经实际验证通过的主线路如下：

### 1\. Anthropic 兼容网关

适用于提供 **Anthropic Messages / Claude 风格请求格式** 的兼容服务、代理网关和第三方平台。

**已验证模型：**

| 模型名称 | 接入方式 | 推理努力 (Reasoning) | 思维链显示 |
| :--- | :--- | :---: | :---: |
| `minimax-m2.7-highspeed` | Anthropic-compatible gateway | √ | √ |

**这一类通常可以承接的模型方向：**

- 任何被网关包装成 **Anthropic / Claude 兼容协议** 的第三方模型
- 各类自建中转、聚合网关、代理平台中映射成 Claude 风格 API 的模型
- 典型场景是：你不一定真的在调用 Anthropic 官方模型，但你可以通过 **Anthropic 兼容层** 把目标模型接进 `cloaiCode`

### 2\. OpenAI 兼容网关

适用于提供 **Chat Completions / Responses / OAuth** 的 OpenAI 风格接口平台。

**已验证模型：**

| 模型名称 | 接入方式 | 推理努力 (Reasoning) | 思维链显示 |
| :--- | :--- | :---: | :---: |
| `gpt-5.4` | OpenAI-compatible gateway via Chat Completions | √ | √ |
| `gpt-5.4` | OpenAI-compatible gateway via Responses | √ | √ |
| `gpt-5.4` | OpenAI-compatible gateway via OAuth | √ | √ |

**这一类可接入的模型方向：**

- `gpt-5.4`
- 其他被你的网关暴露为 **OpenAI Chat Completions** 接口的模型
- 其他被你的网关暴露为 **OpenAI Responses** 接口的模型
- 各类通过 OpenAI 风格 `baseURL + apiKey` 即可调用的第三方模型

### 3\. Gemini 兼容网关

适用于提供 **Gemini 风格接口** 或 Google AI Studio `generateContent` 路径的服务。

**已验证模型：**

| 模型名称 | 接入方式 | 推理努力 (Reasoning) | 思维链显示 |
| :--- | :--- | :---: | :---: |
| `gemini-3-flash-preview` | Gemini-compatible gateway | - | √ |
| `gemini-3.1-pro-high` | Gemini-compatible gateway | - | √ |

**这一类可以重点接入的模型方向：**

- `gemini-3-flash-preview`
- `gemini-3.1-pro-high`
- 其他被网关或 CLI 入口包装成 **Gemini-compatible** 请求路径的模型

### 4\. GitHub Copilot OAuth

适用于使用 GitHub / GitHub Enterprise 账号接入 Copilot Chat 对应模型额度。完成登录后，CLI 会自动启用并写入 Copilot 模型列表。

**已验证模型：**

| 模型名称 | 接入方式 | 备注 |
| :--- | :--- | :--- |
| `gpt-5-mini` | GitHub Copilot OAuth | 已实测 |
| `claude-haiku-4.5` | GitHub Copilot OAuth | 已实测 |
| `gemini-3-flash-preview` | GitHub Copilot OAuth | 已实测 |

**这一类线路的特点：**

- 支持 `github.com` 与可选 GitHub Enterprise 域名
- 登录完成后会自动启用并写入 Copilot 模型列表
- 在 `/model` 中会与其他 Provider 一起展示和切换

### 5\. OAuth / 官方线路的模型列表自动回填

当前各条官方 / OAuth 线路都已支持模型列表自动写入，避免登录完成后还要手工补 `savedModels`：

- **OpenAI Official Responses API**：保存 API Key 后自动拉取官方模型列表
- **OpenAI OAuth**：登录成功后自动写入可用模型列表
- **Google AI Studio (API key)**：保存 API Key 后自动拉取支持 `generateContent` 的模型列表
- **Google Antigravity (OAuth) / GitHub Copilot OAuth**：登录成功后自动写入对应线路的模型列表
- **Legacy Gemini CLI OAuth**：仅保留兼容，不再提供新增入口，因为这条线路对新账号极易触发封号或限流

`cloaiCode` 已经把这些关键接入链路统一收敛到同一套 CLI 交互之中：

- **Anthropic 兼容网关接入第三方模型**
- **OpenAI 兼容网关与官方 OAuth / Responses 路径**
- **Gemini 兼容网关与 Google AI Studio / Google Antigravity 路径**
- **GitHub Copilot OAuth**

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

新版 `/login` 不再是一次性输入配置，而是一个长期可维护的 Provider 登录台。当前登录体系可以分为以下几类：

### 1\. API Key 模式

- **适用场景**：Anthropic-compatible、OpenAI-compatible、Google-Vertex-Like 等自定义兼容接口。
- **官方 API Key 线路**：
  - `OpenAI Official Responses API`
  - `Google AI Studio (API key)`
- **特点**：适合服务器、容器、远程终端等纯无头环境，稳定、易排障、易自动化。
- **新版补强**：官方 API Key 线路保存成功后，会自动拉取并写入模型列表，而不是要求用户手工补 `savedModels`。

### 2\. OAuth 模式

当前已支持以下 OAuth 线路：

- `Claude Official`
- `OpenAI OAuth`
- `Google Antigravity (OAuth)`
- `GitHub Copilot OAuth`

**特点：**

- CLI 会自动尝试打开浏览器完成授权。
- 在无法自动回调时，可手动粘贴完整回调 URL，或直接粘贴 `code#state`。
- `GitHub Copilot OAuth` 支持可选的 `GitHub Enterprise domain`，并使用 device flow / browser flow 完成授权。
- `/login -> Google Gemini -> Gemini CLI OAuth` 新建入口已删除，因为这条线路对新账号几乎必然触发封号或严重限流；已保存的 legacy 账号仅保留兼容。

### 3\. Provider 级独立鉴权沙盒

系统现在按 **`Provider + authMode + variant + baseURL`** 维度隔离登录态与模型列表，重点解决以下问题：

- 切换 Provider 后错误沿用上一家的鉴权令牌。
- 同一 Provider 下，不同登录方式的数据被互相覆盖。
- OpenAI / Gemini 官方线路与自定义兼容线路的状态串线。
- 同名模型在多 Provider 并存时难以切换和识别。

### 4\. 已保存账号管理

当本地已有已保存 Provider 时，`/login` 会先进入 `Manage accounts`：

- 展示每个账号的 Provider 名称、Provider 类型与模型数量。
- 支持 `Add new account →` 继续新增账号。
- 支持 `Logout` → `Remove account` 删除某条已保存记录。
- 删除后会自动切换到剩余账号；如果已经没有账号，则回到 Provider 选择入口。

这意味着新版 `/login` 已从“录入参数”升级为“管理账号 + 登录 + 回填模型 + 切换来源”的完整闭环。

-----

## 🧭 Provider 路由与选择指南

当前 `/login` 的选择路径与子菜单逻辑如下，以下描述与当前仓库实现保持一致。

### 1\. `Manage accounts`

如果本地已有已保存账号，进入 `/login` 后会先看到：

- 已保存 Provider 列表
- `Add new account →`
- `Done →`

选择某个账号后，会进入该账号的 `Provider actions` 子菜单。

### 2\. `Provider actions`

已保存账号的操作菜单目前包含：

- `Logout`
- `Back`

其中 `Logout` 会继续进入确认删除页；确认后删除这一条 Provider 配置。

### 3\. `Select provider`

新增账号时，会进入 Provider 根菜单，当前入口为：

- `Claude`
- `OpenAI →`
- `Google Gemini`
- `Antigravity`
- `GitHub Copilot OAuth`
- `Custom →`

其中：

- `Google Gemini` 会直接进入 `Google AI Studio (API key)` 输入页，不再显示 Gemini 子菜单。
- `Antigravity` 对应 Google Antigravity (OAuth)。

### 4\. `OpenAI →` 子菜单

进入 `OpenAI →` 后，可选：

- `Official Responses API`
- `OAuth`
- `← Back`

对应含义：

- **Official Responses API**：官方 API Key 线路，固定 `api.openai.com`，保存 Key 后自动拉取模型列表。
- **OAuth**：官方浏览器授权线路，完成登录后自动写入可用模型列表。

### 5\. `Google Gemini`

选择 `Google Gemini` 后，CLI 会直接进入 `Google AI Studio (API key)` 页面：

- 输入 API Key
- 自动拉取支持 `generateContent` 的模型列表
- 保存后可直接在 `/model` 中切换

> `Gemini CLI OAuth` 新建入口已删除，因为这条线路对新账号几乎必然触发封号或严重限流；已保存的 legacy 账号仅保留兼容，不再推荐新增。

### 6\. `Custom →` 子菜单

进入 `Custom →` 后，可选：

- `Anthropic-Like`
- `OpenAI-Like`
- `Google-Vertex-Like`
- `← Back`

其后续配置逻辑为：

- **Anthropic-Like**：输入 BaseURL、API Key、模型列表。
- **OpenAI-Like**：先选 `chat/completions` 或 `Responses API`，再输入 BaseURL、API Key、模型列表。
- **Google-Vertex-Like**：输入 BaseURL、API Key、模型列表。

### 7\. `Configure official provider` / `Configure custom provider`

在真正保存前，CLI 会根据线路进入不同的分步输入页面：

- `copilotEnterprise`：仅 GitHub Copilot OAuth 使用，用于输入可选 Enterprise 域名。
- `authMode`：仅 OpenAI-Like 使用，用于选择 `chat/completions` 或 `Responses API`。
- `baseURL`
- `apiKey`
- `models`

### 8\. `Ready to start` / `Waiting for login`

当选择 OAuth 线路后，CLI 会：

- 进入 `Ready to start`
- 自动启动浏览器或 device flow
- 在 `Waiting for login` 中等待登录完成
- 必要时允许手动粘贴回调信息

因此，整个 `/login` 已经从旧版的“选 Provider → 输参数”演进为一套多账号、多 Provider、多鉴权方式共存的正式路由系统。

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

### 2026 年 4 月 19 日更新

- 重构 openai-like 兼容端点，使得在`/v1`端点前带有其他端点的模型提供商也可以接入，例如`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`。
- 默认关闭 openai 模型的并行工具调用功能，因为并行工具调用会扰乱上下文缓存和模型理解。可在`/config`中重新打开。

### 2026 年 4 月 18 日更新

- 新增 GitHub Copilot 的 GPT 系列模型缓存支持，补齐这两条 OpenAI-compatible 路径上的缓存命中能力。
- 修复过去缓存只能命中前缀、无法持续扩展的问题；现在多轮工具调用下缓存可继续向后增长，而不再长期卡死在前面一小段前缀。

### 2026 年 4 月 16 日更新

- 对于兼容的模型供应商，加入 API 请求失败后自动重试的功能。
- 在 OpenAI 模型多次进入相同工具调用的情况，设定了自动中止（可以在config中关闭）。
- 在`/config`选项中添加了对 API 重试次数和重复工具调用强制中止次数的设定。

### 2026 年 4 月 13 日更新

- 对照云端 `main`，重写 `/login` 登录文档：补齐 `Manage accounts`、`Provider actions`、`Select provider`、`Provider variant select`、`Configure official provider`、`Configure custom provider`、`Ready to start`、`Waiting for login` 等新版子菜单与状态流转说明。
- 正式加入 `GitHub Copilot OAuth`：支持 `github.com` 与可选 `GitHub Enterprise domain`，登录完成后自动启用并写入 Copilot 模型列表；已实测 `gpt-5-mini`、`claude-haiku-4.5`、`gemini-3-flash-preview`。
- `OpenAI Official Responses API`、`OpenAI OAuth`、`Google AI Studio (API key)`、`Google Antigravity (OAuth)`、`GitHub Copilot OAuth` 现已统一支持模型列表自动回填，登录成功后可直接在 `/model` 中选择。
- 移除 `/login -> Google Gemini -> Gemini CLI OAuth` 新建入口，改为 `Google Gemini` 直达 `Google AI Studio (API key)`；原因是该线路对新账号极易触发封号或限流，已保存 legacy 账号仅保留兼容。
- `/model` 文档同步更新为新版行为：支持读取已保存 Provider 记录，以“模型名 + 账号 / Provider 名称”的形式展示同名模型的不同来源。

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

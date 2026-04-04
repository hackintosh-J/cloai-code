# cloaiCode

<div align="center">

![ClOAI-Code Preview](preview.png)

# cloaiCode

**面向多 Provider 原生接入增强的代码助手 CLI。🚀**

专业、务实、可落地。适合需要稳定接入第三方模型、代理服务与自定义网关的开发环境。🚀

[![Runtime](https://img.shields.io/badge/runtime-Bun%20%2B%20Node-3b82f6)](README.md)
[![Config](https://img.shields.io/badge/config-~%2F.cloai-8b5cf6)](README.md)
[![Providers](https://img.shields.io/badge/providers-Anthropic%20%2F%20OpenAI%20compatible-10b981)](README.md)
[![Status](https://img.shields.io/badge/status-active%20fork-f59e0b)](README.md)

</div>

---

## ✨ 项目简介

`cloaiCode` 是一个面向实际开发场景持续演进的 CLI 分支，重点不是“表面兼容”，而是让**第三方模型接入、代理转发、自定义鉴权与非官方部署环境**真正做到可用、好用、易维护。

它不是外围套壳，也不是单纯通过外部切换器接管模型，而是在原版代码基础上直接扩展原生接入能力。

它适合这些场景：

- 🖥️ 在本地终端中直接使用自定义模型与自定义 Provider
- 🌐 通过 Anthropic 兼容网关或 OpenAI 兼容网关接入模型
- 🔐 在 API Key、OAuth、不同 Provider 鉴权模式之间切换
- 🧱 在无桌面、无图形界面的服务器终端中完成配置与使用
- ⚙️ 希望把配置、登录态、模型选择等行为统一收口到独立目录进行管理

---

## 🎯 这个项目解决了什么问题

很多用户会通过 **CC Switch** 把第三方模型接入到现有工具链中，这种方式当然可行；但本项目更进一步，选择了**原生支持**。

原生支持的价值主要在于：

- ⚡ **更快**：少一层中间切换与转接，路径更短
- 🧭 **更直接**：Provider、鉴权方式、模型选择都在工具内部完成
- 🛠️ **更方便**：不需要依赖额外切换器才能完成基础接入
- 🖥️ **更适合服务器环境**：在没有屏幕的终端、远程 SSH、容器环境里配置更省事
- 🔄 **更容易维护**：配置语义更统一，问题排查更直接

如果你的环境是：

- 云主机
- 跳板机
- 远程开发容器
- 无 GUI 的 Linux / Windows Server 终端

那么这类“原生接入”的体验优势会非常明显。✅

---

## 🚀 相比上游，多了什么

本项目目前重点增强了以下能力：

### 1. 原生 Provider 接入能力

支持在程序内部直接配置和切换不同 Provider，而不是只依赖外部切换层。

### 2. 原生多鉴权模式

针对不同 Provider，可持久化并区分不同鉴权方式，避免“同一个 Provider 但不同 authMode 被错误复用”的问题。

### 3. 自定义模型与模型列表管理

你可以更方便地接入非默认模型、维护模型列表，并在交互过程中直接选择。

### 4. OpenAI 兼容协议支持持续增强

除了 Anthropic 兼容路径，本项目也在持续完善 OpenAI 侧的协议能力与路由能力，包括：

- Chat Completions
- Responses
- OAuth

### 5. 独立配置目录与数据隔离

默认使用 `~/.cloai` 作为配置根目录，避免和其他同类工具的配置、缓存、登录态混用。

---

## ✅ 已验证模型与接入方式

以下模型 / 接入路径已经过实际测试：

### Anthropic API 路径

- `minimax-m2.7-highspeed`

### OpenAI 路径

- `gpt-5.4` via **Chat Completions**
- `gpt-5.4` via **Responses**
- `gpt-5.4` via **OAuth**

这意味着，本项目当前不仅支持“理论可配”，而是这些关键组合已经被实际跑通过。🧪

---

## 🧩 配置目录与数据隔离

本项目默认将用户数据收口到：

- 配置目录：`~/.cloai`
- 全局配置文件：`~/.cloai/.claude.json`

这样做的好处：

- 避免历史登录态互相污染
- 避免不同网关 / Provider 的 endpoint 配置串用
- 避免模型列表、鉴权方式、缓存状态彼此干扰
- 更方便你在不同环境下做独立配置与备份

如果你长期维护多套环境，这种隔离会明显降低排障成本。🧰

---

## 📦 环境要求

在开始前，请确保本机环境满足以下要求：

- `Bun >= 1.3.5`
- `Node.js >= 24`

安装依赖：

```bash
bun install
```

确认 Bun 的可执行目录已经加入当前 shell 的 `PATH`，否则 `bun link` 后 `cloai` 可能只能在特定目录或特定 shell 环境里使用：

```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

可先自检：

```bash
which bun
echo $PATH
```

---

## 🛠️ 安装方式

### 方式一：直接从源码使用

在仓库根目录执行：

```bash
bun install
bun link
```

完成后即可通过全局命令启动：

```bash
cloai
```

当前包名与命令名：

- 包名：`@cloai-code/cli`
- 命令名：`cloai`

如果执行 `cloai` 时提示 `command not found`，通常是 `~/.bun/bin` 没有加入 `PATH`；如果提示找不到 `bun`，则说明入口脚本里的 `#!/usr/bin/env bun` 无法解析到 Bun 可执行文件。

### 方式二：作为 link 包在其他项目中使用

```bash
bun link @cloai-code/cli
```

或在 `package.json` 中引用：

```json
{
  "dependencies": {
    "@cloai-code/cli": "link:@cloai-code/cli"
  }
}
```

---

## ▶️ 启动方式

### 开发模式启动

```bash
bun run dev
```

### 全局命令启动

```bash
cloai
```

### 查看版本

```bash
bun run version
```

---

## 🔐 如何登录 / 配置鉴权

本项目的重点之一，就是让登录与鉴权在实际使用中更灵活。

根据你所使用的 Provider，不同场景通常会用到以下几种方式：

### 1. API Key

适用于：

- Anthropic 兼容服务
- OpenAI 兼容服务
- 各类代理 / 网关 / 第三方模型平台

适合服务器、容器、远程终端等无图形界面的环境。通常也是最稳定、最容易自动化的一种方式。🔑

### 2. OAuth

适用于部分支持 OAuth 的 Provider 或接入路径。

如果你所在环境已经具备相应登录条件，OAuth 可以作为 API Key 之外的另一种可选方案。

### 3. 不同 Provider 的独立鉴权模式

本项目会尽量把 **Provider 与 authMode 的组合关系**做持久化处理，避免：

- 切换 Provider 后沿用错误鉴权方式
- 同 Provider 下不同鉴权模式互相覆盖
- 重新启动后初始选项识别错误

这对于需要经常在多家服务之间来回切换的用户尤其重要。🧠

---

## 🧭 如何选择 Provider

本项目的设计目标之一，就是让 Provider 选择变得更自然、更明确。

实际使用时，你通常会面临三类选择：

### 1. Anthropic 兼容 Provider

适合：

- 自建网关
- 代理服务
- 第三方 Anthropic 兼容平台
- 已验证的 `minimax-m2.7-highspeed` 接入路径

如果你追求稳定、路径简单，Anthropic 兼容模式通常是非常实用的选择。

### 2. OpenAI 兼容 Provider

适合：

- 提供 Chat Completions / Responses 接口的平台
- 需要接入 `gpt-5.4` 等模型的场景
- 需要兼容 OAuth 或 OpenAI 风格协议的场景

### 3. 按鉴权方式区分同一 Provider

对于同一个 Provider，如果同时支持多种鉴权模式，本项目会尽量把它们当作**不同的实际配置路径**来处理，而不是粗暴混成一个状态。

这能明显减少“配置看起来没错，但为什么总是走错登录态”的问题。🔍

---

## 🔄 OpenAI 协议支持说明

本项目并不只是在界面上加一个 Base URL 输入框，而是在持续补足更完整的协议支持能力。

当前重点包括：

- OpenAI Chat Completions 路由
- OpenAI Responses 路由
- 对应模型选择与鉴权处理
- 不同协议路径下的请求转发与行为适配

这也是为什么本项目在多模型接入场景下，比“仅靠外部切换器转接”的方案更进一步。它的目标是把这件事做成工具自身的一等能力，而不是外围补丁。🧱

---

## 📚 推荐使用流程

### 首次使用

```bash
git clone <your-repo-url>
cd cloai-code
bun install
bun link
cloai
```

### 后续更新

```bash
git pull
bun install
bun link
cloai
```

这套流程适合长期用源码方式跟进更新的用户，也方便你快速验证新模型、新 Provider 或新协议能力。

---

## 🖥️ 为什么说它更适合无屏幕终端

对于服务器环境，很多“外部切换器 + 图形登录 + 多层转发”的方案，真正落地时往往会遇到这些问题：

- 需要额外安装和维护切换组件
- 登录流依赖图形界面或较繁琐的人工操作
- 配置文件分散，排障路径长
- 在 SSH / tmux / 容器中切换 Provider 不够直接

本项目强调把这些关键操作尽量放回 CLI 自身完成，因此在以下环境会更友好：

- 远程 Linux 服务器
- Windows Server 终端
- WSL
- Docker / Dev Container
- 纯 SSH 运维工作流

一句话概括：**少一层折腾，就少一层不确定性。** 🧩

---

## ⚠️ 说明

- 本项目是一个持续演进的分支，不代表任何官方立场
- 某些能力已经稳定可用，某些协议与 Provider 适配仍在迭代中
- 如果你需要高度可控的第三方模型接入体验，这个方向会比“尽量复刻默认行为”更有价值

---

## 🙏 致谢

感谢 **doge-code** 项目以及其作者提供的启发与参考。这个方向上的探索非常有价值。

项目地址：

- https://github.com/HELPMEEADICE/doge-code.git

---

## 📌 总结

`cloaiCode` 的核心价值，不是简单“能不能接第三方模型”，而是：

- ✅ 原生支持多 Provider
- ✅ 原生支持多鉴权模式
- ✅ 原生支持更多协议路径
- ✅ 已验证关键模型组合可用
- ✅ 更适合服务器与无屏幕终端环境

如果你希望得到一个**更直接、更灵活、更适合复杂接入环境**的 CLI 方案，这个项目就是为此而生。🔥

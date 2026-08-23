# BOBOCloud Document Preview

BOBOCloud 第二个官方插件。在编辑器工作区内，以只读方式预览常用文档文件。

## 支持格式

| 格式 | 功能 |
| --- | --- |
| Markdown (`.md`, `.markdown`) | 清洗后的预览、源码、大纲 |
| CSV / TSV (`.csv`, `.tsv`) | UTF-8/GB18030 解码、搜索、列排序、虚拟表格 |
| Excel (`.xlsx`, `.xlsm`, `.xltx`) | 工作表切换、搜索、虚拟表格、只读值显示 |
| PDF (`.pdf`) | 翻页、缩放、旋转、文本搜索与选择 |

旧式二进制 `.xls` 不在 1.0.0 的支持范围内。插件不会执行 Excel 公式或宏。

## 安装

推荐从 BOBOCloud Extensions 市场安装 `bobocloud.document-preview`。也可以下载 Release 中的 `.boboplugin` 文件，在 Extensions 视图中选择 **Install .boboplugin package**。

需要 BOBOCloud `2.6.1` 或更高版本及 Plugin API `1.3.0`。

## 隔离模型

“官方”只代表发布来源，不会获得额外权限或绕过沙箱。

- 激活入口运行在无 DOM、无 Node/Electron、无网络的专用 Worker 中。
- 每个预览入口运行在 `sandbox="allow-scripts"` 的不透明源 iframe 中，不含 `allow-same-origin`。
- 插件只声明 `documentViews.register` 和 `documents.read` 两项权限。
- 文件读取句柄绑定当前 IPC 发送方、插件、视图、工作区、文件大小和修改时间；每个分块都会重新校验。
- 插件看不到工作区根路径、绝对文件路径、其他文件、预加载桥、凭据或任意 IPC。
- 关闭标签、切换工作区、禁用插件、撤销权限或文件发生变化后，读取会话立即失效。
- 所有可执行入口和资源都在 schema 2 manifest 中逐项声明，并在每次加载前校验 SHA-256。

## 开发

```powershell
npm install
npm test
npm run verify
```

产物位于 `artifacts/bobocloud.document-preview-1.0.0.boboplugin`，旁边的 `.sha256` 文件用于独立校验。

## English

BOBOCloud's second official plugin provides read-only previews for Markdown, CSV/TSV, XLSX-family workbooks, and PDF files. It includes searchable virtualized tables, sheet navigation, sanitized Markdown rendering, and practical PDF controls.

Official status does not grant a sandbox bypass. The activation Worker and each opaque-origin document iframe receive only the two declared capabilities. A viewer can read the one document explicitly opened by the user through a short-lived, revalidated handle; it cannot enumerate the workspace, access paths, use the network, or reach Electron and host objects.

Legacy binary `.xls` is intentionally unsupported in 1.0.0. Excel formulas and macros are never executed.

## License

MIT. Bundled third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

# scripts/ 说明

这里的脚本是**开发期自查工具**，不是产品的一部分。

## 为什么它们在仓库里

`v12` 交付时，大部分验证逻辑以脚本形式沉淀在这里，供后续排查同类问题时参考。
保留它们是因为：**检查器本身也是需要被审查的代码**——它们写明了每一条断言当初是怎么验的。

## 为什么它们多半跑不起来

多数脚本依赖以下环境，克隆仓库的人不会有：

- **真 Chrome + CDP**：`verify-*.mjs` 里带 `--headless` 的那批，要连本地 Chrome 的调试端口做真实 DOM 检查、截图、点击模拟
- **原始数据目录**：脚本里假设数据在某个固定位置，现在统一改成仓库内 `data/`，但部分脚本仍假设更多中间产物
- **历史快照**：`measure-map*.mjs`、`diff-*.mjs` 这类是比对某两次构建的差异，需要当时那两份产物

**所以：跑不动是预期的，不是坏了。**

## 如果你要改产品

只用这几处：

```
build.mjs          构建入口
core/              内核（events/projection/mastery/qbook/tree/graph…）
ui/                渲染层
peer/              AI 同学语句库
data/              数据（概念树、题包、节点详情）
dist/              构建产物
```

跑构建：

```bash
node build.mjs
```

产物在 `dist/index.html`，直接双击打开即可（数据已内联进 `__SNAP__`，不依赖外部请求）。

## 数据从哪来

`data/` 里的文件是发布快照。换题库时改 `published.json` 的 `path` 指向新文件，路径相对仓库根即可。

也可以用环境变量覆盖数据目录：

```bash
ANYSCHOOL_DATA_DIR=/path/to/your/data node build.mjs
```

# 根因分析报告：Umami CSS Module 构建失败

## 错误现象

访问 Performance 页面时，Runtime Error：
```
Cannot read properties of undefined (reading 'sampleCount')
```

Chunk `5147-a61f79f48a2598e4.js` 中的 CSS Module 变量均为空对象：
```js
var a={};r.r(a);  // Badge.module.css → a.default.badge → undefined
var n={};r.r(n);  // PerformanceCard.module.css → n.default.card → undefined  
var l={};r.r(l);  // Performance.module.css → l.default.sampleCount → undefined
```

## 根本原因

### 问题一：`.module.css` 文件被外部 css-loader v7.1.4 错误处理

**核心冲突链条：**

1. `next.config.ts` 的 webpack filter 本意是删除所有 Next.js 内置 CSS rules，替换为自定义规则
2. **但 filter 有漏洞**——Next.js 将所有 CSS rules 打包在一个 `oneOf` 结构中（无 `test` 属性），**`oneOf` 规则逃过了 filter 的删除**
3. 结果：**Next.js 内部 CSS rules 和 自定义 CSS rules 同时生效**

### 问题二：`oneOf` 规则匹配失败 → `.module.css` 落入自定义规则

Next.js app dir CSS module rule (`blocks/css/index.js`) 使用 `issuerLayer: APP_LAYER_RULE`：
```js
const APP_LAYER_RULE = {
    or: [
        WEBPACK_LAYERS.reactServerComponents,
        WEBPACK_LAYERS.serverSideRendering,
        WEBPACK_LAYERS.appPagesBrowser
    ]
};
```

当 `.module.css` 的 **issuer（导入者）** 不在预期的 app layer 时（例如 Badge 组件被纯客户端组件使用、或 webpack layer 分配出现偏差），该规则不匹配，`oneOf` fall-through，`.module.css` 落入**自定义规则**。

### 问题三：外部 css-loader v7.1.4 默认行为与 Next.js 内部 css-loader 不兼容

**Next.js 内部 css-loader** (`next/dist/build/webpack/loaders/css-loader/src/`) 的默认值：
```js
let modulesOptions = {
    namedExport: false,          // ← CJS 兼容模式
    exportLocalsConvention: 'asIs',
    exportOnlyLocals: false,
    // ...
};
```

**外部 css-loader v7.1.4** (`node_modules/css-loader`) 的默认值（当 `modules` 未显式配置时）：
```js
// auto = true → 对 .module.css 自动启用 CSS Modules
// esModule = true (默认)
// namedExport = needNamedExport || esModule = false || true = true
```

**关键差异：`namedExport: true`**

当外部 css-loader v7.1.4 处理 `.module.css` 时：
- 自动启用 CSS Modules 模式 ✓
- 但使用 `namedExport: true`
- **产出 named ES exports**：`export var sampleCount = 'xxx';`
- **不产出 `default` export**
- 而源代码使用 `import styles from './Perf.module.css'`（期望 default export）
- webpack 编译后：`styles = l.default` → `l.default` 是 `undefined` ✗

### 问题四：MiniCssExtractPlugin 双实例冲突

用户自定义配置创建了一个**新的** `MiniCssExtractPlugin` 实例，而 Next.js 内部也创建了一个。两个实例的文件名不同（`[contenthash:8]` vs `[contenthash]`），导致 CSS 提取行为不可预测。

### 验证数据

- 3 个 CSS 输出文件（4476, 7683, 8039）中 **均没有** `sampleCount`、`.badge`、`.card` 等 CSS module 类名
- Chunk 5147 没有对应的 CSS chunk 文件
- CSS module 变量 `a`、`n`、`l` 的值为 `{}`（仅 `__esModule: true`）

---

## 修复方案

### 方案 A（推荐）：正确删除 Next.js 内置 CSS rules，统一使用自定义规则

```ts
webpack: (config, { isServer, webpack, dev }) => {
    // 需要递归删除 all CSS-related rules（包括 oneOf 内部的）
    function removeCssRules(rules) {
      return rules.filter(rule => {
        if (rule.oneOf) {
          rule.oneOf = removeCssRules(rule.oneOf);
          return rule.oneOf.length > 0;
        }
        // 删除所有 CSS 相关规则
        if (rule.test) {
          const testStr = rule.test.toString();
          if (testStr.includes('.css') || testStr.includes('.module')) {
            return false;
          }
        }
        return true;
      });
    }
    
    config.module.rules = removeCssRules(config.module.rules);

    const cssLoader = dev ? 'style-loader' : MiniCssExtractPlugin.loader;

    if (!dev) {
      // 只创建一个 MiniCssExtractPlugin 实例
      const existingMCEP = config.plugins.find(
        p => p.constructor.name === 'MiniCssExtractPlugin'
      );
      if (!existingMCEP) {
        config.plugins.push(new MiniCssExtractPlugin({
          filename: 'static/css/[name].[contenthash:8].css',
          chunkFilename: 'static/css/[id].[contenthash:8].css',
        }));
      }
    }

    // 对 .module.css 使用正确的 css-loader 配置（namedExport: false）
    config.module.rules.push({
      test: /\.module\.css$/,
      exclude: /node_modules/,
      use: [
        cssLoader,
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1,
            modules: {
              mode: 'local',
              namedExport: false,        // ← 关键：CJS 兼容模式
              exportLocalsConvention: 'asIs',
              exportOnlyLocals: isServer,
            },
          },
        },
        'postcss-loader',
      ],
    });

    // 处理 global CSS（非 .module.css）
    config.module.rules.push({
      test: /\.css$/,
      exclude: [/node_modules/, /\.module\.css$/],
      use: [
        cssLoader,
        { loader: 'css-loader', options: { importLoaders: 1, modules: false } },
        'postcss-loader',
      ],
    });

    // handle @umami/react-zen CSS
    config.module.rules.push({
      test: /node_modules\/@umami\/react-zen.*\.css$/,
      use: [
        cssLoader,
        { loader: 'css-loader', options: { importLoaders: 1, modules: false } },
        'postcss-loader',
      ],
    });

    if (isServer) {
      config.optimization.minimize = true;
    }
    return config;
},
```

### 方案 B（最小改动）：仅修复自定义规则中 css-loader 的 `namedExport` 设置

```ts
// 只需修改自定义规则的 css-loader options
{
  loader: 'css-loader',
  options: {
    importLoaders: 1,
    // 对于 .module.css，必须明确设置 namedExport: false
    // 因为 css-loader v7 的默认 namedExport = esModule = true
    // 而代码用 import X from 导入，需要 default export
    modules: {
      namedExport: false,
    },
  },
}
```

### 方案 C（绕过）：完全避免修改 CSS rules

如果 Tailwind v4 的 `@layer` 语法是唯一需要自定义 CSS 规则的原因，也可以考虑：

1. 不删除 Next.js 内置 CSS rules
2. 只在 `postcss.config` 中配置 Tailwind v4 `@layer` 处理
3. 删除整个 webpack CSS 自定义配置

---

## 关键教训

1. **`css-loader` v7 的默认行为变更**：`namedExport` 默认为 `true`（当 `esModule` 为 `true` 时），这与 Next.js 内部 css-loader 的 `namedExport: false` 默认值不兼容
2. **Next.js `oneOf` 规则结构**：Next.js 将所有 CSS rules 打包在 `oneOf` 中，简单的 `rule.test` filter 无法删除
3. **`issuerLayer` 匹配**：依赖 app layer 的 CSS module rule 可能因为 layer 分配偏差而匹配失败
4. **MiniCssExtractPlugin 双实例**：用户自定义 + Next.js 内置，两个实例冲突

# D1 冷启动问题与 Keepalive 保活方案

## 问题定义

Umami 部署在 Cloudflare Workers + D1 上。D1 底层基于 **Durable Object**（SQLite-backed），空闲 **70~140 秒** 无请求后会被 Cloudflare 回收。下次请求时需冷启动——下载快照、重放 WAL 日志，耗时 **1~10+ 秒**。

冷启动期间，D1 查询**不抛错但返回空结果**。登录路由执行 `getUserByUsername()` 查到 `null`，把合法用户当作"用户名或密码错误"返回 **401**。

### 表现

```
无保活时：
  第 1 次登录: 401 ❌（1~2s，D1 冷启动）
  第 2 次登录: 401 ❌
  第 3 次登录: 200 ✅       ← D1 逐渐恢复
  ...第 8~10 次后稳定

有保活时：
  每次登录: 200 ✅（<1s）   ← D1 始终热着
```

---

## 解决方案：三层防护

```
┌─────────────────────────────────────────────────┐
│               cron-job.org                       │
│             每分钟 GET /api/keepalive             │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  第一层：Keepalive 保活（主动预防）              │
│  /api/keepalive → SELECT FROM alive → D1 不冷却  │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  第二层：25 秒重试窗口（被动兜底）               │
│  登录路由内指数退避，直到 D1 恢复或超时          │
└─────────────────────────────────────────────────┘
```

### 第一层：Keepalive 保活

#### 数据库

创建一张简单的 `alive` 表：

```sql
CREATE TABLE IF NOT EXISTS alive (
  id         INTEGER PRIMARY KEY,
  status     TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO alive (id, status, updated_at)
VALUES (1, 'alive from d1', datetime('now'));
```

#### 查询

```sql
SELECT status, updated_at FROM alive WHERE id = 1;
```

返回数据库中的真实字符串 `"alive from d1"`，确保每次查询都经过 D1 Durable Object，而非被路由层缓存。

#### API 端点

**`GET /api/keepalive`**

```typescript
import { getRawDB } from '@/lib/db';

export async function GET() {
  const start = Date.now();

  try {
    const db = await getRawDB();
    const { results } = await db
      .prepare('SELECT status, updated_at FROM alive WHERE id = 1')
      .all();
    const elapsed = Date.now() - start;
    const row = results?.[0] || {};

    return Response.json({
      status: 'ok',
      d1: 'connected',
      alive: row,
      elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        status: 'error',
        d1: 'disconnected',
        error: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
```

正常响应：

```json
{
  "status": "ok",
  "d1": "connected",
  "alive": {
    "status": "alive from d1",
    "updated_at": "2026-07-12 08:26:10"
  },
  "elapsed": 20,
  "timestamp": "2026-07-12T08:27:21Z"
}
```

热启动时 `elapsed` 稳定在 **20~37ms**。

### 第二层：25 秒重试窗口

登录路由内自带安全网，防止保活失效时直接 401：

| 尝试 | 等待 | 说明 |
|:----|:-----|:------|
| 第 1 次 | 0 | 热启动时直接命中 |
| 第 2 次 | 500ms | |
| 第 3 次 | 1s | |
| 第 4 次 | 2s | |
| 第 5 次 | 3s | 封顶，后续保持 3s |
| ... | 3s | 直到总超时 **25 秒** |

---

## 为什么是 1 分钟

D1 的 Durable Object 在空闲 **70~140 秒**后被回收。cron 间隔必须小于 70 秒才能保证永远不触发回收。

| 间隔 | 是否安全 | 原因 |
|:----|:---------|:-----|
| **1 分钟**（60 秒） | ✅ | 60 < 70，永远不会达到回收阈值 |
| 2 分钟（120 秒） | ❌ | 120 > 70~140，可能刚好落在回收窗口内 |
| 5 分钟（300 秒） | ❌ | 远超回收阈值，DO 一定被回收 |

### 为什么是 60 秒不是 59 秒

Cloudflare Cron Triggers 最小支持 **1 分钟间隔**（`* * * * *`）。cron-job.org 也同样。`60 秒 < 70 秒` 有 10 秒余量，足够安全。

---

## Cron Job 配置

使用 cron-job.org（免费）：

| 字段 | 值 |
|:-----|:----|
| URL | `https://umami.agate.workers.dev/api/keepalive` |
| 间隔 | 每 1 分钟 |
| 方法 | GET |
| 通知 | 失败 1 次后通知 |

---

## 验证结果

### 无保活时（新部署后）

| 轮次 | 成功率 | 说明 |
|:----|:-------|:-----|
| 第 1 轮（完全冷） | 20~50% | D1 深度冷却 |
| 第 2 轮（8 秒后） | 80~90% | 部分预热 |
| 第 3 轮（热） | 100% | 稳定 |

### 有保活时

| 场景 | 成功率 | 延迟 |
|:----|:-------|:-----|
| 即刻测试 | **100%** | 514~2865ms |
| 2 分钟后 | **100%** | 507~2198ms |

所有失败的 401 均由 D1 冷启动导致。保活生效后零失败。

---

## 依赖

| 组件 | 位置 |
|:-----|:-----|
| alive 表 | D1 数据库（`umami-db`），手动创建 |
| keepalive 路由 | `src/app/api/keepalive/route.ts` |
| 登录重试 | `src/app/api/auth/login/route.ts` |
| 外部 cron | cron-job.org `* * * * *` |

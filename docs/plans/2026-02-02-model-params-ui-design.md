# 模型参数动态配置 UI 设计文档

## 概述

在聊天输入框附近添加一个参数配置按钮，点击后展开下拉面板，根据当前选择的模型动态显示其支持的参数（如 `thinking_budget`、`thinking_level`、`web_search` 等）。参数值按模型维度持久化存储。

## 需求

1. **可扩展设计** - 根据当前选择的模型，动态显示该模型支持的所有参数
2. **跟随 Model 存储** - 记住每个模型的上次使用参数，切换模型时自动加载该模型的历史设置
3. **下拉面板交互** - 点击按钮展开一个小面板，显示当前模型的所有可配置参数
4. **参数来源** - 通过 Poe API 获取模型列表时同时获取参数定义

---

## 架构设计

### 第一部分：数据流

```
应用启动 / 进入聊天页面
    ↓
前端调用 Poe API 获取所有模型列表（包含每个模型的 parameters 字段）
    ↓
将模型列表及其 parameters 缓存到本地（React Query 缓存 + localStorage）
    ↓
用户选择模型时，从缓存中读取该模型的 parameters
    ↓
下拉面板根据 parameters 动态渲染控件
    ↓
用户修改参数值 → 保存到 localStorage（按模型 ID 存储）
    ↓
发送消息时，将参数值合并到请求 payload
```

---

### 第二部分：前端 UI 改动

#### 现有布局结构

```
<ChatForm>
  └── 底部按钮行 (gap-2, pb-2)
      ├── [AttachFileChat] 附件按钮
      ├── [BadgeRow] 徽章行 (WebSearch, CodeInterpreter, FileSearch, Artifacts, MCPSelect...)
      ├── <flex spacer>
      ├── [AudioRecorder] 语音录制
      └── [SendButton] 发送按钮
```

#### 新增组件方案

参考现有的 `ToolsDropdown` 和 `Artifacts` 组件模式，在 **BadgeRow** 中新增一个 **ModelParams** 徽章组件：

```
<BadgeRow>
  ├── [ToolsDropdown]
  ├── [WebSearch]
  ├── [CodeInterpreter]
  ├── [FileSearch]
  ├── [Artifacts]
  ├── [MCPSelect]
  └── [ModelParams] ← 新增：模型参数配置
```

#### ModelParams 组件设计

使用与 `Artifacts` 相同的模式：主按钮 + 下拉面板

```tsx
<DropdownPopup
  trigger={<Badge icon={SlidersHorizontal} label="参数" />}
  items={dynamicParamItems}  // 根据当前模型的 parameters 动态生成
/>
```

下拉面板内容根据模型的 `parameters` 字段动态渲染：
- `boolean` → Switch 开关项
- `enum` → 单选菜单项
- `number` → 带滑块的子面板

---

### 第三部分：数据存储

#### 存储方案

与现有模式保持一致：

1. **运行时状态**：使用 Recoil atom（类似 `ephemeralAgentByConvoId`）
2. **持久化**：使用 localStorage，通过 `useLocalStorage` hook
3. **Key 管理**：在 `LocalStorageKeys` 枚举中新增 key

#### 新增的存储 Key

```typescript
// packages/data-provider/src/keys.ts
export enum LocalStorageKeys {
  // ... 现有 keys
  MODEL_PARAMS_PREFIX = 'modelParams:', // 新增
}
```

#### 数据结构

```typescript
// localStorage key: "modelParams:{modelId}"
// 例如: "modelParams:gemini-3-flash"
{
  "thinking_level": "high",
  "web_search": true
}
```

---

### 第四部分：后端 API 改动

#### 现状分析

当前 `/api/models` 接口只返回模型 ID 列表：

```typescript
// packages/api/src/endpoints/models.ts
models = input.data.map((item: { id: string }) => item.id);
// 返回: ["gemini-3-flash", "claude-opus-4.5", ...]
```

Poe API 返回的完整数据（包含 `parameters`）被丢弃了。

#### 改动方案

修改 `/api/models` 接口，增加一个查询参数 `includeParams=true`，当传入时返回完整的模型信息：

```typescript
// GET /api/models?endpoint=custom&name=Poe&includeParams=true

// 返回结构：
{
  "models": ["gemini-3-flash", "claude-opus-4.5", ...],  // 保持兼容
  "modelDetails": {  // 新增字段
    "gemini-3-flash": {
      "parameters": [
        { "name": "thinking_level", "schema": { "enum": ["minimal", "low", "high"] }, "default_value": "low" },
        { "name": "web_search", "schema": { "type": "boolean" }, "default_value": false }
      ]
    },
    "claude-opus-4.5": {
      "parameters": [
        { "name": "thinking_budget", "schema": { "type": "number", "minimum": 0, "maximum": 63999 } }
      ]
    }
  }
}
```

---

### 第五部分：前端组件实现

#### 新增文件

```
client/src/
├── components/Chat/Input/
│   └── ModelParams.tsx          # 主组件：参数配置按钮和下拉面板
├── hooks/
│   └── useModelParams.ts        # Hook：管理模型参数状态
└── Providers/
    └── (修改) BadgeRowContext.tsx  # 添加 modelParams 上下文
```

#### ModelParams.tsx 组件结构

```tsx
// 参考 Artifacts.tsx 的实现模式
<DropdownPopup
  menuId="model-params-menu"
  trigger={
    <Badge
      icon={SlidersHorizontal}
      label={localize('com_ui_model_params')}
    />
  }
  items={paramItems}  // 动态生成
/>
```

#### 参数项渲染逻辑

根据 `schema` 类型动态生成菜单项：

```tsx
function buildParamItems(parameters, values, onChange) {
  return parameters.map(param => {
    const { name, schema, default_value } = param;

    if (schema.type === 'boolean') {
      // 渲染 Switch 开关项
      return {
        label: name,
        render: () => (
          <SwitchItem
            checked={values[name] ?? default_value ?? false}
            onChange={(v) => onChange(name, v)}
          />
        )
      };
    }

    if (schema.enum) {
      // 渲染单选菜单项
      return {
        label: name,
        render: () => (
          <EnumSelector
            options={schema.enum}
            value={values[name] ?? default_value}
            onChange={(v) => onChange(name, v)}
          />
        )
      };
    }

    if (schema.type === 'number') {
      // 渲染滑块子面板
      return {
        label: name,
        render: () => (
          <SliderItem
            min={schema.minimum ?? 0}
            max={schema.maximum ?? 100}
            value={values[name] ?? default_value ?? 0}
            onChange={(v) => onChange(name, v)}
          />
        )
      };
    }
  });
}
```

#### useModelParams Hook

```tsx
function useModelParams(modelId: string, endpointName: string) {
  const storageKey = `modelParams:${modelId}`;
  const [savedValues, setSavedValues] = useLocalStorage(storageKey, {});

  // 从 React Query 缓存获取模型参数定义
  const { data: modelDetails } = useModelsQuery({
    endpoint: endpointName,
    includeParams: true
  });

  const parameters = modelDetails?.modelDetails?.[modelId]?.parameters ?? [];

  const updateParam = (name: string, value: any) => {
    setSavedValues(prev => ({ ...prev, [name]: value }));
  };

  return { parameters, values: savedValues, updateParam };
}
```

---

### 第六部分：参数传递到请求

#### 修改 createPayload

在发送消息时，将用户设置的参数合并到请求中：

```typescript
// packages/data-provider/src/createPayload.ts
export default function createPayload(submission: t.TSubmission) {
  const { conversation, endpointOption, modelParams } = submission;

  const payload: t.TPayload = {
    ...endpointOption,
    // 合并模型参数
    ...(modelParams ?? {}),
    endpoint,
    conversationId,
  };

  return { server, payload };
}
```

#### 后端处理

在 `getOpenAILLMConfig` 中，这些参数会被放入 `modelKwargs`，最终传递给 Poe API：

```typescript
// 已有逻辑会处理未知参数
if (!knownOpenAIParams.has(key)) {
  modelKwargs[key] = value;  // thinking_level, thinking_budget 等会进入这里
}
```

---

## 改动范围总结

| 层级 | 文件 | 改动内容 |
|-----|------|---------|
| 后端 | `packages/api/src/endpoints/models.ts` | 添加 `includeParams` 参数，返回模型详情 |
| 类型 | `packages/data-provider/src/types.ts` | 添加 `ModelDetails` 类型定义 |
| 类型 | `packages/data-provider/src/keys.ts` | 添加 `MODEL_PARAMS_PREFIX` key |
| 前端 | `client/src/components/Chat/Input/ModelParams.tsx` | 新增参数配置组件 |
| 前端 | `client/src/hooks/useModelParams.ts` | 新增参数管理 hook |
| 前端 | `client/src/components/Chat/Input/BadgeRow.tsx` | 集成 ModelParams 组件 |
| 前端 | `client/src/Providers/BadgeRowContext.tsx` | 添加 modelParams 上下文 |
| 前端 | `packages/data-provider/src/createPayload.ts` | 合并模型参数到请求 |

---

## 实现顺序建议

1. 后端：修改 `/api/models` 接口，支持返回模型参数定义
2. 类型：添加相关类型定义
3. 前端 Hook：实现 `useModelParams`
4. 前端组件：实现 `ModelParams.tsx`
5. 集成：将组件添加到 `BadgeRow`
6. 测试：验证参数传递和持久化

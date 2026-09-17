# 渠道额外设置说明

该配置用于设置一些额外的渠道参数，可以通过 JSON 对象进行配置。主要包含以下三个设置项：

1. force_format
    - 用于标识是否对数据进行强制格式化为 OpenAI 格式
    - 类型为布尔值，设置为 true 时启用强制格式化

2. proxy
    - 用于配置网络代理
    - 类型为字符串，支持 `http`、`https`、`socks5` 和 `socks5h` 协议
    - 保存时必须包含协议和主机；仅允许空路径或根路径 `/`，不允许 query 或 fragment
    - SOCKS 代理未填写端口时，运行时使用默认端口 `1080`

3. thinking_to_content
   - 用于标识是否将思考内容`reasoning_content`转换为`<think>`标签拼接到内容中返回
   - 类型为布尔值，设置为 true 时启用思考内容转换

4. normalize_system_messages
    - 将非首位的 `system` 消息按原始顺序合并，并移动到 `messages` 首位
    - 用于兼容要求 system 必须位于开头的上游模型（例如 vLLM + Qwen）
    - 类型为布尔值，设置为 true 时启用；默认关闭，仅对开启该选项的渠道生效
    - 只改 `role == "system"` 的顺序；`user` / `assistant` / `tool` / `function` 相对顺序不变
    - 全部为字符串时用 `\n\n` 拼接；存在 content parts 数组时按 OpenAI 消息内容结构合并

5. normalize_system_messages_models
    - 可选的模型白名单，类型为字符串数组
    - 为空或不设置时，该渠道下所有模型都会规范化
    - 非空时仅当请求的原始模型名或映射后的上游模型名命中列表时才生效
    - 示例：`["qwen3.8-27b-uncensored"]`

--------------------------------------------------------------

## JSON 格式示例

以下是一个示例配置，启用强制格式化并设置了代理地址：

```json
{
    "force_format": true,
    "thinking_to_content": true,
    "normalize_system_messages": true,
    "normalize_system_messages_models": ["qwen3.8-27b-uncensored"],
    "proxy": "socks5://proxy.example:1080"
}
```

--------------------------------------------------------------

通过调整上述 JSON 配置中的值，可以灵活控制渠道的额外行为，比如是否进行格式化以及使用特定的网络代理。

## 升级兼容性

旧版本会忽略代理地址中的 path、query 和 fragment。为避免升级后中断已有渠道流量，运行时会继续剥离这些遗留后缀，并对同一代理地址每个进程记录一次不含凭证和后缀的警告。该兼容逻辑不会改写数据库；再次保存渠道时必须按上述严格规则修正代理地址。

代理连接使用 30 秒 TCP 拨号超时和 30 秒 KeepAlive；TLS 握手超时为 10 秒。这些超时同样适用于未配置渠道代理的中转请求。

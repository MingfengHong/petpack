# 宠物包格式

## 基本目录

```text
my-pet/
├── pet.json
└── spritesheet.webp
```

图集也可以是 PNG。`spritesheetPath` 必须是宠物根目录中的文件名，不能包含目录跳转、盘符或绝对路径。

## Codex v2

- `spriteVersionNumber: 2`；
- 1536×2288 图集；
- 8 列 × 11 行；
- 单元格 192×208；
- 第 0–8 行是标准动作；
- 第 9–10 行是从 000° 到 337.5° 的 16 个顺时针注视方向；
- 待机行第 6 列是 v2 中性/正面注视帧。

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A friendly desktop companion.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

1536×2288 图集如果没有声明版本 2，Studio 会给出警告；导出时会补充必需的 v2 字段。

## Codex / Petdex v1

- 标准图集为 1536×1872；
- 8 列 × 9 行；
- `spriteVersionNumber` 可以省略；
- 包含和 Codex 相同的 9 个标准动作，但没有注视方向行。

部分 Petdex 图集使用非标准尺寸。只要宽度可以被 8 整除、高度可以被 9 整除，PetPack 会按实际单元格尺寸读取，并标记为兼容 9 行格式。

## 标准帧占用

| 行 | 状态 | 使用帧数 |
| --- | --- | ---: |
| 0 | 待机 idle | 6；v2 额外使用第 6 列中性帧 |
| 1 | 向右 running-right | 8 |
| 2 | 向左 running-left | 8 |
| 3 | 挥手 waving | 4 |
| 4 | 跳跃 jumping | 5 |
| 5 | 失落 failed | 8 |
| 6 | 等待 waiting | 6 |
| 7 | 工作 running | 6 |
| 8 | 检查 review | 6 |
| 9–10 | v2 注视方向 | 每行 8 |

所有使用帧必须包含可见像素；标准动作行中没有使用的单元格必须完全透明。

## 接受的输入形态

- 宠物根目录；
- 只包含一个宠物直接子目录的父目录；
- 宠物目录中的 `pet.json` 或 spritesheet；
- 根目录或单一顶层目录中包含一个宠物的 ZIP；
- Petdex slug 或宠物页面地址。

Studio 只暂存清单和清单引用的图集，不会把 QA 资料或其他无关文件复制到桌宠运行包。

## 大小和安全限制

- `pet.json` 最大 256 KiB；
- spritesheet 最大 16 MiB；
- ZIP 必须只解析出一个宠物；
- 拒绝 `..`、绝对路径和 Windows 盘符路径；
- 图集格式仅允许 PNG 或 WebP；
- Petdex 远程图集只允许来自官方资产域。

## 新宠物建议

新制作的宠物应使用 Codex v2 8×11 格式。推荐通过 Codex `hatch-pet` skill 生成和校验，确保标准动作、透明单元格和 16 个注视方向全部满足要求。

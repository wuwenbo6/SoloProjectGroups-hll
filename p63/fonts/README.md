# 自定义字体目录

在此目录中放置您需要的自定义字体文件（.ttf, .otf 等），系统会自动加载这些字体用于文档转换。

## 支持的字体格式
- TrueType (.ttf)
- OpenType (.otf)
- 其他 LibreOffice 支持的字体格式

## 解决中文乱码问题

1. 将中文字体文件复制到此目录
2. 重启服务

## 推荐的中文字体

### 免费中文字体：
- 思源黑体 (Noto Sans CJK)
- 文泉驿微米黑 (WenQuanYi Micro Hei)
- 文泉驿正黑 (WenQuanYi Zen Hei)
- 阿里巴巴普惠体

### 常见系统字体：
- 微软雅黑 (Microsoft YaHei)
- 宋体 (SimSun)
- PingFang (macOS)

## 重启服务

添加字体后需要重启服务才能生效：

```bash
# 停止服务 (Ctrl+C)
# 重新启动
npm start
```

启动后会在日志中看到：

```
Font directories: .../p63/fonts, /System/Library/Fonts, ...
```

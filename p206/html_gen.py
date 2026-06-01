f=open("static/index.html","w")
f.write("""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>EFTPOS ISO 8583 模拟器</title>
<style>
body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
.container { max-width: 1200px; margin: 0 auto; }
h1 { color: #333; text-align: center; }
.panel { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.form-group { margin: 10px 0; }
label { display: inline-block; width: 100px; font-weight: bold; }
input, select { padding: 8px; width: 250px; border: 1px solid #ddd; border-radius: 4px; }
button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 10px 5px; }
button:hover { background: #0056b3; }
.hex-display { background: #000; color: #0f0; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.fields-table { width: 100
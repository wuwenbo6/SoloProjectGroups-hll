import base64, sys

b64 = sys.argv[1]
content = base64.b64decode(b64).decode('utf-8')
with open('/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p206/static/index.html', 'w') as f:
    f.write(content)
print('Done')

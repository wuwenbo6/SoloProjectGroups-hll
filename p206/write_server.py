import base64
code = base64.b64decode(open("server_b64.txt").read())
open("server/server.go", "wb").write(code)
print("OK")

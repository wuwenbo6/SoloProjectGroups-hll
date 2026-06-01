lines = open("main.go").readlines()
new_lines = []
skip_until = -1
for i, line in enumerate(lines):
    if i < skip_until:
        continue
    if "type ParsedField struct {" in line and i == 29:
        skip_until = 36
        continue
    new_lines.append(line)
open("main.go", "w").writelines(new_lines)
print("removed duplicate")

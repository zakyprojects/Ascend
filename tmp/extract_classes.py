import re
import subprocess

with open('src/components/views/PrefrontalCortex.tsx') as f:
    lines = f.readlines()

focus_lines = lines[1089:2145]
classes = set()

for line in focus_lines:
    for m in re.finditer(r'className=(?:"([^"]*)"|{`([^`]*)`}|{\x27([^\x27]*)\x27})', line):
        raw = m.group(1) or m.group(2) or m.group(3) or ''
        raw = re.sub(r'\$\{[^}]+\}', ' ', raw)
        for part in raw.split():
            part = part.strip('?:`"\'{}() ')
            if part and not any(ch in part for ch in ['$', '?', ':', '(', ')']):
                classes.add(part)

print(f"Total unique classes extracted: {len(classes)}")

# Also look for any obvious typos or unusual classes
for c in sorted(classes):
    print(c)

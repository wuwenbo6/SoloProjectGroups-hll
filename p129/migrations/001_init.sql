CREATE TABLE IF NOT EXISTS code_snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_code_snippets_name ON code_snippets(name);
CREATE INDEX IF NOT EXISTS idx_code_snippets_updated_at ON code_snippets(updated_at DESC);

INSERT INTO code_snippets (name, code) VALUES 
('Hello World', '#include <stdio.h>

int main() {
    printf("Hello, World!\n");
    return 0;
}'),
('简单函数', 'int add(int a, int b) {
    return a + b;
}

int main() {
    int result = add(3, 5);
    return result;
}'),
('分支结构', 'int max(int a, int b) {
    if (a > b) {
        return a;
    } else {
        return b;
    }
}

int main() {
    return max(10, 20);
}'),
('循环结构', 'int sum(int n) {
    int total = 0;
    for (int i = 1; i <= n; i++) {
        total += i;
    }
    return total;
}

int main() {
    return sum(10);
}');

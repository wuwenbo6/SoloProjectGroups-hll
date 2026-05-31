package fpga

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestConcurrentLexicalAnalysis(t *testing.T) {
	sourceCode := `
#include <stdio.h>
#include <stdlib.h>

void func1() { printf("func1\n"); }
void func2() { printf("func2\n"); }
void func3() { printf("func3\n"); }
void func4() { printf("func4\n"); }
void func5() { printf("func5\n"); }
void func6() { printf("func6\n"); }
void func7() { printf("func7\n"); }
void func8() { printf("func8\n"); }

int main() {
    int a = 1;
    int b = 2;
    int c = 3;
    int d = 4;
    int e = 5;
    int f = 6;
    int g = 7;
    int h = 8;
    return a + b + c + d + e + f + g + h;
}`

	const numGoroutines = 20
	var wg sync.WaitGroup
	var mu sync.Mutex
	successCount := 0
	errorCount := 0

	startTime := time.Now()

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()

			tokens, timeMs, usedFPGA, err := LexicalAnalysis(sourceCode, true)
			if err != nil {
				mu.Lock()
				errorCount++
				mu.Unlock()
				t.Logf("Goroutine %d: Error: %v", id, err)
				return
			}

			if len(tokens) == 0 {
				mu.Lock()
				errorCount++
				mu.Unlock()
				t.Logf("Goroutine %d: No tokens returned", id)
				return
			}

			mu.Lock()
			successCount++
			mu.Unlock()

			t.Logf("Goroutine %d: %d tokens, %.3f ms, usedFPGA: %v",
				id, len(tokens), timeMs, usedFPGA)
		}(i)
	}

	wg.Wait()
	duration := time.Since(startTime)

	t.Logf("Completed in %v", duration)
	t.Logf("Success: %d, Errors: %d", successCount, errorCount)

	if errorCount > 0 {
		t.Errorf("Expected 0 errors, got %d", errorCount)
	}

	if successCount != numGoroutines {
		t.Errorf("Expected %d successes, got %d", numGoroutines, successCount)
	}

	status := GetPoolStatus()
	t.Logf("Pool status: %+v", status)
}

func TestSmallCodeDetection(t *testing.T) {
	smallCode := `
int main() {
    return 0;
}`

	largeCode := generateLargeCode(100)

	if ShouldUseFPGA(smallCode) {
		t.Error("Small code should NOT use FPGA")
	}

	if !ShouldUseFPGA(largeCode) {
		t.Error("Large code SHOULD use FPGA")
	}

	t.Logf("Small code (%d lines): ShouldUseFPGA=%v",
		strings.Count(smallCode, "\n")+1, ShouldUseFPGA(smallCode))
	t.Logf("Large code (%d lines): ShouldUseFPGA=%v",
		strings.Count(largeCode, "\n")+1, ShouldUseFPGA(largeCode))
}

func generateLargeCode(numFuncs int) string {
	var sb strings.Builder
	sb.WriteString("#include <stdio.h>\n\n")

	for i := 0; i < numFuncs; i++ {
		sb.WriteString(fmt.Sprintf("void func%d() { printf(\"func%d\\n\"); }\n", i, i))
	}

	sb.WriteString("\nint main() {\n")
	sb.WriteString("    int sum = 0;\n")
	for i := 0; i < numFuncs; i++ {
		sb.WriteString(fmt.Sprintf("    sum += %d;\n", i))
	}
	sb.WriteString("    return sum;\n}\n")

	return sb.String()
}

func TestNoDeadlock(t *testing.T) {
	done := make(chan bool, 1)

	go func() {
		var wg sync.WaitGroup
		for i := 0; i < 50; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				source := generateLargeCode(20)
				LexicalAnalysis(source, true)
			}()
		}
		wg.Wait()
		done <- true
	}()

	select {
	case <-done:
		t.Log("No deadlock detected!")
	case <-time.After(10 * time.Second):
		t.Fatal("Test timed out - possible deadlock detected!")
	}
}

func TestFallbackToCPU(t *testing.T) {
	smallCode := `
int main() {
    printf("Hello\n");
    return 0;
}`

	tokens, timeMs, usedFPGA, err := LexicalAnalysis(smallCode, true)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if usedFPGA {
		t.Error("Small code should fall back to CPU, not use FPGA")
	}

	if len(tokens) == 0 {
		t.Error("Should still return tokens when falling back to CPU")
	}

	t.Logf("Small code: %d tokens, %.3f ms, usedFPGA=%v", len(tokens), timeMs, usedFPGA)
}

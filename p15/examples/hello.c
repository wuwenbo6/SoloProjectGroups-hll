#include <stdio.h>

int main() {
    printf("Hello, FPGA Accelerated World!\n");
    
    int sum = 0;
    for (int i = 0; i < 100; i++) {
        sum += i;
    }
    
    printf("Sum from 0 to 99: %d\n", sum);
    return 0;
}

// BRAM溢出测试示例
// 大数组会触发BRAM资源警告

void large_buffer_process(
    int input[1024][1024],
    int output[1024][1024],
    int weight[512][512]
) {
    #pragma HLS INTERFACE m_axi port=input offset=slave bundle=gmem
    #pragma HLS INTERFACE m_axi port=output offset=slave bundle=gmem
    #pragma HLS INTERFACE m_axi port=weight offset=slave bundle=gmem

    int i, j;

    for (i = 0; i < 1024; i++) {
        for (j = 0; j < 1024; j++) {
            #pragma HLS UNROLL factor=4
            output[i][j] = input[i][j] * weight[i % 512][j % 512] + 100;
        }
    }
}

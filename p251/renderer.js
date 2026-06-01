function parseHexAddress(str) {
    if (str.startsWith('0x') || str.startsWith('0X')) {
        return parseInt(str.substring(2), 16);
    }
    return parseInt(str, 16);
}

function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
}

function bytesToHex(bytes) {
    return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function formatHexView(data, startAddress = 0) {
    let result = '';
    const bytesPerLine = 16;
    
    for (let i = 0; i < data.length; i += bytesPerLine) {
        const lineBytes = data.slice(i, i + bytesPerLine);
        const address = (startAddress + i).toString(16).padStart(6, '0').toUpperCase();
        const hexPart = lineBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ').padEnd(47);
        const asciiPart = lineBytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
        
        result += `<span class="hex-address">${address}</span>  <span class="hex-byte">${hexPart}</span>  <span class="hex-ascii">|${asciiPart}|</span>\n`;
    }
    return result;
}

function log(command, result) {
    const output = document.getElementById('output');
    const time = new Date().toLocaleTimeString();
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <div class="log-time">[${time}]</div>
        <div class="log-command">命令: ${command}</div>
        <div class="log-result">结果: ${result}</div>
    `;
    
    output.insertBefore(entry, output.firstChild);
}

async function readJEDECId() {
    try {
        const result = await window.flashAPI.readJEDECId();
        
        document.getElementById('mfr-id').textContent = '0x' + result.manufacturerId.toString(16).toUpperCase();
        document.getElementById('mem-type').textContent = '0x' + result.memoryType.toString(16).toUpperCase();
        document.getElementById('capacity').textContent = result.capacityDesc;
        document.getElementById('mfr-name').textContent = result.manufacturer;
        
        const resultStr = `
制造商ID: 0x${result.manufacturerId.toString(16).toUpperCase()}
内存类型: 0x${result.memoryType.toString(16).toUpperCase()}
容量: 0x${result.capacity.toString(16).toUpperCase()} (${result.capacityDesc})
制造商: ${result.manufacturer}
JEDEC ID: EF 40 18`;
        
        log('读取 JEDEC ID (0x9F)', `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('读取 JEDEC ID', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function readSFDP() {
    try {
        const result = await window.flashAPI.readSFDP();
        
        const headerStr = `
签名: ${result.header.signature}
版本: v${result.header.versionMajor}.${result.header.versionMinor}
参数头数量: ${result.header.numParamHeaders}`;

        let dwordStr = '\nSFDP DWORD 原始数据:\n';
        for (let i = 0; i < result.dwords.length; i++) {
            const val = result.dwords[i] >>> 0;
            dwordStr += `  DWORD[${i.toString().padStart(2, '0')}] = 0x${val.toString(16).padStart(8, '0').toUpperCase()}`;
            if (i < 9) {
                const names = [
                    '  ← 基本Flash参数: 制造商ID/内存类型/密度',
                    '  ← 基本Flash参数: 页大小/扇区类型',
                    '  ← 基本Flash参数: 擦除指令',
                    '  ← 基本Flash参数: 扇区/块擦除指令',
                    '  ← 基本Flash参数: 块擦除大小',
                    '  ← 基本Flash参数: 扇区擦除指令',
                    '  ← 基本Flash参数: 保留',
                    '  ← 基本Flash参数: 保留',
                    '  ← 基本Flash参数: 保留'
                ];
                dwordStr += names[i];
            } else if (i === 9) {
                dwordStr += '  ← 4字节地址模式支持位';
            }
            dwordStr += '\n';
        }

        const p = result.parsed;
        const fourByte = p.fourByteAddressModes;
        let parsedStr = `
SFDP 参数解析:
─────────────────────────────────
制造商ID: 0x${p.jedecManufacturerId.toString(16).toUpperCase()}
内存类型: 0x${p.memoryType.toString(16).toUpperCase()}
密度: 0x${p.density.toString(16).toUpperCase()} (${p.density + 1} bits = ${((p.density + 1) / 8 / 1024 / 1024).toFixed(0)}MB)
页大小: ${p.pageSize} 字节
扇区大小: ${p.sectorSizes.join(', ')} 字节
块擦除大小: ${p.blockEraseSizes.join(', ')} 字节

4字节地址模式指示:
─────────────────────────────────
  进入4字节模式 (0xB7):  ${fourByte.enter0xB7 ? '✓ 支持' : '✗ 不支持'}
  退出4字节模式 (0xE9):  ${fourByte.exit0xE9 ? '✓ 支持' : '✗ 不支持'}
  4字节读 (0x03):        ${fourByte.fourByteRead03 ? '✓ 支持' : '✗ 不支持'}
  4字节快读 (0x0B):      ${fourByte.fourByteRead0B ? '✓ 支持' : '✗ 不支持'}
  4字节快读 (0x0C):      ${fourByte.fourByteRead0C ? '✓ 支持' : '✗ 不支持'}
  4字节页编程 (0x02):    ${fourByte.fourByteProgram02 ? '✓ 支持' : '✗ 不支持'}
  4字节页编程 (0x12):    ${fourByte.fourByteProgram12 ? '✓ 支持' : '✗ 不支持'}
  4字节扇区擦除 (0x21):  ${fourByte.fourByteErase21 ? '✓ 支持' : '✗ 不支持'}
  4字节块擦除 (0xDC):    ${fourByte.fourByteEraseDC ? '✓ 支持' : '✗ 不支持'}`;

        const hexView = formatHexView(result.data);
        
        log('读取 SFDP (0x5A)', `<pre>${headerStr}${dwordStr}${parsedStr}\n\n原始数据:\n${hexView}</pre>`);
    } catch (error) {
        log('读取 SFDP', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function eraseSector() {
    try {
        const addressStr = document.getElementById('erase-address').value;
        const address = parseHexAddress(addressStr);
        
        const result = await window.flashAPI.eraseSector(address);
        
        const resultStr = `
擦除类型: 扇区擦除 (4KB)
起始地址: 0x${result.address.toString(16).padStart(6, '0').toUpperCase()}
擦除大小: ${result.size} 字节 (4KB)`;
        
        log(`扇区擦除 (0x20) @ 0x${address.toString(16).toUpperCase()}`, `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('扇区擦除', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function eraseBlock() {
    try {
        const addressStr = document.getElementById('erase-address').value;
        const address = parseHexAddress(addressStr);
        
        const result = await window.flashAPI.eraseBlock(address);
        
        const resultStr = `
擦除类型: 块擦除 (64KB)
起始地址: 0x${result.address.toString(16).padStart(6, '0').toUpperCase()}
擦除大小: ${result.size} 字节 (64KB)`;
        
        log(`块擦除 (0xD8) @ 0x${address.toString(16).toUpperCase()}`, `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('块擦除', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function eraseChip() {
    try {
        const result = await window.flashAPI.eraseChip();
        
        const resultStr = `
擦除类型: 整片擦除
擦除大小: ${result.size} 字节 (16MB)`;
        
        log('整片擦除 (0xC7)', `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('整片擦除', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function program() {
    try {
        const addressStr = document.getElementById('prog-address').value;
        const dataStr = document.getElementById('prog-data').value;
        const address = parseHexAddress(addressStr);
        const data = hexToBytes(dataStr);
        
        const result = await window.flashAPI.program(address, data);
        
        const hexView = formatHexView(data, address);
        
        let pageOpsStr = '';
        if (result.splitAcrossPages) {
            pageOpsStr = `
⚠ 检测到跨页写入，已自动拆分为 ${result.pageOps.length} 次页编程:

`;
            for (let i = 0; i < result.pageOps.length; i++) {
                const op = result.pageOps[i];
                const pageAligned = (op.address & 0xFF) === 0;
                pageOpsStr += `  [页编程 #${i + 1}]
    起始地址: 0x${op.address.toString(16).padStart(6, '0').toUpperCase()}
    数据长度: ${op.length} 字节
    页内偏移: 0x${(op.address & 0xFF).toString(16).padStart(2, '0').toUpperCase()}
    页对齐:   ${pageAligned ? '是' : '否'}
    到达页边界: ${op.pageBoundary ? '是' : '否'}

`;
            }
        }
        
        const resultStr = `
编程地址: 0x${result.address.toString(16).padStart(6, '0').toUpperCase()}
编程长度: ${result.length} 字节
跨页拆分: ${result.splitAcrossPages ? '是 (' + result.pageOps.length + '次)' : '否'}
${pageOpsStr}
写入数据:
${hexView}`;
        
        const cmdLabel = result.splitAcrossPages 
            ? `页编程 (0x02) @ 0x${address.toString(16).toUpperCase()} [跨页拆分×${result.pageOps.length}]` 
            : `页编程 (0x02) @ 0x${address.toString(16).toUpperCase()}`;
        
        log(cmdLabel, `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('页编程', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function read() {
    try {
        const addressStr = document.getElementById('read-address').value;
        const lengthStr = document.getElementById('read-length').value;
        const address = parseHexAddress(addressStr);
        const length = parseInt(lengthStr, 10);
        
        const result = await window.flashAPI.read(address, length);
        
        const hexView = formatHexView(result.data, result.address);
        
        const resultStr = `
读取地址: 0x${result.address.toString(16).padStart(6, '0').toUpperCase()}
读取长度: ${result.length} 字节

数据:
${hexView}`;
        
        log(`读取数据 (0x03) @ 0x${address.toString(16).toUpperCase()}`, `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('读取数据', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function updateModeDisplay() {
    try {
        const mode = await window.flashAPI.getMode();
        const modeEl = document.getElementById('current-mode');
        const dataWidthEl = document.getElementById('data-width');
        
        modeEl.textContent = mode.currentMode;
        modeEl.className = 'mode-indicator';
        
        if (mode.ddrMode) {
            modeEl.classList.add('mode-ddr');
        } else if (mode.qspiMode) {
            modeEl.classList.add('mode-qspi');
        } else {
            modeEl.classList.add('mode-spi');
        }
        
        const widthDesc = mode.qspiMode ? '4位 (Quad)' : '1位 (SPI)';
        dataWidthEl.textContent = `${mode.dataWidth}${widthDesc}`;
    } catch (error) {
        console.error('Failed to update mode:', error);
    }
}

async function enableQSPI() {
    try {
        const result = await window.flashAPI.enableQSPI();
        await updateModeDisplay();
        log('启用 QSPI', `<pre>模式切换成功\n当前模式: ${result.mode}\n数据宽度: 4位 (Quad I/O)</pre>`);
    } catch (error) {
        log('启用 QSPI', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function disableQSPI() {
    try {
        const result = await window.flashAPI.disableQSPI();
        await updateModeDisplay();
        log('禁用 QSPI', `<pre>模式切换成功\n当前模式: ${result.mode}\n数据宽度: 1位 (SPI)</pre>`);
    } catch (error) {
        log('禁用 QSPI', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function enableDDR() {
    try {
        const result = await window.flashAPI.enableDDR();
        await updateModeDisplay();
        log('启用 DDR', `<pre>双倍数据率模式已启用\n当前模式: ${result.mode}</pre>`);
    } catch (error) {
        log('启用 DDR', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function disableDDR() {
    try {
        const result = await window.flashAPI.disableDDR();
        await updateModeDisplay();
        log('禁用 DDR', `<pre>双倍数据率模式已禁用\n当前模式: ${result.mode}</pre>`);
    } catch (error) {
        log('禁用 DDR', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function fastReadQuad() {
    try {
        const addressStr = document.getElementById('read-address').value;
        const lengthStr = document.getElementById('read-length').value;
        const address = parseHexAddress(addressStr);
        const length = parseInt(lengthStr, 10);
        
        const result = await window.flashAPI.fastReadQuad(address, length);
        
        if (result.error) {
            log('Quad 快读', `<span class="error">错误: ${result.error}</span>`);
            return;
        }
        
        const hexView = formatHexView(result.data, result.address);
        
        const resultStr = `
读取地址: 0x${result.address.toString(16).padStart(6, '0').toUpperCase()}
读取长度: ${result.length} 字节
传输模式: QSPI (4线, 双倍速率如启用)

数据:
${hexView}`;
        
        log(`Quad 快读 (0x6B) @ 0x${address.toString(16).toUpperCase()}`, `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('Quad 快读', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function quadProgram() {
    try {
        const addressStr = document.getElementById('prog-address').value;
        const dataStr = document.getElementById('prog-data').value;
        const address = parseHexAddress(addressStr);
        const data = hexToBytes(dataStr);
        
        const result = await window.flashAPI.quadInputPageProgram(address, data);
        
        if (result.error) {
            log('Quad 编程', `<span class="error">错误: ${result.error}</span>`);
            return;
        }
        
        const hexView = formatHexView(data, address);
        
        let pageOpsStr = '';
        if (result.splitAcrossPages) {
            pageOpsStr = `
⚠ 检测到跨页写入，已自动拆分为 ${result.pageOps.length} 次页编程:

`;
            for (let i = 0; i < result.pageOps.length; i++) {
                const op = result.pageOps[i];
                const pageAligned = (op.address & 0xFF) === 0;
                pageOpsStr += `  [Quad 编程 #${i + 1}]
    起始地址: 0x${op.address.toString(16).padStart(6, '0').toUpperCase()}
    数据长度: ${op.length} 字节
    页内偏移: 0x${(op.address & 0xFF).toString(16).padStart(2, '0').toUpperCase()}
    页对齐:   ${pageAligned ? '是' : '否'}
    到达页边界: ${op.pageBoundary ? '是' : '否'}

`;
            }
        }
        
        const resultStr = `
编程地址: 0x${result.address.toString(16).padStart(6, '0').toUpperCase()}
编程长度: ${result.length} 字节
传输模式: QSPI (4线输入)
跨页拆分: ${result.splitAcrossPages ? '是 (' + result.pageOps.length + '次)' : '否'}
${pageOpsStr}
写入数据:
${hexView}`;
        
        const cmdLabel = result.splitAcrossPages 
            ? `Quad 编程 (0x32) @ 0x${address.toString(16).toUpperCase()} [跨页拆分×${result.pageOps.length}]` 
            : `Quad 编程 (0x32) @ 0x${address.toString(16).toUpperCase()}`;
        
        log(cmdLabel, `<pre>${resultStr}</pre>`);
    } catch (error) {
        log('Quad 编程', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function exportLog() {
    try {
        const logData = await window.flashAPI.getOperationLog();
        
        if (logData.length === 0) {
            log('导出日志', '<pre>日志为空，无可导出内容</pre>');
            return;
        }
        
        let csvContent = 'Timestamp,DateTime,Operation,Mode,Details\n';
        logData.forEach(entry => {
            const details = JSON.stringify(entry).replace(/"/g, '""');
            csvContent += `${entry.timestamp},"${entry.datetime}","${entry.operation}","${entry.mode}","${details}"\n`;
        });
        
        let hexContent = '=== W25Q128 Flash Operation Log ===\n';
        hexContent += `Export Time: ${new Date().toISOString()}\n`;
        hexContent += `Total Operations: ${logData.length}\n\n`;
        
        logData.forEach((entry, idx) => {
            hexContent += `[${idx + 1}] ${entry.datetime} | ${entry.operation.padEnd(15)} | Mode: ${entry.mode.padEnd(10)}\n`;
            if (entry.address !== undefined) {
                hexContent += `      Address: 0x${entry.address.toString(16).padStart(6, '0').toUpperCase()}`;
                if (entry.length !== undefined) {
                    hexContent += ` | Length: ${entry.length} bytes`;
                }
                hexContent += '\n';
            }
            if (entry.size !== undefined) {
                hexContent += `      Size: ${entry.size} bytes (${(entry.size/1024).toFixed(1)}KB)\n`;
            }
            hexContent += '\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `w25q128_log_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        const blobTxt = new Blob([hexContent], { type: 'text/plain' });
        const urlTxt = URL.createObjectURL(blobTxt);
        const aTxt = document.createElement('a');
        aTxt.href = urlTxt;
        aTxt.download = `w25q128_log_${Date.now()}.txt`;
        document.body.appendChild(aTxt);
        aTxt.click();
        document.body.removeChild(aTxt);
        URL.revokeObjectURL(urlTxt);
        
        log('导出日志', `<pre>成功导出 ${logData.length} 条操作记录\n已保存为 CSV 和 TXT 格式</pre>`);
    } catch (error) {
        log('导出日志', `<span class="error">错误: ${error.message}</span>`);
    }
}

async function clearLog() {
    try {
        await window.flashAPI.clearOperationLog();
        document.getElementById('output').innerHTML = '';
        log('清空日志', '<pre>操作日志已清空</pre>');
    } catch (error) {
        log('清空日志', `<span class="error">错误: ${error.message}</span>`);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    readJEDECId();
    updateModeDisplay();
});

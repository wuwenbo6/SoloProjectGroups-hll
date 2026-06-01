import json
import os
import zipfile
import io
from collections import defaultdict


FAMILY_DEFS = {
    'STM32F4': {
        'header': 'stm32f4xx_hal.h',
        'hal_conf': 'stm32f4xx_hal_conf.h',
        'system_header': 'stm32f4xx.h',
        'flash_size': 0x200000,
        'ram_size': 0x20000,
        'cmsis_core': 'core_cm4.h',
        'vectors_irq': 82,
    },
    'STM32F1': {
        'header': 'stm32f1xx_hal.h',
        'hal_conf': 'stm32f1xx_hal_conf.h',
        'system_header': 'stm32f1xx.h',
        'flash_size': 0x100000,
        'ram_size': 0x10000,
        'cmsis_core': 'core_cm3.h',
        'vectors_irq': 60,
    },
    'STM32G4': {
        'header': 'stm32g4xx_hal.h',
        'hal_conf': 'stm32g4xx_hal_conf.h',
        'system_header': 'stm32g4xx.h',
        'flash_size': 0x80000,
        'ram_size': 0x20000,
        'cmsis_core': 'core_cm4.h',
        'vectors_irq': 105,
    },
}


class Pin:
    def __init__(self, pin_name, af, gpio_speed, gpio_pull, gpio_mode, extra_config=None):
        self.pin_name = pin_name
        self.af = af
        self.gpio_speed = gpio_speed
        self.gpio_pull = gpio_pull
        self.gpio_mode = gpio_mode
        self.extra_config = extra_config or {}


class Peripheral:
    def __init__(self, name, periph_type, config):
        self.name = name
        self.periph_type = periph_type
        self.config = config


class ClockConfig:
    def __init__(self, config):
        self.hse_freq = config.get('hse_freq', 8000000)
        self.hsi_freq = config.get('hsi_freq', 16000000)
        self.lse_freq = config.get('lse_freq', 32768)
        self.pll_m = config.get('pll_m', 8)
        self.pll_n = config.get('pll_n', 360)
        self.pll_p = config.get('pll_p', 2)
        self.pll_q = config.get('pll_q', 8)
        self.pll_r = config.get('pll_r', 2)
        self.sysclk_src = config.get('sysclk_src', 'PLL')
        self.ahb_prescaler = config.get('ahb_prescaler', 1)
        self.apb1_prescaler = config.get('apb1_prescaler', 4)
        self.apb2_prescaler = config.get('apb2_prescaler', 2)
        self.hse_bypass = config.get('hse_bypass', False)


class STM32Config:
    def __init__(self, config_data):
        self.family = config_data.get('family', 'STM32F4')
        self.part_number = config_data.get('part_number', 'STM32F407VGT6')
        self.ide = config_data.get('ide', 'Keil')
        self.clock = ClockConfig(config_data.get('clock', {}))
        self.pins = []
        for p in config_data.get('pins', []):
            self.pins.append(Pin(
                pin_name=p.get('name', ''),
                af=p.get('af', 'GPIO_AF0_GPIO'),
                gpio_speed=p.get('speed', 'GPIO_SPEED_FREQ_LOW'),
                gpio_pull=p.get('pull', 'GPIO_NOPULL'),
                gpio_mode=p.get('mode', 'GPIO_MODE_INPUT'),
                extra_config=p.get('extra_config', {}),
            ))
        self.peripherals = []
        for p in config_data.get('peripherals', []):
            self.peripherals.append(Peripheral(
                name=p.get('name', ''),
                periph_type=p.get('type', ''),
                config=p.get('config', {}),
            ))
        self.freertos = config_data.get('freertos', {})
        self.lowpower = config_data.get('lowpower', {})
        self.family_def = FAMILY_DEFS.get(self.family, FAMILY_DEFS['STM32F4'])


def _af_val(af_str):
    try:
        for p in af_str.split('_'):
            if p.startswith('AF') and len(p) > 2:
                return int(p[2:])
        return 0
    except (ValueError, IndexError):
        return 0


def _port_pin(pin_name):
    port = pin_name[1]
    pin_num = pin_name[2:]
    return port, pin_num


class CodeGenerator:
    def __init__(self, config):
        self.config = config
        self.fd = config.family_def

    def generate_all(self):
        files = {}
        files['Src/main.c'] = self._gen_main_c()
        files['Src/system_stm32xx.c'] = self._gen_system_c()
        files['Inc/main.h'] = self._gen_main_h()
        files['Inc/stm32xx_hal_conf.h'] = self._gen_hal_conf()
        files['Makefile'] = self._gen_makefile()
        if self.config.ide == 'Keil':
            files['Project.uvprojx'] = self._gen_keil_project()
        elif self.config.ide == 'IAR':
            files['Project.ewp'] = self._gen_iar_project()

        if self.config.freertos.get('enable', False):
            files['Inc/FreeRTOSConfig.h'] = self._gen_freertos_config()
            files['Src/freertos.c'] = self._gen_freertos_tasks()
            if self.config.freertos.get('kernel', 'CMSIS_V2') == 'CMSIS_V2':
                files['Inc/cmsis_os.h'] = self._gen_cmsis_os_h()
                files['Src/cmsis_os.c'] = self._gen_cmsis_os_c()

        if self.config.lowpower.get('mode', 'none') != 'none':
            files['Src/lowpower.c'] = self._gen_lowpower()

        files['Project.ioc'] = self._gen_cubemx_ioc()
        files['README.txt'] = self._gen_readme()
        return files

    def _gen_main_c(self):
        lines = []
        lines.append('#include "main.h"')
        lines.append('')

        periph_types = set(p.periph_type for p in self.config.peripherals)

        for pt in periph_types:
            if pt == 'USART':
                lines.append('UART_HandleTypeDef huart;')
            elif pt == 'I2C':
                lines.append('I2C_HandleTypeDef hi2c;')
            elif pt == 'SPI':
                lines.append('SPI_HandleTypeDef hspi;')

        lines.append('')
        lines.append('static void SystemClock_Config(void);')
        lines.append('static void GPIO_Init(void);')

        for periph in self.config.peripherals:
            lines.append(f'static void {periph.name}_Init(void);')

        lines.append('')
        lines.append('int main(void)')
        lines.append('{')
        lines.append('  HAL_Init();')
        lines.append('  SystemClock_Config();')
        lines.append('  GPIO_Init();')

        for periph in self.config.peripherals:
            lines.append(f'  {periph.name}_Init();')

        lines.append('')
        lines.append('  while (1)')
        lines.append('  {')
        lines.append('  }')
        lines.append('}')
        lines.append('')

        lines.extend(self._gen_sysclk_config())
        lines.append('')
        lines.extend(self._gen_gpio_init())
        lines.append('')

        for periph in self.config.peripherals:
            lines.extend(self._gen_periph_init(periph))
            lines.append('')

        return '\n'.join(lines)

    def _gen_main_h(self):
        hdr = self.fd['header']
        lines = []
        lines.append('#ifndef __MAIN_H')
        lines.append('#define __MAIN_H')
        lines.append('')
        lines.append(f'#include "{hdr}"')
        lines.append('')

        for periph in self.config.peripherals:
            if periph.periph_type == 'USART':
                name = periph.name.upper()
                baud = periph.config.get('baudrate', 115200)
                wl = periph.config.get('word_length', 'UART_WORDLENGTH_8B')
                sb = periph.config.get('stop_bits', 'UART_STOPBITS_1')
                par = periph.config.get('parity', 'UART_PARITY_NONE')
                lines.append(f'#define {name}_BAUDRATE              {baud}')
                lines.append(f'#define {name}_WORD_LENGTH           {wl}')
                lines.append(f'#define {name}_STOP_BITS             {sb}')
                lines.append(f'#define {name}_PARITY                {par}')
                lines.append(f'#define {name}_HWFLOWCTL             UART_HWCONTROL_NONE')
                lines.append(f'#define {name}_MODE                  UART_MODE_TX_RX')
                lines.append('')
            elif periph.periph_type == 'I2C':
                name = periph.name.upper()
                timing = periph.config.get('timing', 0x30E0638A)
                addr = periph.config.get('own_address', 0)
                lines.append(f'#define {name}_TIMING                0x{timing:08X}')
                lines.append(f'#define {name}_OWN_ADDRESS           {addr}')
                lines.append(f'#define {name}_ADDRESSING_MODE       I2C_ADDRESSINGMODE_7BIT')
                lines.append(f'#define {name}_DUAL_ADDRESS_MODE     I2C_DUALADDRESS_DISABLE')
                lines.append(f'#define {name}_GENERAL_CALL_MODE     I2C_GENERALCALL_DISABLE')
                lines.append(f'#define {name}_NO_STRETCH_MODE       I2C_NOSTRETCH_DISABLE')
                lines.append('')
            elif periph.periph_type == 'SPI':
                name = periph.name.upper()
                clk = periph.config.get('clk_polarity', 'SPI_POLARITY_LOW')
                cpha = periph.config.get('clk_phase', 'SPI_PHASE_1EDGE')
                br = periph.config.get('baudrate_prescaler', 'SPI_BAUDRATEPRESCALER_16')
                lines.append(f'#define {name}_CLK_POLARITY          {clk}')
                lines.append(f'#define {name}_CLK_PHASE             {cpha}')
                lines.append(f'#define {name}_BAUDRATE_PRESCALER    {br}')
                lines.append(f'#define {name}_FIRST_BIT             SPI_FIRSTBIT_MSB')
                lines.append(f'#define {name}_TI_MODE               SPI_TIMODE_DISABLE')
                lines.append(f'#define {name}_CRC_CALCULATION       SPI_CRCCALCULATION_DISABLE')
                lines.append(f'#define {name}_NSS                   SPI_NSS_SOFT')
                lines.append('')

        for pin in self.config.pins:
            port, pin_num = _port_pin(pin.pin_name)
            lines.append(f'#define {pin.pin_name}_Pin             GPIO_PIN_{pin_num}')
            lines.append(f'#define {pin.pin_name}_GPIO_Port       GPIO{port}')
            lines.append('')

        lines.append('void Error_Handler(void);')
        lines.append('')
        lines.append('#endif /* __MAIN_H */')
        return '\n'.join(lines)

    def _gen_hal_conf(self):
        hdr = self.fd['hal_conf']
        lines = []
        lines.append(f'#ifndef __{hdr.upper().replace(".", "_").replace("X", "X")}')
        lines.append(f'#define __{hdr.upper().replace(".", "_").replace("X", "X")}')
        lines.append('')

        periph_types = set(p.periph_type for p in self.config.peripherals)

        modules = ['GPIO', 'RCC', 'PWR', 'CORTEX']
        if 'USART' in periph_types:
            modules.append('UART')
            modules.append('USART')
        if 'I2C' in periph_types:
            modules.append('I2C')
        if 'SPI' in periph_types:
            modules.append('SPI')

        for mod in modules:
            lines.append(f'#define HAL_{mod}_MODULE_ENABLED')
        lines.append('')
        lines.append('#include "stm32xx_hal.h"')
        lines.append('')
        lines.append('#define  USE_RTOS         0')
        lines.append('#define  PREFETCH_ENABLE  1')
        lines.append('#define  INSTRUCTION_CACHE_ENABLE  1')
        lines.append('#define  DATA_CACHE_ENABLE         1')
        lines.append('')
        lines.append('#define  HSE_VALUE    ((uint32_t)%d)' % self.config.clock.hse_freq)
        lines.append('#define  HSI_VALUE    ((uint32_t)%d)' % self.config.clock.hsi_freq)
        lines.append('#define  LSE_VALUE    ((uint32_t)%d)' % self.config.clock.lse_freq)
        lines.append('')
        lines.append('#define  VDD_VALUE                    3300')
        lines.append('#define  TICK_INT_PRIORITY            0x0F')
        lines.append('')

        lines.append('#ifdef HAL_UART_MODULE_ENABLED')
        lines.append(' #define USE_HAL_UART_REGISTER_CALLBACKS         0')
        lines.append('#endif')
        lines.append('')

        lines.append('#ifdef HAL_I2C_MODULE_ENABLED')
        lines.append(' #define USE_HAL_I2C_REGISTER_CALLBACKS         0')
        lines.append('#endif')
        lines.append('')

        lines.append('#ifdef HAL_SPI_MODULE_ENABLED')
        lines.append(' #define USE_HAL_SPI_REGISTER_CALLBACKS         0')
        lines.append('#endif')
        lines.append('')

        lines.append('void assert_failed(uint8_t *file, uint32_t line);')
        lines.append('')
        lines.append(f'#endif /* __{hdr.upper().replace(".", "_").replace("X", "X")} */')
        return '\n'.join(lines)

    def _gen_sysclk_config(self):
        c = self.config.clock
        lines = []
        lines.append('static void SystemClock_Config(void)')
        lines.append('{')
        lines.append('  RCC_OscInitTypeDef RCC_OscInitStruct = {0};')
        lines.append('  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};')
        lines.append('')

        lines.append('  __HAL_RCC_PWR_CLK_ENABLE();')
        lines.append('  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);')
        lines.append('')

        lines.append('  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;')
        lines.append(f'  RCC_OscInitStruct.HSEState = RCC_HSE_{"BYPASS" if c.hse_bypass else "ON"};')
        lines.append(f'  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;')
        lines.append('  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;')
        lines.append(f'  RCC_OscInitStruct.PLL.PLLM = {c.pll_m};')
        lines.append(f'  RCC_OscInitStruct.PLL.PLLN = {c.pll_n};')
        lines.append(f'  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV{c.pll_p};')
        lines.append(f'  RCC_OscInitStruct.PLL.PLLQ = {c.pll_q};')
        lines.append(f'  RCC_OscInitStruct.PLL.PLLR = {c.pll_r};')
        lines.append('  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)')
        lines.append('  {')
        lines.append('    Error_Handler();')
        lines.append('  }')
        lines.append('')

        lines.append(f'  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK')
        lines.append('                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;')
        lines.append('  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;')
        lines.append(f'  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV{c.ahb_prescaler};')
        lines.append(f'  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV{c.apb1_prescaler};')
        lines.append(f'  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV{c.apb2_prescaler};')
        lines.append('')
        lines.append('  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_5) != HAL_OK)')
        lines.append('  {')
        lines.append('    Error_Handler();')
        lines.append('  }')
        lines.append('}')
        return '\n'.join(lines)

    def _gen_gpio_init(self):
        port_pins = defaultdict(list)
        for pin in self.config.pins:
            port, _ = _port_pin(pin.pin_name)
            port_pins[port].append(pin)

        lines = []
        lines.append('static void GPIO_Init(void)')
        lines.append('{')
        lines.append('  GPIO_InitTypeDef GPIO_InitStruct = {0};')
        lines.append('')

        for port, pins in sorted(port_pins.items()):
            lines.append(f'  __HAL_RCC_GPIO{port}_CLK_ENABLE();')

        lines.append('')

        for port, pins in sorted(port_pins.items()):
            for pin in pins:
                _, pin_num = _port_pin(pin.pin_name)
                mode = pin.gpio_mode
                pull = pin.gpio_pull
                speed = pin.gpio_speed
                af_val = _af_val(pin.af)

                lines.append(f'  /*Configure GPIO pin : {pin.pin_name}_Pin */')
                lines.append(f'  GPIO_InitStruct.Pin = GPIO_PIN_{pin_num};')
                lines.append(f'  GPIO_InitStruct.Mode = {mode};')
                lines.append(f'  GPIO_InitStruct.Pull = {pull};')
                lines.append(f'  GPIO_InitStruct.Speed = {speed};')
                if 'AF' in mode:
                    lines.append(f'  GPIO_InitStruct.Alternate = GPIO_AF{af_val};')
                lines.append(f'  HAL_GPIO_Init(GPIO{port}, &GPIO_InitStruct);')
                lines.append('')

        lines.append('}')
        return '\n'.join(lines)

    def _gen_periph_init(self, periph):
        lines = []
        t = periph.periph_type
        if t == 'USART':
            lines = self._gen_usart_init(periph)
        elif t == 'I2C':
            lines = self._gen_i2c_init(periph)
        elif t == 'SPI':
            lines = self._gen_spi_init(periph)
        return lines

    def _gen_usart_init(self, periph):
        name = periph.name
        inst = periph.config.get('instance', 'USART1')
        lines = []
        lines.append(f'static void {name}_Init(void)')
        lines.append('{')
        lines.append(f'  huart.Instance = {inst};')
        lines.append(f'  huart.Init.BaudRate = {periph.config.get("baudrate", 115200)};')
        lines.append(f'  huart.Init.WordLength = {periph.config.get("word_length", "UART_WORDLENGTH_8B")};')
        lines.append(f'  huart.Init.StopBits = {periph.config.get("stop_bits", "UART_STOPBITS_1")};')
        lines.append(f'  huart.Init.Parity = {periph.config.get("parity", "UART_PARITY_NONE")};')
        lines.append(f'  huart.Init.Mode = UART_MODE_TX_RX;')
        lines.append(f'  huart.Init.HwFlowCtl = UART_HWCONTROL_NONE;')
        lines.append(f'  huart.Init.OverSampling = UART_OVERSAMPLING_16;')
        lines.append(f'  if (HAL_UART_Init(&huart) != HAL_OK)')
        lines.append('  {')
        lines.append('    Error_Handler();')
        lines.append('  }')
        lines.append('}')
        return lines

    def _gen_i2c_init(self, periph):
        name = periph.name
        inst = periph.config.get('instance', 'I2C1')
        lines = []
        lines.append(f'static void {name}_Init(void)')
        lines.append('{')
        lines.append(f'  hi2c.Instance = {inst};')
        lines.append(f'  hi2c.Init.Timing = 0x{periph.config.get("timing", 0x30E0638A):08X};')
        lines.append(f'  hi2c.Init.OwnAddress1 = {periph.config.get("own_address", 0)};')
        lines.append(f'  hi2c.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;')
        lines.append(f'  hi2c.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;')
        lines.append(f'  hi2c.Init.OwnAddress2 = 0;')
        lines.append(f'  hi2c.Init.OwnAddress2Masks = I2C_OA2_NOMASK;')
        lines.append(f'  hi2c.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;')
        lines.append(f'  hi2c.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;')
        lines.append(f'  if (HAL_I2C_Init(&hi2c) != HAL_OK)')
        lines.append('  {')
        lines.append('    Error_Handler();')
        lines.append('  }')
        lines.append(f'  if (HAL_I2CEx_ConfigAnalogFilter(&hi2c, I2C_ANALOGFILTER_ENABLE) != HAL_OK)')
        lines.append('  {')
        lines.append('    Error_Handler();')
        lines.append('  }')
        lines.append(f'  if (HAL_I2CEx_ConfigDigitalFilter(&hi2c, 0) != HAL_OK)')
        lines.append('  {')
        lines.append('    Error_Handler();')
        lines.append('  }')
        lines.append('}')
        return lines

    def _gen_spi_init(self, periph):
        name = periph.name
        inst = periph.config.get('instance', 'SPI1')
        lines = []
        lines.append(f'static void {name}_Init(void)')
        lines.append('{')
        lines.append(f'  hspi.Instance = {inst};')
        lines.append(f'  hspi.Init.Mode = SPI_MODE_MASTER;')
        lines.append(f'  hspi.Init.Direction = SPI_DIRECTION_2LINES;')
        lines.append(f'  hspi.Init.DataSize = SPI_DATASIZE_8BIT;')
        lines.append(f'  hspi.Init.CLKPolarity = {periph.config.get("clk_polarity", "SPI_POLARITY_LOW")};')
        lines.append(f'  hspi.Init.CLKPhase = {periph.config.get("clk_phase", "SPI_PHASE_1EDGE")};')
        lines.append(f'  hspi.Init.NSS = SPI_NSS_SOFT;')
        lines.append(f'  hspi.Init.BaudRatePrescaler = {periph.config.get("baudrate_prescaler", "SPI_BAUDRATEPRESCALER_16")};')
        lines.append(f'  hspi.Init.FirstBit = SPI_FIRSTBIT_MSB;')
        lines.append(f'  hspi.Init.TIMode = SPI_TIMODE_DISABLE;')
        lines.append(f'  hspi.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;')
        lines.append(f'  hspi.Init.CRCPolynomial = 10;')
        lines.append(f'  if (HAL_SPI_Init(&hspi) != HAL_OK)')
        lines.append('  {')
        lines.append('    Error_Handler();')
        lines.append('  }')
        lines.append('}')
        return lines

    def _gen_system_c(self):
        part = self.config.part_number
        family = self.config.family
        sys_hdr = self.fd['system_header']
        cmsis = self.fd['cmsis_core']
        irq_count = self.fd['vectors_irq']

        lines = []
        lines.append('/**')
        lines.append(f' * @file    system_{family.lower()}.c')
        lines.append(f' * @brief   CMSIS Cortex-M Device Peripheral Access Layer System Source File')
        lines.append(f' * @author  Generated by STM32 Config Tool')
        lines.append(' */')
        lines.append('')
        lines.append(f'#include "{sys_hdr}"')
        lines.append('')
        lines.append(f'  /* ToDo: Add include of core_{cmsis.split("_")[-1].split(".")[0]} header */')
        lines.append(f'#include "{cmsis}"')
        lines.append('')
        lines.append(f'uint32_t SystemCoreClock = {self._sysclk_freq()};')
        lines.append('')
        lines.append('__I uint8_t AHBPrescTable[16] = {0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 6, 7, 8, 9};')
        lines.append('')
        lines.append('void SystemInit(void)')
        lines.append('{')
        lines.append('  #if (__FPU_PRESENT == 1) && (__FPU_USED == 1)')
        lines.append('    SCB->CPACR |= ((3UL << 10*2)|(3UL << 11*2));')
        lines.append('  #endif')
        lines.append('  #ifdef DATA_IN_ExtSRAM')
        lines.append('    SystemInit_ExtMemCtl();')
        lines.append('  #endif /* DATA_IN_ExtSRAM */')
        lines.append('  #ifdef VECT_TAB_SRAM')
        lines.append('    SCB->VTOR = SRAM_BASE | VECT_TAB_OFFSET;')
        lines.append('  #else')
        lines.append('    SCB->VTOR = FLASH_BASE | VECT_TAB_OFFSET;')
        lines.append('  #endif')
        lines.append('}')
        lines.append('')
        lines.append('void SystemCoreClockUpdate(void)')
        lines.append('{')
        lines.append('  uint32_t tmp = 0, pllvco = 0, pllp = 2, pllsource = 0, pllm = 2;')
        lines.append('  tmp = RCC->CFGR & RCC_CFGR_SWS;')
        lines.append('  switch (tmp)')
        lines.append('  {')
        lines.append('    case 0x00:  SystemCoreClock = HSI_VALUE; break;')
        lines.append('    case 0x04:  SystemCoreClock = HSE_VALUE; break;')
        lines.append('    case 0x08:  pllp = (((RCC->PLLCFGR & RCC_PLLCFGR_PLLP) >>16) + 1 ) *2;')
        lines.append('              pllm = RCC->PLLCFGR & RCC_PLLCFGR_PLLM;')
        lines.append('              pllsource = (RCC->PLLCFGR & RCC_PLLCFGR_PLLSRC) >> 22;')
        lines.append('              pllvco = (pllsource ? HSE_VALUE : HSI_VALUE) / pllm * ((RCC->PLLCFGR & RCC_PLLCFGR_PLLN) >> 6);')
        lines.append('              SystemCoreClock = pllvco / pllp; break;')
        lines.append('    default:    SystemCoreClock = HSI_VALUE; break;')
        lines.append('  }')
        lines.append('  tmp = AHBPrescTable[((RCC->CFGR & RCC_CFGR_HPRE) >> 4)];')
        lines.append('  SystemCoreClock >>= tmp;')
        lines.append('}')
        return '\n'.join(lines)

    def _sysclk_freq(self):
        c = self.config.clock
        vco = c.hse_freq / c.pll_m * c.pll_n
        return int(vco / c.pll_p)

    def _gen_makefile(self):
        family = self.config.family.lower()
        part = self.config.part_number
        lines = []
        lines.append('CC = arm-none-eabi-gcc')
        lines.append('OBJCOPY = arm-none-eabi-objcopy')
        lines.append('SIZE = arm-none-eabi-size')
        lines.append('')
        lines.append(f'TARGET = {part.lower()}_project')
        lines.append('BUILD_DIR = build')
        lines.append('')
        lines.append('C_SOURCES = \\\\')
        lines.append('  Src/main.c \\\\')
        lines.append(f'  Src/system_{family}.c \\\\')
        lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_gpio.c \\\\')
        lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_rcc.c \\\\')
        lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_cortex.c \\\\')
        lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_pwr.c \\\\')
        lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal.c')

        for pt in set(p.periph_type for p in self.config.peripherals):
            if pt == 'USART':
                lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_uart.c \\\\')
                lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_usart.c \\\\')
            elif pt == 'I2C':
                lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_i2c.c \\\\')
            elif pt == 'SPI':
                lines.append('  Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_spi.c \\\\')

        lines.append('')
        lines.append(f'C_INCLUDES =  \\\\')
        lines.append('  -IInc \\\\')
        lines.append('  -IDrivers/STM32F4xx_HAL_Driver/Inc \\\\')
        lines.append('  -IDrivers/STM32F4xx_HAL_Driver/Inc/Legacy \\\\')
        lines.append('  -IDrivers/CMSIS/Device/ST/STM32F4xx/Include \\\\')
        lines.append('  -IDrivers/CMSIS/Include')
        lines.append('')
        lines.append('CFLAGS = -mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard -DUSE_HAL_DRIVER')
        lines.append('LDFLAGS = -Wl,--gc-sections -specs=nano.specs -lc -lm -lnosys -TSTM32F407VGTx_FLASH.ld')
        lines.append('')
        lines.append('all: $(BUILD_DIR)/$(TARGET).elf $(BUILD_DIR)/$(TARGET).bin')
        lines.append('')
        lines.append('$(BUILD_DIR)/$(TARGET).elf: $(C_SOURCES)')
        lines.append('\t@mkdir -p $(BUILD_DIR)')
        lines.append('\t$(CC) $(CFLAGS) $(C_INCLUDES) $^ -o $@ $(LDFLAGS)')
        lines.append('')
        lines.append('$(BUILD_DIR)/$(TARGET).bin: $(BUILD_DIR)/$(TARGET).elf')
        lines.append('\t$(OBJCOPY) -O binary $< $@')
        lines.append('\t$(SIZE) $<')
        lines.append('')
        lines.append('.PHONY: clean')
        lines.append('clean:')
        lines.append('\t-rm -fR $(BUILD_DIR)')
        return '\n'.join(lines)

    def _gen_keil_project(self):
        part = self.config.part_number
        family = self.config.family
        lines = []
        lines.append('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>')
        lines.append('<Project xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="project_projx.xsd">')
        lines.append('  <Targets>')
        lines.append('    <Target>')
        lines.append(f'      <TargetName>{part}</TargetName>')
        lines.append('      <ToolsetNumber>0x0</ToolsetNumber>')
        lines.append('      <pCCARM>')
        lines.append('        <interw>1</interw>')
        lines.append('        <Define>STM32F407xx,USE_HAL_DRIVER</Define>')
        lines.append('        <IncludePath>./Inc;./Drivers/STM32F4xx_HAL_Driver/Inc;./Drivers/CMSIS/Device/ST/STM32F4xx/Include;./Drivers/CMSIS/Include</IncludePath>')
        lines.append('      </pCCARM>')
        lines.append('      <pAARM>')
        lines.append('        <interw>1</interw>')
        lines.append('      </pAARM>')
        lines.append('      <pLinker>')
        lines.append('        <ScatterFile>./STM32F407VGTx_FLASH.sct</ScatterFile>')
        lines.append('        <IncludeLibs>')
        lines.append('          <include>./Drivers/STM32F4xx_HAL_Driver/Lib/STM32F4xx_HAL_Driver.lib</include>')
        lines.append('        </IncludeLibs>')
        lines.append('      </pLinker>')
        lines.append('      <OutputDirectory>./Objects/</OutputDirectory>')
        lines.append('      <OutputName>Project</OutputName>')
        lines.append('      <CreateExecutable>1</CreateExecutable>')
        lines.append('      <CreateHexFile>3</CreateHexFile>')
        lines.append('      <ListingDirectory>./Listings/</ListingDirectory>')
        lines.append('      <Cads>')
        lines.append('        <interw>1</interw>')
        lines.append('        <Define>STM32F407xx,USE_HAL_DRIVER</Define>')
        lines.append('        <IncludePath>./Inc;./Drivers/STM32F4xx_HAL_Driver/Inc;./Drivers/CMSIS/Device/ST/STM32F4xx/Include;./Drivers/CMSIS/Include</IncludePath>')
        lines.append('      </Cads>')
        lines.append('      <Aads>')
        lines.append('        <interw>1</interw>')
        lines.append('      </Aads>')
        lines.append('    </Target>')
        lines.append('  </Targets>')
        lines.append('  <Files>')
        lines.append('    <File>')
        lines.append('      <FileName>main.c</FileName>')
        lines.append('      <FileType>1</FileType>')
        lines.append('      <FilePath>./Src/main.c</FilePath>')
        lines.append('    </File>')
        lines.append('    <File>')
        lines.append(f'      <FileName>system_{family.lower()}.c</FileName>')
        lines.append('      <FileType>1</FileType>')
        lines.append(f'      <FilePath>./Src/system_{family.lower()}.c</FilePath>')
        lines.append('    </File>')
        lines.append('  </Files>')
        lines.append('  <OutDir>./Objects/</OutDir>')
        lines.append('  <ListingPath>./Listings/</ListingPath>')
        lines.append('  <HexFormatSelection>1</HexFormatSelection>')
        lines.append('  <BinFormatSelection>1</BinFormatSelection>')
        lines.append('  <MifFormatSelection>1</MifFormatSelection>')
        lines.append('</Project>')
        return '\n'.join(lines)

    def _gen_iar_project(self):
        part = self.config.part_number
        family = self.config.family
        lines = []
        lines.append('<?xml version="1.0" encoding="ISO-8859-1"?>')
        lines.append('<project>')
        lines.append('  <fileVersion>3</fileVersion>')
        lines.append('  <configuration>')
        lines.append('    <name>Debug</name>')
        lines.append('    <toolchain>')
        lines.append('      <name>ARM</name>')
        lines.append('    </toolchain>')
        lines.append('    <debug>')
        lines.append('      <simulator>0</simulator>')
        lines.append('    </debug>')
        lines.append('    <settings>')
        lines.append('      <name>General</name>')
        lines.append('      <state>$PROJ_DIR$</state>')
        lines.append('    </settings>')
        lines.append('    <settings>')
        lines.append('      <name>IlinkIcfFile</name>')
        lines.append('      <state>$PROJ_DIR$/STM32F407VGTx_FLASH.icf</state>')
        lines.append('    </settings>')
        lines.append('    <settings>')
        lines.append('      <name>CCIncludePath2</name>')
        lines.append('      <state>$PROJ_DIR$/Inc</state>')
        lines.append('      <state>$PROJ_DIR$/Drivers/STM32F4xx_HAL_Driver/Inc</state>')
        lines.append('      <state>$PROJ_DIR$/Drivers/CMSIS/Device/ST/STM32F4xx/Include</state>')
        lines.append('      <state>$PROJ_DIR$/Drivers/CMSIS/Include</state>')
        lines.append('    </settings>')
        lines.append('    <settings>')
        lines.append('      <name>CCDefines</name>')
        lines.append('      <state>STM32F407xx</state>')
        lines.append('      <state>USE_HAL_DRIVER</state>')
        lines.append('    </settings>')
        lines.append('  </configuration>')
        lines.append('  <group>')
        lines.append('    <name>Src</name>')
        lines.append('    <file>')
        lines.append('      <name>$PROJ_DIR$/Src/main.c</name>')
        lines.append('    </file>')
        lines.append('    <file>')
        lines.append(f'      <name>$PROJ_DIR$/Src/system_{family.lower()}.c</name>')
        lines.append('    </file>')
        lines.append('  </group>')
        lines.append('</project>')
        return '\n'.join(lines)

    def _gen_readme(self):
        part = self.config.part_number
        family = self.config.family
        ide = self.config.ide
        lines = []
        lines.append(f'STM32 {part} Project (HAL Library)')
        lines.append('=' * 40)
        lines.append('')
        lines.append(f'IDE: {ide}')
        lines.append(f'Family: {family}')
        lines.append('')
        lines.append('Generated Peripherals:')
        for p in self.config.peripherals:
            lines.append(f'  - {p.name} ({p.periph_type})')
        lines.append('')
        lines.append('Configuration Pins:')
        for pin in self.config.pins:
            lines.append(f'  - {pin.pin_name}: {pin.af}')
        lines.append('')
        lines.append('Build Instructions (Keil):')
        lines.append('  1. Open Project.uvprojx in Keil MDK-ARM')
        lines.append('  2. Add HAL library source files to the project')
        lines.append('  3. Build')
        lines.append('')
        lines.append('Build Instructions (IAR):')
        lines.append('  1. Open Project.ewp in IAR Embedded Workbench')
        lines.append('  2. Add HAL library source files to the project')
        lines.append('  3. Build')
        lines.append('')
        lines.append('Build Instructions (Makefile):')
        lines.append('  1. Install ARM GCC toolchain')
        lines.append('  2. make')
        lines.append('')
        return '\n'.join(lines)


def create_project_zip(config_data):
    config = STM32Config(config_data)
    generator = CodeGenerator(config)
    files = generator.generate_all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            zf.writestr(path, content)
    buf.seek(0)
    return buf.getvalue()

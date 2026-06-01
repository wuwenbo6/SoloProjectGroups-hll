import io
import zipfile
import os
from typing import Dict


class KeilProjectPacker:
    def __init__(self):
        self.template_files = {}

    def generate_keil_project(self, ladder_code: str) -> bytes:
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('Src/ladder_logic.c', ladder_code)
            zf.writestr('Inc/ladder_logic.h', self._generate_header_file())
            zf.writestr('Src/main.c', self._generate_main_c())
            zf.writestr('Src/gpio.c', self._generate_gpio_c())
            zf.writestr('Inc/gpio.h', self._generate_gpio_h())
            zf.writestr('Src/tim.c', self._generate_tim_c())
            zf.writestr('Inc/tim.h', self._generate_tim_h())
            zf.writestr('Inc/stm32f1xx_hal_conf.h', self._generate_hal_conf())
            zf.writestr('Project.uvprojx', self._generate_uvprojx())
            zf.writestr('README.md', self._generate_readme())
            zf.writestr('.gitignore', self._generate_gitignore())
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()

    def _generate_header_file(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : ladder_logic.h
 * @brief          : Ladder Logic Header File
 ******************************************************************************
 */

#ifndef __LADDER_LOGIC_H
#define __LADDER_LOGIC_H

#ifdef __cplusplus
extern "C" {
#endif

#include "main.h"

/* TYPE DEFINITIONS ***********************************************************/
typedef struct {
    uint8_t  enable;
    uint32_t preset;
    uint32_t current;
    uint32_t start_time;
    uint8_t  done;
    uint8_t  q;
} Timer_t;

typedef struct {
    uint8_t  cu;
    uint8_t  cd;
    uint8_t  reset;
    uint32_t preset;
    uint32_t current;
    uint8_t  done;
    uint8_t  q;
} Counter_t;

/* FUNCTION DECLARATIONS ******************************************************/
void     LadderLogic_Init(void);
void     LadderLogic_Scan(void);

#ifdef __cplusplus
}
#endif

#endif /* __LADDER_LOGIC_H */
'''

    def _generate_main_c(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : main.c
 * @brief          : Main program body
 ******************************************************************************
 */

#include "main.h"
#include "gpio.h"
#include "tim.h"
#include "ladder_logic.h"

void SystemClock_Config(void);

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_TIM2_Init();
    
    LadderLogic_Init();
    
    while (1)
    {
        LadderLogic_Scan();
        HAL_Delay(1);
    }
}

void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    RCC_OscInitStruct.HSEState = RCC_HSE_ON;
    RCC_OscInitStruct.HSEPredivValue = RCC_HSE_PREDIV_DIV1;
    RCC_OscInitStruct.HSIState = RCC_HSI_ON;
    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL9;
    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
    {
        Error_Handler();
    }

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                                  |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
    RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
    RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

    if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
    {
        Error_Handler();
    }
}

void Error_Handler(void)
{
    __disable_irq();
    while (1)
    {
    }
}

#ifdef  USE_FULL_ASSERT
void assert_failed(uint8_t *file, uint32_t line)
{
}
#endif
'''

    def _generate_gpio_c(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : gpio.c
 * @brief          : GPIO Configuration
 ******************************************************************************
 */

#include "gpio.h"

void MX_GPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();

    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_3
                          |GPIO_PIN_4|GPIO_PIN_5|GPIO_PIN_6|GPIO_PIN_7
                          |GPIO_PIN_8|GPIO_PIN_9|GPIO_PIN_10|GPIO_PIN_11
                          |GPIO_PIN_12|GPIO_PIN_15, GPIO_PIN_RESET);

    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_3
                          |GPIO_PIN_4|GPIO_PIN_5|GPIO_PIN_6|GPIO_PIN_7
                          |GPIO_PIN_8|GPIO_PIN_9|GPIO_PIN_10|GPIO_PIN_11
                          |GPIO_PIN_12|GPIO_PIN_13|GPIO_PIN_14|GPIO_PIN_15, GPIO_PIN_RESET);

    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_13, GPIO_PIN_RESET);

    GPIO_InitStruct.Pin = GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_3
                         |GPIO_PIN_4|GPIO_PIN_5|GPIO_PIN_6|GPIO_PIN_7;
    GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = GPIO_PIN_8|GPIO_PIN_9|GPIO_PIN_10|GPIO_PIN_11
                         |GPIO_PIN_12|GPIO_PIN_15;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = GPIO_PIN_All;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = GPIO_PIN_13;
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);
}
'''

    def _generate_gpio_h(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : gpio.h
 * @brief          : GPIO Header
 ******************************************************************************
 */

#ifndef __GPIO_H
#define __GPIO_H

#ifdef __cplusplus
extern "C" {
#endif

#include "main.h"

void MX_GPIO_Init(void);

#ifdef __cplusplus
}
#endif

#endif
'''

    def _generate_tim_c(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : tim.c
 * @brief          : TIM Configuration
 ******************************************************************************
 */

#include "tim.h"

TIM_HandleTypeDef htim2;

void MX_TIM2_Init(void)
{
    TIM_ClockConfigTypeDef sClockSourceConfig = {0};
    TIM_MasterConfigTypeDef sMasterConfig = {0};

    htim2.Instance = TIM2;
    htim2.Init.Prescaler = 7199;
    htim2.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim2.Init.Period = 9999;
    htim2.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    if (HAL_TIM_Base_Init(&htim2) != HAL_OK)
    {
        Error_Handler();
    }
    sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
    if (HAL_TIM_ConfigClockSource(&htim2, &sClockSourceConfig) != HAL_OK)
    {
        Error_Handler();
    }
    sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
    sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
    if (HAL_TIMEx_MasterConfigSynchronization(&htim2, &sMasterConfig) != HAL_OK)
    {
        Error_Handler();
    }
}

void HAL_TIM_Base_MspInit(TIM_HandleTypeDef* tim_baseHandle)
{
    if(tim_baseHandle->Instance==TIM2)
    {
        __HAL_RCC_TIM2_CLK_ENABLE();
    }
}

void HAL_TIM_Base_MspDeInit(TIM_HandleTypeDef* tim_baseHandle)
{
    if(tim_baseHandle->Instance==TIM2)
    {
        __HAL_RCC_TIM2_CLK_DISABLE();
    }
}
'''

    def _generate_tim_h(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : tim.h
 * @brief          : TIM Header
 ******************************************************************************
 */

#ifndef __TIM_H
#define __TIM_H

#ifdef __cplusplus
extern "C" {
#endif

#include "main.h"

extern TIM_HandleTypeDef htim2;

void MX_TIM2_Init(void);

#ifdef __cplusplus
}
#endif

#endif
'''

    def _generate_hal_conf(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : stm32f1xx_hal_conf.h
 * @brief          : HAL Configuration file
 ******************************************************************************
 */

#ifndef __STM32F1xx_HAL_CONF_H
#define __STM32F1xx_HAL_CONF_H

#ifdef __cplusplus
extern "C" {
#endif

#define HAL_MODULE_ENABLED
#define HAL_GPIO_MODULE_ENABLED
#define HAL_TIM_MODULE_ENABLED
#define HAL_RCC_MODULE_ENABLED
#define HAL_FLASH_MODULE_ENABLED
#define HAL_PWR_MODULE_ENABLED
#define HAL_CORTEX_MODULE_ENABLED

#include "stm32f1xx_hal_rcc.h"
#include "stm32f1xx_hal_gpio.h"
#include "stm32f1xx_hal_tim.h"
#include "stm32f1xx_hal_pwr.h"
#include "stm32f1xx_hal_flash.h"
#include "stm32f1xx_hal_cortex.h"

#if !defined  (HSE_VALUE)
#define HSE_VALUE    8000000U
#endif

#if !defined  (HSI_VALUE)
#define HSI_VALUE    8000000U
#endif

#define  TICK_INT_PRIORITY            0x00U

#define assert_param(expr) ((void)0U)

#ifdef __cplusplus
}
#endif

#endif
'''

    def _generate_uvprojx(self) -> str:
        return '''<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<Project xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="project_proj.xsd">

  <SchemaVersion>1.0</SchemaVersion>

  <Header>
    <Target>STM32F103C8</Target>
    <Toolchain>
      <ToolchainName>ARMCC</ToolchainName>
      <ToolchainVersion>5.06 update 7 (build 960)</ToolchainVersion>
    </Toolchain>
  </Header>

  <Targets>
    <Target>
      <TargetName>STM32_Ladder_Project</TargetName>
      <ToolsetNumber>0x4</ToolsetNumber>
      <ToolsetName>ARM-ADS</ToolsetName>
      <TargetOption>
        <TargetCommonOption>
          <Device>STM32F103C8</Device>
          <Vendor>STMicroelectronics</Vendor>
          <Cpu>IRAM(0x20000000,0x5000) IROM(0x08000000,0x10000) CPUTYPE("Cortex-M3") CLOCK(8000000) ELITTLE</Cpu>
          <FlashUtilSpec></FlashUtilSpec>
          <StartupFile></StartupFile>
          <FlashDriverDll></FlashDriverDll>
          <DeviceId>0</DeviceId>
          <RegisterFile></RegisterFile>
          <MemoryEnv></MemoryEnv>
          <Manufacturer>STMicroelectronics</Manufacturer>
          <ManufacturerId>72</ManufacturerId>
          <ChipVersion></ChipVersion>
          <DialogId>999</DialogId>
          <RegisterEnv></RegisterEnv>
          <Cmp></Cmp>
          <Asm></Asm>
          <Linker></Linker>
          <OHString></OHString>
          <InfinionOptionDll></InfinionOptionDll>
          <SLE66CMisc></SLE66CMisc>
          <SLE66AMisc></SLE66AMisc>
          <SLE66ARMisc></SLE66ARMisc>
          <M4OptionDll></M4OptionDll>
          <M4Misc0></M4Misc0>
          <M4Misc1></M4Misc1>
          <M4Misc2></M4Misc2>
          <M4Start></M4Start>
          <M4End></M4End>
          <M4HeapAdd></M4HeapAdd>
          <M4StackAdd></M4StackAdd>
          <M4Freq></M4Freq>
          <M4DLL0></M4DLL0>
          <M4DLL1></M4DLL1>
          <M4DLL2></M4DLL2>
          <M4DLL3></M4DLL3>
          <M4Res></M4Res>
          <isTCSBoard>0</isTCSBoard>
        </TargetCommonOption>
        <CommonProperty>
          <UseCPPCompiler>0</UseCPPCompiler>
          <RVCTCodeConst>0</RVCTCodeConst>
          <RVCTZI>0</RVCTZI>
          <RVCTOtherData>0</RVCTOtherData>
          <ModuleSelection>0</ModuleSelection>
          <IncludeInBuild>1</IncludeInBuild>
          <AlwaysBuild>0</AlwaysBuild>
          <GenerateBatchFile>0</GenerateBatchFile>
        </CommonProperty>
        <DllOption>
          <CpuDll></CpuDll>
          <CpuDllArguments></CpuDllArguments>
          <PeripheralDll></PeripheralDll>
          <PeripheralDllArguments></PeripheralDllArguments>
          <InitializationFile></InitializationFile>
          <DriverDll></DriverDll>
          <DriverDllArguments></DriverDllArguments>
        </DllOption>
        <DebugOption>
          <SimDlls>
            <CpuDll>SARMCM3.DLL</CpuDll>
            <CpuDllArguments>-MPU</CpuDllArguments>
            <PeripheralDll>CM3.DLL</PeripheralDll>
            <PeripheralDllArguments>-REMAP</PeripheralDllArguments>
            <UpdateRootClock0>72000000</UpdateRootClock0>
          </SimDlls>
          <TargetDlls>
            <CpuDll>SARMCM3.DLL</CpuDll>
            <CpuDllArguments>-MPU</CpuDllArguments>
            <PeripheralDll>CM3.DLL</PeripheralDll>
            <PeripheralDllArguments>-REMAP</PeripheralDllArguments>
            <Application>DLL\\STLink\\ST-LINKIII-KEIL_SWO.dll</Application>
            <ApplicationArguments></ApplicationArguments>
            <UpdateRootClock0>72000000</UpdateRootClock0>
          </TargetDlls>
        </DebugOption>
        <Utilities>
          <Flash1>
            <useTarget>1</useTarget>
            <driver>STMicroelectronics ST-LINK USB-JTAG/SWD driver (ST-LINKIII-KEIL_SWO.dll)</driver>
          </Flash1>
        </Utilities>
      </TargetOption>
      <Groups>
        <Group>
          <GroupName>Application/User</GroupName>
          <Files>
            <File>
              <FileName>main.c</FileName>
              <FileType>1</FileType>
              <FilePath>.\Src\main.c</FilePath>
            </File>
            <File>
              <FileName>ladder_logic.c</FileName>
              <FileType>1</FileType>
              <FilePath>.\Src\ladder_logic.c</FilePath>
            </File>
          </Files>
        </Group>
        <Group>
          <GroupName>Drivers</GroupName>
          <Files>
            <File>
              <FileName>gpio.c</FileName>
              <FileType>1</FileType>
              <FilePath>.\Src\gpio.c</FilePath>
            </File>
            <File>
              <FileName>tim.c</FileName>
              <FileType>1</FileType>
              <FilePath>.\Src\tim.c</FilePath>
            </File>
          </Files>
        </Group>
      </Groups>
    </Target>
  </Targets>
</Project>
'''

    def _generate_readme(self) -> str:
        return '''# STM32 梯形图工程

这是一个由梯形图编辑器自动生成的 STM32 Keil 工程。

## 工程说明

- 目标芯片: STM32F103C8
- 开发环境: Keil uVision5
- HAL库版本: STM32 HAL

## 目录结构

```
├── Inc/
│   ├── ladder_logic.h    # 梯形逻辑头文件
│   ├── gpio.h            # GPIO配置头文件
│   ├── tim.h             # 定时器配置头文件
│   └── main.h            # 主头文件
├── Src/
│   ├── ladder_logic.c    # 自动生成的梯形逻辑代码
│   ├── main.c            # 主程序
│   ├── gpio.c            # GPIO配置
│   └── tim.c             # 定时器配置
└── Project.uvprojx       # Keil 工程文件
```

## 使用方法

1. 使用 Keil uVision5 打开 Project.uvprojx
2. 编译工程
3. 下载到 STM32F103C8 开发板
4. 运行程序

## 硬件连接

### 输入引脚 (GPIOA)
- PA0-PA7: 数字输入

### 输出引脚
- PA8-PA15: 数字输出
- PB0-PB15: 数字输出
- PC13: 板载LED

## 注意事项

1. 本工程使用 72MHz 系统时钟
2. 梯形逻辑扫描周期约为 1ms
3. 定时器使用 SysTick 作为时基
'''

    def _generate_gitignore(self) -> str:
        return '''# Keil project files
*.uvguix
*.uvoptx
*.uvprojx.user
*.uvguix.*

# Build directories
build/
obj/
lst/
*.bin
*.hex
*.elf
*.axf

# Temporary files
*.tmp
*.log
*.bak
*.swp
*~

# OS files
.DS_Store
Thumbs.db
'''

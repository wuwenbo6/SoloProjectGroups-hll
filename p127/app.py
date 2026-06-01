from flask import Flask, render_template, request, jsonify, send_file
import io
from code_generator import create_project_zip

app = Flask(__name__)

PIN_TABLE = {
    'PA0': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH1_ETR', 'GPIO_AF2_TIM5_CH1', 'GPIO_AF3_TIM8_ETR', 'GPIO_AF7_USART2_CTS', 'GPIO_AF8_USART4_CTS'],
    'PA1': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH2', 'GPIO_AF2_TIM5_CH2', 'GPIO_AF3_TIM8_CH1N', 'GPIO_AF7_USART2_RTS', 'GPIO_AF8_USART4_RTS'],
    'PA2': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH3', 'GPIO_AF2_TIM5_CH3', 'GPIO_AF3_TIM8_CH1', 'GPIO_AF7_USART2_TX', 'GPIO_AF8_USART4_TX'],
    'PA3': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH4', 'GPIO_AF2_TIM5_CH4', 'GPIO_AF3_TIM8_CH2', 'GPIO_AF7_USART2_RX', 'GPIO_AF8_USART4_RX'],
    'PA4': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_ETR', 'GPIO_AF2_TIM5_CH1', 'GPIO_AF4_I2C3_SCL', 'GPIO_AF5_SPI1_NSS', 'GPIO_AF6_SPI3_NSS', 'GPIO_AF7_USART2_CK'],
    'PA5': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH1', 'GPIO_AF4_I2C3_SDA', 'GPIO_AF5_SPI1_SCK'],
    'PA6': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH2', 'GPIO_AF2_TIM3_CH1', 'GPIO_AF3_TIM8_BKIN', 'GPIO_AF4_I2C3_SMBA', 'GPIO_AF5_SPI1_MISO'],
    'PA7': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH2', 'GPIO_AF2_TIM3_CH2', 'GPIO_AF3_TIM8_CH1N', 'GPIO_AF5_SPI1_MOSI', 'GPIO_AF6_TIM8_CH1N'],
    'PA8': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART1_CK', 'GPIO_AF2_TIM1_CH1', 'GPIO_AF3_TIM8_CH1', 'GPIO_AF4_I2C3_SCL', 'GPIO_AF7_USART1_CK'],
    'PA9': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART1_TX', 'GPIO_AF2_TIM1_CH2', 'GPIO_AF3_TIM8_CH2', 'GPIO_AF4_I2C3_SDA', 'GPIO_AF7_USART1_TX'],
    'PA10': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART1_RX', 'GPIO_AF2_TIM1_CH3', 'GPIO_AF3_TIM8_CH3', 'GPIO_AF4_I2C3_SMBA', 'GPIO_AF7_USART1_RX'],
    'PA11': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH4', 'GPIO_AF3_TIM8_CH4', 'GPIO_AF4_CAN1_RX', 'GPIO_AF6_TIM1_CH4', 'GPIO_AF7_USART1_CTS', 'GPIO_AF10_OTG_FS_DM'],
    'PA12': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_ETR', 'GPIO_AF3_TIM8_ETR', 'GPIO_AF4_CAN1_TX', 'GPIO_AF6_TIM1_ETR', 'GPIO_AF7_USART1_RTS', 'GPIO_AF10_OTG_FS_DP'],
    'PA13': ['GPIO_AF0_MCO', 'GPIO_AF1_TIM1_CH3', 'GPIO_AF4_CAN1_RX', 'GPIO_AF7_JTMS-SWDIO'],
    'PA14': ['GPIO_AF0_MCO', 'GPIO_AF1_USART1_TX', 'GPIO_AF7_JTCK-SWCLK'],
    'PA15': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART1_RX', 'GPIO_AF2_TIM2_CH1_ETR', 'GPIO_AF3_TIM8_CH1', 'GPIO_AF5_SPI3_NSS', 'GPIO_AF7_JTDI'],
    'PB0': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH3', 'GPIO_AF2_TIM3_CH3', 'GPIO_AF3_TIM8_CH2N', 'GPIO_AF4_I2C1_SCL', 'GPIO_AF5_SPI1_SCK'],
    'PB1': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH2', 'GPIO_AF2_TIM3_CH4', 'GPIO_AF3_TIM8_CH3N', 'GPIO_AF5_SPI1_MISO'],
    'PB2': ['GPIO_AF0_GPIO', 'GPIO_AF2_TIM8_BKIN'],
    'PB3': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH2', 'GPIO_AF2_TIM2_CH1_ETR', 'GPIO_AF4_I2C2_SMBA', 'GPIO_AF5_SPI1_SCK', 'GPIO_AF6_I2C2_SCL', 'GPIO_AF7_USART1_RX'],
    'PB4': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM3_CH1', 'GPIO_AF2_TIM3_CH1', 'GPIO_AF4_I2C3_SMBA', 'GPIO_AF5_SPI1_MISO', 'GPIO_AF6_I2C2_SDA', 'GPIO_AF7_USART1_TX'],
    'PB5': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM3_CH2', 'GPIO_AF2_TIM3_CH2', 'GPIO_AF4_I2C1_SMBA', 'GPIO_AF5_SPI1_MOSI', 'GPIO_AF6_I2C1_SDA', 'GPIO_AF8_CAN2_RX'],
    'PB6': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH1', 'GPIO_AF2_TIM4_CH1', 'GPIO_AF4_I2C1_SCL', 'GPIO_AF5_USART1_TX', 'GPIO_AF7_USART1_TX', 'GPIO_AF8_CAN2_RX'],
    'PB7': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH2', 'GPIO_AF2_TIM4_CH2', 'GPIO_AF4_I2C1_SDA', 'GPIO_AF5_USART1_RX', 'GPIO_AF7_USART1_RX', 'GPIO_AF8_CAN2_TX'],
    'PB8': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH3', 'GPIO_AF2_TIM4_CH3', 'GPIO_AF4_I2C1_SCL', 'GPIO_AF7_USART3_RX', 'GPIO_AF9_CAN1_RX', 'GPIO_AF10_OTG_FS_ID'],
    'PB9': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH4', 'GPIO_AF2_TIM4_CH4', 'GPIO_AF4_I2C1_SDA', 'GPIO_AF7_USART3_TX', 'GPIO_AF9_CAN1_TX'],
    'PB10': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH3', 'GPIO_AF2_TIM2_CH3', 'GPIO_AF4_I2C2_SCL', 'GPIO_AF7_USART3_TX', 'GPIO_AF9_CAN2_RX'],
    'PB11': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM2_CH4', 'GPIO_AF2_TIM2_CH4', 'GPIO_AF4_I2C2_SDA', 'GPIO_AF7_USART3_RX', 'GPIO_AF9_CAN2_TX'],
    'PB12': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_BKIN', 'GPIO_AF2_TIM2_CH3', 'GPIO_AF3_TIM8_BKIN', 'GPIO_AF4_I2C3_SMBA', 'GPIO_AF5_SPI2_NSS', 'GPIO_AF7_USART3_CK'],
    'PB13': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH1N', 'GPIO_AF2_TIM2_CH4', 'GPIO_AF3_TIM8_CH1N', 'GPIO_AF5_SPI2_SCK', 'GPIO_AF7_USART3_CTS'],
    'PB14': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH2N', 'GPIO_AF2_TIM2_CH2', 'GPIO_AF3_TIM8_CH2N', 'GPIO_AF5_SPI2_MISO', 'GPIO_AF7_USART3_RTS'],
    'PB15': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH3N', 'GPIO_AF2_TIM2_CH1', 'GPIO_AF3_TIM8_CH3N', 'GPIO_AF5_SPI2_MOSI', 'GPIO_AF9_TIM8_CH3N'],
    'PC0': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH1', 'GPIO_AF2_TIM2_CH1', 'GPIO_AF3_TIM8_CH3', 'GPIO_AF4_I2S2_MCK'],
    'PC1': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH2', 'GPIO_AF2_TIM2_CH2', 'GPIO_AF3_TIM8_CH4', 'GPIO_AF4_I2S3_MCK'],
    'PC2': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH3', 'GPIO_AF2_TIM2_CH2', 'GPIO_AF3_TIM8_CH1', 'GPIO_AF4_I2S2_MCK', 'GPIO_AF5_SPI2_MISO'],
    'PC3': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH4', 'GPIO_AF2_TIM2_CH1', 'GPIO_AF3_TIM8_CH2', 'GPIO_AF4_I2S3_MCK', 'GPIO_AF5_SPI2_MOSI'],
    'PC4': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH1', 'GPIO_AF3_TIM8_CH1N', 'GPIO_AF7_USART3_TX'],
    'PC5': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH2', 'GPIO_AF3_TIM8_CH2N', 'GPIO_AF7_USART3_RX'],
    'PC6': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM3_CH1', 'GPIO_AF2_TIM3_CH1', 'GPIO_AF3_TIM8_CH1', 'GPIO_AF4_I2S2_MCK', 'GPIO_AF6_USART6_TX', 'GPIO_AF8_USART3_TX'],
    'PC7': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM3_CH2', 'GPIO_AF2_TIM3_CH2', 'GPIO_AF3_TIM8_CH2', 'GPIO_AF4_I2S3_MCK', 'GPIO_AF6_USART6_RX', 'GPIO_AF8_USART3_RX'],
    'PC8': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM3_CH3', 'GPIO_AF2_TIM3_CH3', 'GPIO_AF3_TIM8_CH3', 'GPIO_AF4_I2S2_MCK', 'GPIO_AF6_SDIO_D0'],
    'PC9': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM3_CH4', 'GPIO_AF2_TIM3_CH4', 'GPIO_AF3_TIM8_CH4', 'GPIO_AF4_I2S3_MCK', 'GPIO_AF6_SDIO_D1'],
    'PC10': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH2N', 'GPIO_AF2_TIM2_CH1', 'GPIO_AF3_TIM8_CH3N', 'GPIO_AF4_UART4_TX', 'GPIO_AF5_SPI3_SCK', 'GPIO_AF7_SDIO_D2'],
    'PC11': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH3N', 'GPIO_AF2_TIM2_CH2', 'GPIO_AF3_TIM8_CH4N', 'GPIO_AF4_UART4_RX', 'GPIO_AF5_SPI3_MISO', 'GPIO_AF7_SDIO_D3'],
    'PC12': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH4', 'GPIO_AF2_TIM2_CH3', 'GPIO_AF3_TIM8_BKIN', 'GPIO_AF4_UART5_TX', 'GPIO_AF5_SPI3_MOSI', 'GPIO_AF6_UART5_TX'],
    'PC13': ['GPIO_AF0_GPIO', 'GPIO_AF4_RTC_AF1'],
    'PC14': ['GPIO_AF0_GPIO', 'GPIO_AF4_RTC_AF1'],
    'PC15': ['GPIO_AF0_GPIO', 'GPIO_AF4_RTC_AF1'],
    'PD0': ['GPIO_AF0_GPIO', 'GPIO_AF1_CAN1_RX', 'GPIO_AF2_TIM2_CH1', 'GPIO_AF4_I2C1_SMBA'],
    'PD1': ['GPIO_AF0_GPIO', 'GPIO_AF1_CAN1_TX', 'GPIO_AF2_TIM2_CH2', 'GPIO_AF4_I2C1_SCL'],
    'PD2': ['GPIO_AF0_GPIO', 'GPIO_AF1_UART5_RX', 'GPIO_AF3_UART5_RX', 'GPIO_AF7_USART3_RX'],
    'PD3': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART2_CTS', 'GPIO_AF2_TIM2_CH2', 'GPIO_AF5_USART3_RTS'],
    'PD4': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART2_RTS', 'GPIO_AF2_TIM2_CH4', 'GPIO_AF5_USART3_RTS'],
    'PD5': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART2_TX', 'GPIO_AF2_TIM2_CH3', 'GPIO_AF7_USART3_RTS'],
    'PD6': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART2_RX', 'GPIO_AF2_TIM2_CH3', 'GPIO_AF7_USART3_RX'],
    'PD7': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART2_RX', 'GPIO_AF2_TIM2_CH3', 'GPIO_AF7_USART3_RX'],
    'PD8': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART3_TX', 'GPIO_AF2_TIM2_CH3', 'GPIO_AF7_USART3_TX'],
    'PD9': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART3_RX', 'GPIO_AF2_TIM2_CH4', 'GPIO_AF7_USART3_RX'],
    'PD10': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART3_CK', 'GPIO_AF2_TIM2_CH1', 'GPIO_AF7_USART3_CK'],
    'PD11': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART3_CTS', 'GPIO_AF4_CAN1_RX', 'GPIO_AF7_USART3_CTS'],
    'PD12': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH1', 'GPIO_AF2_TIM4_CH1', 'GPIO_AF4_UART4_RTS', 'GPIO_AF7_USART3_RTS'],
    'PD13': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH2', 'GPIO_AF2_TIM4_CH2', 'GPIO_AF4_UART4_CTS', 'GPIO_AF7_USART3_RTS'],
    'PD14': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH3', 'GPIO_AF2_TIM4_CH3', 'GPIO_AF7_USART3_RTS'],
    'PD15': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_CH4', 'GPIO_AF2_TIM4_CH4', 'GPIO_AF7_USART3_RTS'],
    'PE0': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM4_ETR', 'GPIO_AF2_TIM4_ETR', 'GPIO_AF4_UART5_RX', 'GPIO_AF7_UART5_RX'],
    'PE1': ['GPIO_AF0_GPIO', 'GPIO_AF1_UART5_RX', 'GPIO_AF4_UART5_RX', 'GPIO_AF7_UART5_RX'],
    'PE2': ['GPIO_AF0_GPIO', 'GPIO_AF1_UART5_TX', 'GPIO_AF4_UART5_TX', 'GPIO_AF5_SPI3_MISO', 'GPIO_AF7_UART5_TX'],
    'PE3': ['GPIO_AF0_GPIO', 'GPIO_AF2_TIM3_CH3', 'GPIO_AF5_SPI3_MISO'],
    'PE4': ['GPIO_AF0_GPIO', 'GPIO_AF2_TIM3_CH4', 'GPIO_AF5_SPI3_NSS'],
    'PE5': ['GPIO_AF0_GPIO', 'GPIO_AF2_TIM3_CH1', 'GPIO_AF5_SPI3_MISO'],
    'PE6': ['GPIO_AF0_GPIO', 'GPIO_AF2_TIM3_CH2', 'GPIO_AF5_SPI3_MOSI'],
    'PE7': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_ETR', 'GPIO_AF2_TIM3_CH1', 'GPIO_AF7_USART3_RX'],
    'PE8': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH1N', 'GPIO_AF3_TIM8_CH1N', 'GPIO_AF5_UART5_TX'],
    'PE9': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH1', 'GPIO_AF2_TIM3_CH3', 'GPIO_AF4_UART5_TX'],
    'PE10': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH2N', 'GPIO_AF3_TIM8_CH2N', 'GPIO_AF5_UART5_RX'],
    'PE11': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH2', 'GPIO_AF2_TIM3_CH4', 'GPIO_AF4_UART5_RX'],
    'PE12': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH3N', 'GPIO_AF3_TIM8_CH3N', 'GPIO_AF5_UART5_RX'],
    'PE13': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH3', 'GPIO_AF2_TIM3_CH1', 'GPIO_AF4_UART5_TX'],
    'PE14': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_CH4', 'GPIO_AF3_TIM8_CH4N', 'GPIO_AF5_UART5_RX'],
    'PE15': ['GPIO_AF0_GPIO', 'GPIO_AF1_TIM1_BKIN', 'GPIO_AF3_TIM8_CH4N', 'GPIO_AF4_UART5_TX'],
    'PF0': ['GPIO_AF0_GPIO', 'GPIO_AF3_UART4_RX', 'GPIO_AF5_I2C2_SDA'],
    'PF1': ['GPIO_AF0_GPIO', 'GPIO_AF3_UART4_TX', 'GPIO_AF5_I2C2_SCL'],
    'PF2': ['GPIO_AF0_GPIO', 'GPIO_AF3_I2C2_SMBA'],
    'PF3': ['GPIO_AF0_GPIO', 'GPIO_AF3_I2C2_SDA'],
    'PF4': ['GPIO_AF0_GPIO', 'GPIO_AF3_I2C2_SCL'],
    'PF5': ['GPIO_AF0_GPIO', 'GPIO_AF3_I2C2_SMBA'],
    'PF6': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM3_CH1', 'GPIO_AF5_USART3_RX'],
    'PF7': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM3_CH2', 'GPIO_AF5_USART3_TX'],
    'PF8': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM3_CH3', 'GPIO_AF5_USART3_TX'],
    'PF9': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM3_CH4', 'GPIO_AF5_USART3_RX'],
    'PF10': ['GPIO_AF0_GPIO', 'GPIO_AF3_UART4_RX', 'GPIO_AF5_I2C2_SCL'],
    'PF11': ['GPIO_AF0_GPIO', 'GPIO_AF3_UART4_TX', 'GPIO_AF5_I2C2_SDA'],
    'PF12': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM4_CH1', 'GPIO_AF5_UART4_RTS'],
    'PF13': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM4_CH2', 'GPIO_AF5_UART4_CTS'],
    'PF14': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM4_CH3'],
    'PF15': ['GPIO_AF0_GPIO', 'GPIO_AF3_TIM4_CH4'],
    'PG0': ['GPIO_AF0_GPIO', 'GPIO_AF2_TIM4_CH2', 'GPIO_AF3_UART4_RX', 'GPIO_AF5_UART5_RX'],
    'PG1': ['GPIO_AF0_GPIO', 'GPIO_AF2_TIM4_CH3', 'GPIO_AF3_UART4_TX', 'GPIO_AF5_UART5_TX'],
    'PG2': ['GPIO_AF0_GPIO', 'GPIO_AF3_UART4_RTS', 'GPIO_AF5_UART4_RTS'],
    'PG3': ['GPIO_AF0_GPIO', 'GPIO_AF3_UART4_CTS', 'GPIO_AF5_UART4_CTS'],
    'PG4': ['GPIO_AF0_GPIO', 'GPIO_AF5_UART5_RTS'],
    'PG5': ['GPIO_AF0_GPIO', 'GPIO_AF5_UART5_CTS'],
    'PG6': ['GPIO_AF0_GPIO', 'GPIO_AF3_USART6_TX', 'GPIO_AF5_UART5_RX'],
    'PG7': ['GPIO_AF0_GPIO', 'GPIO_AF3_USART6_RX', 'GPIO_AF5_UART5_TX'],
    'PG8': ['GPIO_AF0_GPIO', 'GPIO_AF3_USART6_RTS', 'GPIO_AF5_UART4_RX'],
    'PG9': ['GPIO_AF0_GPIO', 'GPIO_AF3_USART6_CTS', 'GPIO_AF5_UART4_TX'],
    'PG10': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART3_RTS', 'GPIO_AF5_I2C2_SMBA'],
    'PG11': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART3_RTS'],
    'PG12': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART3_RTS'],
    'PG13': ['GPIO_AF0_GPIO', 'GPIO_AF1_ETH_TXD0', 'GPIO_AF2_UART4_RTS'],
    'PG14': ['GPIO_AF0_GPIO', 'GPIO_AF1_ETH_TXD1'],
    'PG15': ['GPIO_AF0_GPIO', 'GPIO_AF1_USART6_RTS'],
    'PH0': ['GPIO_AF0_GPIO', 'GPIO_AF2_RCC_OSC_IN'],
    'PH1': ['GPIO_AF0_GPIO', 'GPIO_AF2_RCC_OSC_OUT'],
    'PH2': ['GPIO_AF0_GPIO'],
    'PH3': ['GPIO_AF0_GPIO'],
    'PH4': ['GPIO_AF0_GPIO'],
    'PH5': ['GPIO_AF0_GPIO'],
    'PH6': ['GPIO_AF0_GPIO'],
    'PH7': ['GPIO_AF0_GPIO'],
    'PH8': ['GPIO_AF0_GPIO'],
    'PH9': ['GPIO_AF0_GPIO'],
    'PH10': ['GPIO_AF0_GPIO'],
    'PH11': ['GPIO_AF0_GPIO'],
    'PH12': ['GPIO_AF0_GPIO'],
    'PH13': ['GPIO_AF0_GPIO'],
    'PH14': ['GPIO_AF0_GPIO'],
    'PH15': ['GPIO_AF0_GPIO'],
    'PI0': ['GPIO_AF0_GPIO'],
    'PI1': ['GPIO_AF0_GPIO'],
    'PI2': ['GPIO_AF0_GPIO'],
    'PI3': ['GPIO_AF0_GPIO'],
    'PI4': ['GPIO_AF0_GPIO'],
    'PI5': ['GPIO_AF0_GPIO'],
    'PI6': ['GPIO_AF0_GPIO'],
    'PI7': ['GPIO_AF0_GPIO'],
    'PI8': ['GPIO_AF0_GPIO'],
    'PI9': ['GPIO_AF0_GPIO'],
    'PI10': ['GPIO_AF0_GPIO'],
    'PI11': ['GPIO_AF0_GPIO'],
    'PI12': ['GPIO_AF0_GPIO'],
    'PI13': ['GPIO_AF0_GPIO'],
    'PI14': ['GPIO_AF0_GPIO'],
    'PI15': ['GPIO_AF0_GPIO'],
}

GPIO_MODES = [
    {'value': 'GPIO_MODE_INPUT', 'label': 'Input'},
    {'value': 'GPIO_MODE_OUTPUT_PP', 'label': 'Output Push-Pull'},
    {'value': 'GPIO_MODE_OUTPUT_OD', 'label': 'Output Open-Drain'},
    {'value': 'GPIO_MODE_AF_PP', 'label': 'AF Push-Pull'},
    {'value': 'GPIO_MODE_AF_OD', 'label': 'AF Open-Drain'},
    {'value': 'GPIO_MODE_ANALOG', 'label': 'Analog'},
    {'value': 'GPIO_MODE_IT_RISING', 'label': 'EXTI Rising'},
    {'value': 'GPIO_MODE_IT_FALLING', 'label': 'EXTI Falling'},
    {'value': 'GPIO_MODE_IT_RISING_FALLING', 'label': 'EXTI Both'},
    {'value': 'GPIO_MODE_EVT_RISING', 'label': 'EVT Rising'},
    {'value': 'GPIO_MODE_EVT_FALLING', 'label': 'EVT Falling'},
]

GPIO_SPEEDS = [
    {'value': 'GPIO_SPEED_FREQ_LOW', 'label': 'Low (2MHz)'},
    {'value': 'GPIO_SPEED_FREQ_MEDIUM', 'label': 'Medium (25MHz)'},
    {'value': 'GPIO_SPEED_FREQ_HIGH', 'label': 'High (50MHz)'},
    {'value': 'GPIO_SPEED_FREQ_VERY_HIGH', 'label': 'Very High (100MHz)'},
]

GPIO_PULLS = [
    {'value': 'GPIO_NOPULL', 'label': 'No Pull'},
    {'value': 'GPIO_PULLUP', 'label': 'Pull-Up'},
    {'value': 'GPIO_PULLDOWN', 'label': 'Pull-Down'},
]

PERIPH_PRESETS = {
    'USART': {
        'config_fields': [
            {'key': 'instance', 'type': 'select', 'label': 'Instance', 'options': [
                {'value': 'USART1', 'label': 'USART1'},
                {'value': 'USART2', 'label': 'USART2'},
                {'value': 'USART3', 'label': 'USART3'},
                {'value': 'UART4', 'label': 'UART4'},
                {'value': 'UART5', 'label': 'UART5'},
                {'value': 'USART6', 'label': 'USART6'},
            ]},
            {'key': 'baudrate', 'type': 'number', 'label': 'Baud Rate', 'default': 115200},
            {'key': 'word_length', 'type': 'select', 'label': 'Word Length', 'options': [
                {'value': 'UART_WORDLENGTH_8B', 'label': '8 Bits'},
                {'value': 'UART_WORDLENGTH_9B', 'label': '9 Bits'},
            ]},
            {'key': 'stop_bits', 'type': 'select', 'label': 'Stop Bits', 'options': [
                {'value': 'UART_STOPBITS_1', 'label': '1 Bit'},
                {'value': 'UART_STOPBITS_0_5', 'label': '0.5 Bit'},
                {'value': 'UART_STOPBITS_2', 'label': '2 Bits'},
                {'value': 'UART_STOPBITS_1_5', 'label': '1.5 Bits'},
            ]},
            {'key': 'parity', 'type': 'select', 'label': 'Parity', 'options': [
                {'value': 'UART_PARITY_NONE', 'label': 'None'},
                {'value': 'UART_PARITY_EVEN', 'label': 'Even'},
                {'value': 'UART_PARITY_ODD', 'label': 'Odd'},
            ]},
        ]
    },
    'I2C': {
        'config_fields': [
            {'key': 'instance', 'type': 'select', 'label': 'Instance', 'options': [
                {'value': 'I2C1', 'label': 'I2C1'},
                {'value': 'I2C2', 'label': 'I2C2'},
                {'value': 'I2C3', 'label': 'I2C3'},
            ]},
            {'key': 'timing', 'type': 'number', 'label': 'Timing', 'default': 0x30E0638A},
            {'key': 'own_address', 'type': 'number', 'label': 'Own Address', 'default': 0},
        ]
    },
    'SPI': {
        'config_fields': [
            {'key': 'instance', 'type': 'select', 'label': 'Instance', 'options': [
                {'value': 'SPI1', 'label': 'SPI1'},
                {'value': 'SPI2', 'label': 'SPI2'},
                {'value': 'SPI3', 'label': 'SPI3'},
            ]},
            {'key': 'clk_polarity', 'type': 'select', 'label': 'Clock Polarity', 'options': [
                {'value': 'SPI_POLARITY_LOW', 'label': 'Low (CPOL=0)'},
                {'value': 'SPI_POLARITY_HIGH', 'label': 'High (CPOL=1)'},
            ]},
            {'key': 'clk_phase', 'type': 'select', 'label': 'Clock Phase', 'options': [
                {'value': 'SPI_PHASE_1EDGE', 'label': '1st Edge (CPHA=0)'},
                {'value': 'SPI_PHASE_2EDGE', 'label': '2nd Edge (CPHA=1)'},
            ]},
            {'key': 'baudrate_prescaler', 'type': 'select', 'label': 'Baudrate Prescaler', 'options': [
                {'value': 'SPI_BAUDRATEPRESCALER_2', 'label': 'PCLK/2'},
                {'value': 'SPI_BAUDRATEPRESCALER_4', 'label': 'PCLK/4'},
                {'value': 'SPI_BAUDRATEPRESCALER_8', 'label': 'PCLK/8'},
                {'value': 'SPI_BAUDRATEPRESCALER_16', 'label': 'PCLK/16'},
                {'value': 'SPI_BAUDRATEPRESCALER_32', 'label': 'PCLK/32'},
                {'value': 'SPI_BAUDRATEPRESCALER_64', 'label': 'PCLK/64'},
                {'value': 'SPI_BAUDRATEPRESCALER_128', 'label': 'PCLK/128'},
                {'value': 'SPI_BAUDRATEPRESCALER_256', 'label': 'PCLK/256'},
            ]},
        ]
    },
}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/pins')
def get_pins():
    return jsonify({
        'pins': PIN_TABLE,
        'gpio_modes': GPIO_MODES,
        'gpio_speeds': GPIO_SPEEDS,
        'gpio_pulls': GPIO_PULLS,
        'periph_presets': PERIPH_PRESETS,
    })


@app.route('/api/export', methods=['POST'])
def export():
    config_data = request.get_json()

    pin_names = set()
    duplicate_pins = set()
    for pin in config_data.get('pins', []):
        name = pin.get('name', '')
        if name in pin_names:
            duplicate_pins.add(name)
        pin_names.add(name)

    if duplicate_pins:
        return jsonify({
            'error': '引脚冲突',
            'duplicate_pins': list(duplicate_pins),
            'message': f'检测到引脚冲突: {", ".join(duplicate_pins)}'
        }), 400

    clock = config_data.get('clock', {})
    pll_m = clock.get('pll_m', 8)
    pll_n = clock.get('pll_n', 360)
    pll_p = clock.get('pll_p', 2)
    hse_freq = clock.get('hse_freq', 8000000)

    pll_vco = (hse_freq / pll_m) * pll_n
    pll_out = pll_vco / pll_p
    if pll_out > 180000000:
        return jsonify({
            'error': 'PLL 配置错误',
            'message': f'PLL 输出频率 {pll_out/1000000:.1f} MHz 超出最大限制 (180 MHz)'
        }), 400

    zip_data = create_project_zip(config_data)
    buf = io.BytesIO(zip_data)
    buf.seek(0)
    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name='stm32_project.zip',
    )


if __name__ == '__main__':
    app.run(debug=True, port=5000)

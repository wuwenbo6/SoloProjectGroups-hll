#!/usr/bin/env python3
"""测试代码生成器功能"""

from code_generator import generate_c_code

test_xml = '''<?xml version="1.0" encoding="UTF-8"?>
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="ladder_rung" x="50" y="50">
    <field name="RUNG_NAME">RUNG_0</field>
    <statement name="CONDITIONS">
      <block type="ladder_contact_normal_open">
        <field name="CONTACT_NAME">I0.0</field>
        <next>
          <block type="ladder_contact_normal_close">
            <field name="CONTACT_NAME">I0.1</field>
          </block>
        </next>
      </block>
    </statement>
    <statement name="OUTPUTS">
      <block type="ladder_coil_output">
        <field name="COIL_NAME">Q0.0</field>
        <next>
          <block type="ladder_timer_ton">
            <field name="TIMER_NAME">T0</field>
            <field name="PRESET">1000</field>
          </block>
        </next>
      </block>
    </statement>
  </block>
  <block type="ladder_rung" x="50" y="300">
    <field name="RUNG_NAME">RUNG_1</field>
    <statement name="CONDITIONS">
      <block type="ladder_compare_eq">
        <field name="VAR_A">MW0</field>
        <field name="VAR_B">100</field>
      </block>
    </statement>
    <statement name="OUTPUTS">
      <block type="ladder_counter_ctu">
        <field name="COUNTER_NAME">C0</field>
        <field name="PRESET">10</field>
      </block>
    </statement>
  </block>
</xml>'''

def main():
    print("=" * 60)
    print("测试代码生成器功能")
    print("=" * 60)
    
    result = generate_c_code(test_xml)
    
    if result.success:
        print("✅ 代码生成成功!")
        print()
        print("📊 生成统计:")
        print(f"  定时器: {len(result.timers)} 个")
        print(f"  计数器: {len(result.counters)} 个")
        print(f"  输入: {len(result.inputs)} 个 - {list(result.inputs)}")
        print(f"  输出: {len(result.outputs)} 个 - {list(result.outputs)}")
        print(f"  内存: {len(result.memories)} 个 - {list(result.memories)}")
        print()
        print("=" * 60)
        print("📄 生成的C代码 (前100行):")
        print("=" * 60)
        lines = result.code.split('\n')
        for i, line in enumerate(lines[:100]):
            print(f"{i+1:3d}: {line}")
        if len(lines) > 100:
            print(f"... (共 {len(lines)} 行，省略其余)")
    else:
        print("❌ 代码生成失败!")
        print(f"错误: {result.error}")

if __name__ == '__main__':
    main()

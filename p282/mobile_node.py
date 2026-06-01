import requests
import time
import random
import json
import hmac
import hashlib

API_BASE = 'http://localhost:5001'

SHARED_KEYS = {
    'SPI-0x00001000': 'secret_key_mobileip_2024',
    'SPI-0x00001001': 'another_secret_key_for_mn2',
    'SPI-0x00001002': 'default_shared_key_ha'
}


def compute_mn_ha_auth(spi, hoa, coa, lifetime, shared_key):
    data = f"{spi}|{hoa}|{coa}|{lifetime}"
    return hmac.new(shared_key.encode(), data.encode(), hashlib.md5).hexdigest()


class MobileNode:
    def __init__(self, hoa, name='MN', spi='SPI-0x00001000'):
        self.hoa = hoa
        self.name = name
        self.current_coa = None
        self.spi = spi
        self.shared_key = SHARED_KEYS.get(spi, 'default_key')

    def send_binding_update(self, coa, lifetime=3600):
        self.current_coa = coa
        auth_data = compute_mn_ha_auth(self.spi, self.hoa, coa, lifetime, self.shared_key)

        try:
            response = requests.post(f'{API_BASE}/binding-update', json={
                'hoa': self.hoa,
                'coa': coa,
                'lifetime': lifetime,
                'spi': self.spi,
                'auth_data': auth_data
            })
            result = response.json()

            if response.status_code == 200:
                print(f'[{self.name}] ✓ BU发送成功: {self.hoa} → {coa}')
                print(f'       认证通过 | SPI: {self.spi} | 剩余: {result.get("remaining_seconds")}s')
            else:
                bfa = result.get('bfa', {})
                print(f'[{self.name}] ✗ BU发送失败')
                print(f'       BFA状态码: {bfa.get("status")}')
                print(f'       BFA消息: {bfa.get("status_message")}')
                print(f'       错误: {result.get("error")}')
            return result
        except Exception as e:
            print(f'[{self.name}] BU发送失败: {e}')
            return None

    def send_binding_update_wrong_key(self, coa, lifetime=3600):
        self.current_coa = coa
        wrong_auth = compute_mn_ha_auth(self.spi, self.hoa, coa, lifetime, 'wrong_secret_key')

        try:
            response = requests.post(f'{API_BASE}/binding-update', json={
                'hoa': self.hoa,
                'coa': coa,
                'lifetime': lifetime,
                'spi': self.spi,
                'auth_data': wrong_auth
            })
            result = response.json()
            bfa = result.get('bfa', {})
            print(f'[{self.name}] ✗ 使用错误密钥发送BU (测试认证失败)')
            print(f'       BFA状态码: {bfa.get("status")}')
            print(f'       BFA消息: {bfa.get("status_message")}')
            return result
        except Exception as e:
            print(f'[{self.name}] 请求失败: {e}')
            return None

    def send_packet_to_cn(self, dest_cn='10.0.1.50', payload_size=100):
        try:
            response = requests.post(f'{API_BASE}/simulate-reverse-packet', json={
                'src_hoa': self.hoa,
                'dest_cn': dest_cn,
                'payload_size': payload_size
            })
            result = response.json()
            if response.ok:
                packet = result['packet']
                print(f'[{self.name}] ✓ 反向包已封装: {self.hoa} → {dest_cn}')
                print(f'       外层: {packet["outer_header"]["src"]} → {packet["outer_header"]["dst"]}')
            else:
                print(f'[{self.name}] ✗ 反向包发送失败: {result.get("error")}')
            return result
        except Exception as e:
            print(f'[{self.name}] 反向包请求失败: {e}')
            return None

    def __str__(self):
        return f'{self.name}(HoA={self.hoa}, CoA={self.current_coa}, SPI={self.spi})'


def demo_scenario():
    print('=' * 75)
    print('移动IP家乡代理 - 反向隧道与历史导出演示')
    print('=' * 75)
    print()

    mn1 = MobileNode('10.0.0.1', 'MN-Alice', 'SPI-0x00001000')
    mn2 = MobileNode('10.0.0.2', 'MN-Bob',   'SPI-0x00001001')
    cn_address = '10.0.1.50'

    print('【测试1】MN-HA共享密钥认证验证')
    print('-' * 75)
    mn1.send_binding_update('192.168.1.100')
    time.sleep(0.3)
    mn2.send_binding_update_wrong_key('192.168.1.101')
    time.sleep(0.3)
    mn2.send_binding_update('192.168.1.101')
    print()

    print('【测试2】MN-Alice漫游到新网络 (测试历史记录)')
    print('-' * 75)
    mn1.send_binding_update('10.10.1.50')
    time.sleep(0.3)
    mn1.send_binding_update('172.16.0.25')
    print()

    print('【测试3】正向隧道 (CN→MN) - 发送数据包到移动节点')
    print('-' * 75)
    for i in range(5):
        response = requests.post(f'{API_BASE}/simulate-packet', json={
            'dest_hoa': '10.0.0.1',
            'payload_size': random.randint(64, 1500)
        })
        result = response.json()
        if response.ok:
            print(f'  CN→MN 包{i+1}: 封装成功 → CoA: {result["packet"]["outer_header"]["dst"]}')
        time.sleep(0.15)
    print()

    print('【测试4】反向隧道 (MN→CN) - 移动节点发送数据包到通信对端')
    print('-' * 75)
    for i in range(3):
        mn1.send_packet_to_cn(cn_address, random.randint(64, 1500))
        time.sleep(0.15)
    print()
    for i in range(2):
        mn2.send_packet_to_cn(cn_address, random.randint(64, 1500))
        time.sleep(0.15)
    print()

    print('【测试5】双向隧道综合统计')
    print('-' * 75)
    response = requests.get(f'{API_BASE}/all-tunnel-stats')
    stats = response.json()
    print(f'  正向隧道总包数 (CN→MN): {stats["total_forward"]}')
    print(f'  反向隧道总包数 (MN→CN): {stats["total_reverse"]}')
    print(f'  双向隧道总计:          {stats["grand_total"]}')
    print()
    for hoa, ho_stats in stats['per_hoa'].items():
        print(f'  {hoa}: 正向 {ho_stats["forward_packets"]} | 反向 {ho_stats["reverse_packets"]} | 总计 {ho_stats["total_packets"]}')
    print()

    print('【测试6】绑定更新历史记录')
    print('-' * 75)
    response = requests.get(f'{API_BASE}/binding-history')
    history = response.json()
    print(f'  总历史记录数: {history["count"]}')
    print()
    for record in history['records']:
        status_icon = '✓' if record['success'] else '✗'
        mobile_tag = ' [漫游切换]' if record['is_mobile'] else ''
        coa_info = ''
        if record['old_coa'] and record['new_coa'] and record['old_coa'] != record['new_coa']:
            coa_info = f'{record["old_coa"]} → {record["new_coa"]}'
        elif record['new_coa']:
            coa_info = record['new_coa']
        else:
            coa_info = '已删除'

        print(f'  #{record["sequence"]:2d} {status_icon} {record["hoa"]:12s} | CoA: {coa_info:30s} | {record["status_message"]}{mobile_tag}')
    print()

    print('【测试7】导出绑定更新历史 (JSON)')
    print('-' * 75)
    response = requests.get(f'{API_BASE}/export-binding-history?format=json')
    json_data = response.json()
    print(f'  导出JSON成功，共 {json_data["total_records"]} 条记录')
    print(f'  导出时间: {json_data["export_timestamp"]}')
    print(f'  文件名: {response.headers.get("Content-Disposition", "N/A")}')
    print()

    print('【测试8】导出绑定更新历史 (CSV)')
    print('-' * 75)
    response = requests.get(f'{API_BASE}/export-binding-history?format=csv')
    csv_lines = response.text.strip().split('\n')
    print(f'  导出CSV成功，共 {len(csv_lines) - 1} 条数据记录')
    print(f'  CSV表头: {csv_lines[0]}')
    if len(csv_lines) > 1:
        print(f'  首行数据: {csv_lines[1][:100]}...')
    print()

    print('【测试9】BFA历史记录')
    print('-' * 75)
    response = requests.get(f'{API_BASE}/bfa-history')
    bfa_data = response.json()
    print(f'  BFA消息总数: {bfa_data["count"]}')
    for bfa in bfa_data['bfa_messages']:
        print(f'  #{bfa["sequence"]} | 状态 {bfa["status"]:3d} | {bfa["hoa"]:12s} | {bfa["status_message"]}')
    print()

    print('【测试10】MN-Charlie测试5秒生存期过期')
    print('-' * 75)
    mn3 = MobileNode('10.0.0.3', 'MN-Charlie', 'SPI-0x00001002')
    mn3.send_binding_update('172.16.0.50', lifetime=5)
    print()
    print('  等待过期...')
    for i in range(7):
        response = requests.get(f'{API_BASE}/bindings')
        data = response.json()
        countdowns = data.get('countdowns', {})
        remaining = countdowns.get('10.0.0.3', 0)
        if remaining > 0:
            print(f'    倒计时: {remaining}s  | 绑定状态: 活跃')
        else:
            print(f'    倒计时: 0s  | 绑定状态: 已过期')
            break
        time.sleep(1)
    print()

    print('【测试11】查看过期后的最终历史记录')
    print('-' * 75)
    response = requests.get(f'{API_BASE}/binding-history')
    history = response.json()
    print(f'  最终历史记录数: {history["count"]}')
    print()
    for record in history['records'][-3:]:
        status_icon = '✓' if record['success'] else '✗'
        print(f'  #{record["sequence"]:2d} {status_icon} {record["hoa"]:12s} | {record["status_message"]}')
    print()

    print('=' * 75)
    print('演示完成!')
    print()
    print('功能总结:')
    print('  ✓ MN-HA共享密钥认证 (SPI + HMAC-MD5)')
    print('  ✓ 认证失败时发送BFA (状态码67)')
    print('  ✓ 绑定生存期自动倒计时与过期')
    print('  ✓ 过期自动删除绑定并发送BFA (状态码130)')
    print('  ✓ 正向隧道 (CN→MN) 数据包封装与计数')
    print('  ✓ 反向隧道 (MN→CN) 数据包封装与计数')
    print('  ✓ 双向隧道统计汇总')
    print('  ✓ 绑定更新完整历史记录 (创建/漫游/刷新/删除)')
    print('  ✓ 漫游切换自动标记 (is_mobile)')
    print('  ✓ 历史记录导出 (JSON / CSV格式)')
    print()
    print('请在前端页面 http://localhost:5001/ 查看实时数据')
    print('=' * 75)


if __name__ == '__main__':
    try:
        demo_scenario()
    except requests.exceptions.ConnectionError:
        print('错误: 无法连接到家乡代理服务器')
        print('请先启动服务器: python home_agent.py')

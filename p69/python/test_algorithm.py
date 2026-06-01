#!/usr/bin/env python3
import numpy as np
from scipy.io import wavfile
from PIL import Image
import os
import sys
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from steganography import AudioSteganography, ReedSolomon


def generate_test_audio(output_path, duration=10, sample_rate=44100):
    print(f"生成测试音频: {duration}秒, {sample_rate}Hz")
    
    t = np.linspace(0, duration, int(duration * sample_rate), False)
    
    audio = np.sin(2 * np.pi * 440 * t) * 0.3
    audio += np.sin(2 * np.pi * 880 * t) * 0.2
    audio += np.sin(2 * np.pi * 1320 * t) * 0.1
    
    noise = np.random.normal(0, 0.05, len(t))
    audio += noise
    
    envelope = np.exp(-t * 0.1)
    audio *= envelope
    
    audio = (audio * 32767 * 0.8).astype(np.int16)
    
    wavfile.write(output_path, sample_rate, audio)
    print(f"音频已保存: {output_path}")
    return output_path


def generate_test_image(output_path, size=(128, 128)):
    print(f"生成测试图像: {size}")
    
    img = Image.new('L', size, color=255)
    
    for x in range(size[0]):
        for y in range(size[1]):
            if (x // 16 + y // 16) % 2 == 0:
                img.putpixel((x, y), 0)
    
    img.save(output_path)
    print(f"图像已保存: {output_path}")
    return output_path


def test_reed_solomon():
    print("\n" + "="*60)
    print("测试 1: Reed-Solomon纠错码")
    print("="*60)
    
    rs = ReedSolomon(nsym=16)
    
    test_data = b"Hello, this is a test of Reed-Solomon error correction!"
    print(f"原始数据: {test_data[:40]}... ({len(test_data)} 字节)")
    
    encoded = rs.encode(test_data)
    print(f"编码后: {len(encoded)} 字节 (增加 {len(encoded) - len(test_data)} 校验字节)")
    
    corrupted = bytearray(encoded)
    corrupted[5] = 0xFF
    corrupted[10] = 0x00
    corrupted[15] = 0xAA
    print(f"注入 3 个字节错误...")
    
    decoded = rs.decode(bytes(corrupted))
    print(f"解码后: {decoded[:40]}...")
    
    if decoded[:len(test_data)] == test_data:
        print("✓ RS纠错码工作正常!")
        return True
    else:
        print("✗ RS纠错码测试失败!")
        return False


def test_multi_band_embed():
    print("\n" + "="*60)
    print("测试 2: 多频段嵌入")
    print("="*60)
    
    tmp_dir = "/tmp/stego_test"
    os.makedirs(tmp_dir, exist_ok=True)
    
    audio_path = os.path.join(tmp_dir, "test_audio.wav")
    image_path = os.path.join(tmp_dir, "test_image.png")
    embedded_path = os.path.join(tmp_dir, "embedded_multiband.wav")
    
    generate_test_audio(audio_path, duration=15)
    generate_test_image(image_path, size=(64, 64))
    
    stego = AudioSteganography()
    
    print(f"\n频段配置:")
    for i, band in enumerate(stego.bands):
        indices = stego._get_band_freq_indices(band)
        print(f"  频段{i+1} {band['name']}: 频率{band['start']}-{band['end']}, 共{len(indices)}个点")
    
    all_indices = stego._get_all_freq_indices()
    print(f"  总计: {len(all_indices)} 个频率点")
    
    print("\n嵌入图像...")
    stego.load_audio(audio_path)
    result = stego.embed_image(image_path, embedded_path)
    print(f"嵌入结果: 成功={result['success']}, RS编码={result.get('rs_encoded', False)}, 多频段={result.get('multi_band', False)}")
    
    return result['success']


def test_basic_embed_extract():
    print("\n" + "="*60)
    print("测试 3: 基础嵌入提取 (含RS纠错)")
    print("="*60)
    
    tmp_dir = "/tmp/stego_test"
    os.makedirs(tmp_dir, exist_ok=True)
    
    audio_path = os.path.join(tmp_dir, "test_audio.wav")
    image_path = os.path.join(tmp_dir, "test_image.png")
    embedded_path = os.path.join(tmp_dir, "embedded.wav")
    extracted_path = os.path.join(tmp_dir, "extracted.png")
    
    generate_test_audio(audio_path, duration=15)
    generate_test_image(image_path, size=(64, 64))
    
    stego = AudioSteganography()
    
    print("\n嵌入图像...")
    stego.load_audio(audio_path)
    result = stego.embed_image(image_path, embedded_path)
    print(f"嵌入结果: 使用 {result['bits_embedded']} 位, 原始 {result['original_bits']} 位")
    
    if not result['success']:
        print("嵌入失败!")
        return False
    
    print("\n提取图像...")
    extract_result = stego.extract_image(embedded_path)
    print(f"提取结果: 成功={extract_result['success']}, 尺寸={extract_result.get('image_size', 'N/A')}")
    
    if extract_result['success']:
        with open(extracted_path, 'wb') as f:
            f.write(extract_result['image_data'])
        print(f"图像已提取到: {extracted_path}")
        print("✓ 图像提取成功!")
        return True
    else:
        print("✗ 图像提取失败!")
        return False


def test_noise_robustness():
    print("\n" + "="*60)
    print("测试 4: 噪声鲁棒性 (模拟MP3压缩)")
    print("="*60)
    
    tmp_dir = "/tmp/stego_test"
    os.makedirs(tmp_dir, exist_ok=True)
    
    audio_path = os.path.join(tmp_dir, "test_audio.wav")
    image_path = os.path.join(tmp_dir, "test_image.png")
    embedded_path = os.path.join(tmp_dir, "embedded.wav")
    noisy_path = os.path.join(tmp_dir, "noisy.wav")
    
    generate_test_audio(audio_path, duration=15)
    generate_test_image(image_path, size=(64, 64))
    
    stego = AudioSteganography()
    stego.load_audio(audio_path)
    stego.embed_image(image_path, embedded_path)
    
    sample_rate, data = wavfile.read(embedded_path)
    data_float = data.astype(np.float64)
    
    print("\n噪声强度测试:")
    success_count = 0
    for noise_level in [0.001, 0.005, 0.01, 0.02]:
        noisy_data = data_float + np.random.normal(0, noise_level * 32767, data_float.shape)
        noisy_data = np.clip(noisy_data, -32767, 32767)
        wavfile.write(noisy_path, sample_rate, noisy_data.astype(np.int16))
        
        result = stego.extract_image(noisy_path)
        if result['success']:
            print(f"  噪声 {noise_level*100:4.1f}%: ✓ 成功")
            success_count += 1
        else:
            print(f"  噪声 {noise_level*100:4.1f}%: ✗ 失败")
    
    print(f"\n鲁棒性: {success_count}/4 个噪声等级通过")
    return success_count >= 2


def test_export_audio():
    print("\n" + "="*60)
    print("测试 5: 隐写音频导出")
    print("="*60)
    
    tmp_dir = "/tmp/stego_test"
    os.makedirs(tmp_dir, exist_ok=True)
    
    audio_path = os.path.join(tmp_dir, "test_audio.wav")
    image_path = os.path.join(tmp_dir, "test_image.png")
    export_path = os.path.join(tmp_dir, "exported_stego.wav")
    
    generate_test_audio(audio_path, duration=10)
    generate_test_image(image_path, size=(64, 64))
    
    stego = AudioSteganography()
    stego.load_audio(audio_path)
    stego.embed_image(image_path)
    
    print("\n导出隐写音频...")
    stego.export_stego_audio(export_path)
    
    if os.path.exists(export_path):
        sr, data = wavfile.read(export_path)
        print(f"导出成功: {export_path}")
        print(f"  采样率: {sr} Hz")
        print(f"  时长: {len(data)/sr:.2f} 秒")
        
        result = stego.extract_image(export_path)
        if result['success']:
            print("  从导出文件提取图像: ✓ 成功")
            return True
        else:
            print("  从导出文件提取图像: ✗ 失败")
            return False
    else:
        print("✗ 导出失败!")
        return False


def test_capacity():
    print("\n" + "="*60)
    print("测试 6: 嵌入容量")
    print("="*60)
    
    tmp_dir = "/tmp/stego_test"
    os.makedirs(tmp_dir, exist_ok=True)
    
    audio_path = os.path.join(tmp_dir, "test_audio.wav")
    generate_test_audio(audio_path, duration=10)
    
    test_sizes = [(64, 64), (128, 128), (256, 256)]
    
    stego = AudioSteganography()
    stego.load_audio(audio_path)
    
    success_sizes = []
    for size in test_sizes:
        image_path = os.path.join(tmp_dir, f"test_{size[0]}x{size[1]}.png")
        generate_test_image(image_path, size=size)
        
        try:
            result = stego.embed_image(image_path)
            print(f"图像 {size}: 嵌入成功, 使用 {result['bits_embedded']} 位")
            success_sizes.append(size)
        except Exception as e:
            print(f"图像 {size}: 嵌入失败 - {str(e)}")
            break
    
    print(f"\n支持的图像尺寸: {success_sizes}")
    return len(success_sizes) > 0


def main():
    print("音频隐写术算法测试 (含RS纠错 + 多频段)")
    print("="*60)
    
    results = {}
    
    results['RS纠错码'] = test_reed_solomon()
    results['多频段嵌入'] = test_multi_band_embed()
    results['基础嵌入提取'] = test_basic_embed_extract()
    results['噪声鲁棒性'] = test_noise_robustness()
    results['音频导出'] = test_export_audio()
    results['容量测试'] = test_capacity()
    
    print("\n" + "="*60)
    print("测试总结:")
    print("="*60)
    
    for name, success in results.items():
        status = "✓ 通过" if success else "✗ 失败"
        print(f"  {name}: {status}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"\n总计: {passed}/{total} 测试通过")
    print("="*60)


if __name__ == '__main__':
    main()

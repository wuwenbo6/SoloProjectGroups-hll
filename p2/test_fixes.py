#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from crnn_model import CRNNRecognizer

def create_test_image(char, size=(64, 64), skew_angle=0):
    img = Image.new('RGB', size, color='white')
    draw = ImageDraw.Draw(img)
    
    try:
        font = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 40)
    except:
        font = ImageFont.load_default()
    
    text_bbox = draw.textbbox((0, 0), char, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    x = (size[0] - text_width) // 2
    y = (size[1] - text_height) // 2
    draw.text((x, y), char, font=font, fill='black')
    
    if skew_angle != 0:
        img = img.rotate(skew_angle, expand=False, fillcolor='white')
    
    return img

def test_similar_char_recognition():
    print("=" * 60)
    print("测试1: 形近字识别 (己/已/巳)")
    print("=" * 60)
    
    recognizer = CRNNRecognizer()
    similar_chars = ['己', '已', '巳']
    results = []
    
    for char in similar_chars:
        img = create_test_image(char)
        result = recognizer.recognize(img)
        candidates = [c['char'] for c in result['candidates']]
        has_similar = any(c in similar_chars for c in candidates)
        similar_in_top3 = sum(1 for c in candidates[:3] if c in similar_chars)
        
        results.append({
            'char': char,
            'recognized': result['text'],
            'confidence': result['confidence'],
            'candidates': candidates,
            'has_similar': has_similar,
            'similar_in_top3': similar_in_top3
        })
        
        print(f"\n输入字符: {char}")
        print(f"识别结果: {result['text']} (置信度: {result['confidence']:.2%})")
        print(f"候选字: {', '.join([f'{c[\"char\"]}({c[\"confidence\"]:.0%})' for c in result['candidates'][:5]])}")
        print(f"候选中含形近字: {has_similar}")
        print(f"Top3中形近字数量: {similar_in_top3}")
    
    similar_rate = sum(1 for r in results if r['has_similar']) / len(results) * 100
    avg_top3 = sum(r['similar_in_top3'] for r in results) / len(results)
    
    print(f"\n形近字在候选中出现率: {similar_rate:.1f}%")
    print(f"Top3中平均形近字数量: {avg_top3:.1f}")
    
    return similar_rate >= 80 and avg_top3 >= 2

def test_skew_correction():
    print("\n" + "=" * 60)
    print("测试2: 图像倾斜校正")
    print("=" * 60)
    
    recognizer = CRNNRecognizer()
    test_angles = [0, 3, -3, 5, -5]
    results = []
    
    for angle in test_angles:
        img = create_test_image('己', skew_angle=angle)
        preprocessed = recognizer.preprocess_image(img)
        
        detected_angle = getattr(recognizer, '_last_detected_angle', 0)
        results.append({
            'angle': angle,
            'detected': detected_angle,
            'corrected': abs(detected_angle - angle) < 2
        })
        
        print(f"\n倾斜角度: {angle}°")
        print(f"检测到的倾斜: {detected_angle:.2f}°")
        print(f"校正成功: {abs(detected_angle - angle) < 2}")
    
    success_rate = sum(1 for r in results if r['corrected']) / len(results) * 100
    print(f"\n倾斜校正成功率: {success_rate:.1f}%")
    
    return success_rate >= 80

def test_sequence_alignment():
    print("\n" + "=" * 60)
    print("测试3: 多序列对齐算法")
    print("=" * 60)
    
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
    from server import needleman_wunsch_align, multi_sequence_alignment, levenshtein_distance
    
    test_cases = [
        (["学而时习之", "学而时习之"], "完全相同"),
        (["学而时习之", "学儿时习之"], "一个字差异"),
        (["学而时习之", "学时时习之"], "形近字差异"),
        (["学而时习之不亦说乎", "学而时习之悦乎"], "缺字+错字"),
        (["ABCDE", "ACE"], "删除两个字符"),
        (["ABCDE", "AXYZCDE"], "插入三个字符"),
    ]
    
    all_passed = True
    for texts, description in test_cases:
        aligned = multi_sequence_alignment(texts)
        edit_dist = levenshtein_distance(texts[0], texts[1])
        
        print(f"\n测试场景: {description}")
        print(f"输入1: {texts[0]}")
        print(f"输入2: {texts[1]}")
        print(f"对齐后1: {aligned[0]}")
        print(f"对齐后2: {aligned[1]}")
        print(f"编辑距离: {edit_dist}")
        
        len_equal = len(aligned[0]) == len(aligned[1])
        print(f"对齐后长度相同: {len_equal}")
        
        if not len_equal:
            all_passed = False
    
    print(f"\n对齐测试 {'通过' if all_passed else '失败'}")
    return all_passed

def main():
    print("\n古籍汉字识别与校勘系统 - Bug修复验证测试")
    print("=" * 60)
    
    test1_passed = test_similar_char_recognition()
    test2_passed = test_skew_correction()
    test3_passed = test_sequence_alignment()
    
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)
    print(f"测试1 (形近字识别): {'通过' if test1_passed else '失败'}")
    print(f"测试2 (倾斜校正): {'通过' if test2_passed else '失败'}")
    print(f"测试3 (序列对齐): {'通过' if test3_passed else '失败'}")
    
    all_passed = test1_passed and test2_passed and test3_passed
    print(f"\n总体结果: {'所有测试通过!' if all_passed else '部分测试失败'}")
    
    return 0 if all_passed else 1

if __name__ == '__main__':
    sys.exit(main())

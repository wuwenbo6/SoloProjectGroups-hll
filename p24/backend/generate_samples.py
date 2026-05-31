import os
import cv2
import numpy as np
from pathlib import Path


def generate_normal_image(size=(224, 224)):
    base_color = np.random.randint(180, 220)
    image = np.full((size[0], size[1], 3), base_color, dtype=np.uint8)
    
    noise = np.random.normal(0, 5, image.shape).astype(np.int16)
    image = np.clip(image + noise, 0, 255).astype(np.uint8)
    
    for _ in range(np.random.randint(2, 5)):
        x = np.random.randint(0, size[0])
        y = np.random.randint(0, size[1])
        radius = np.random.randint(20, 60)
        color_variation = np.random.randint(-10, 10)
        cv2.circle(image, (x, y), radius, 
                  (int(base_color + color_variation), 
                   int(base_color + color_variation), 
                   int(base_color + color_variation)), -1)
    
    return image


def generate_scratch_image(size=(224, 224)):
    image = generate_normal_image(size)
    
    num_scratches = np.random.randint(2, 6)
    for _ in range(num_scratches):
        x1, y1 = np.random.randint(0, size[0]), np.random.randint(0, size[1])
        x2, y2 = np.random.randint(0, size[0]), np.random.randint(0, size[1])
        thickness = np.random.randint(1, 3)
        darkness = np.random.randint(40, 80)
        
        cv2.line(image, (x1, y1), (x2, y2), (darkness, darkness, darkness), thickness)
    
    return image


def generate_dent_image(size=(224, 224)):
    image = generate_normal_image(size)
    
    num_dents = np.random.randint(1, 4)
    for _ in range(num_dents):
        center_x = np.random.randint(30, size[0] - 30)
        center_y = np.random.randint(30, size[1] - 30)
        radius = np.random.randint(15, 40)
        
        mask = np.zeros(size, dtype=np.float32)
        for i in range(size[0]):
            for j in range(size[1]):
                dist = np.sqrt((i - center_x) ** 2 + (j - center_y) ** 2)
                if dist < radius:
                    mask[i, j] = 1 - (dist / radius) ** 2
        
        for c in range(3):
            image[:, :, c] = image[:, :, c] - (mask * 40).astype(np.uint8)
        
        image = np.clip(image, 0, 255).astype(np.uint8)
        
        cv2.circle(image, (center_x, center_y), radius, (80, 80, 80), 2)
    
    return image


def generate_sample_data(data_dir, num_samples=10):
    classes = {
        'normal': generate_normal_image,
        'scratch': generate_scratch_image,
        'dent': generate_dent_image
    }
    
    for class_name, generator in classes.items():
        class_dir = os.path.join(data_dir, class_name)
        os.makedirs(class_dir, exist_ok=True)
        
        for i in range(num_samples):
            image = generator()
            img_path = os.path.join(class_dir, f'{class_name}_{i:03d}.png')
            cv2.imwrite(img_path, image)
            print(f'Generated: {img_path}')


if __name__ == '__main__':
    base_dir = Path(__file__).parent.parent
    
    print('Generating training samples (5 per class for few-shot)...')
    generate_sample_data(os.path.join(base_dir, 'data', 'train'), num_samples=5)
    
    print('\nGenerating test samples...')
    generate_sample_data(os.path.join(base_dir, 'data', 'test'), num_samples=3)
    
    print('\nSample data generation completed!')

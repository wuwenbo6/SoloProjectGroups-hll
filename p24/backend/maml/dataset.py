import os
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
import numpy as np
import random


class DefectDataset(Dataset):
    def __init__(self, root_dir, transform=None, img_size=128):
        self.root_dir = root_dir
        self.transform = transform or transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        self.classes = ['normal', 'scratch', 'dent']
        self.class_to_idx = {cls: idx for idx, cls in enumerate(self.classes)}
        
        self.samples = []
        for cls in self.classes:
            cls_dir = os.path.join(root_dir, cls)
            if os.path.exists(cls_dir):
                for img_name in os.listdir(cls_dir):
                    if img_name.endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                        self.samples.append((os.path.join(cls_dir, img_name), self.class_to_idx[cls]))
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        image = Image.open(img_path).convert('RGB')
        image = self.transform(image)
        return image, label


class MAMLTrainer:
    def __init__(self, root_dir, support_shots=5, query_shots=5, img_size=128):
        self.root_dir = root_dir
        self.support_shots = support_shots
        self.query_shots = query_shots
        self.img_size = img_size
        
        self.transform = transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        self.classes = ['normal', 'scratch', 'dent']
        self.class_data = {}
        
        for cls in self.classes:
            cls_dir = os.path.join(root_dir, cls)
            if os.path.exists(cls_dir):
                images = []
                for img_name in os.listdir(cls_dir):
                    if img_name.endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                        img_path = os.path.join(cls_dir, img_name)
                        images.append(img_path)
                self.class_data[cls] = images
    
    def get_task(self):
        selected_classes = random.sample(self.classes, min(2, len(self.classes)))
        
        support_x = []
        support_y = []
        query_x = []
        query_y = []
        
        for cls_idx, cls in enumerate(selected_classes):
            images = self.class_data.get(cls, [])
            if len(images) < self.support_shots + self.query_shots:
                images = images * ((self.support_shots + self.query_shots) // len(images) + 1)
            
            selected = random.sample(images, self.support_shots + self.query_shots)
            
            for i, img_path in enumerate(selected[:self.support_shots]):
                img = Image.open(img_path).convert('RGB')
                img = self.transform(img)
                support_x.append(img)
                support_y.append(cls_idx)
            
            for i, img_path in enumerate(selected[self.support_shots:]):
                img = Image.open(img_path).convert('RGB')
                img = self.transform(img)
                query_x.append(img)
                query_y.append(cls_idx)
        
        return (
            torch.stack(support_x),
            torch.tensor(support_y),
            torch.stack(query_x),
            torch.tensor(query_y)
        )
    
    def get_batch_tasks(self, batch_size=4):
        tasks = []
        for _ in range(batch_size):
            tasks.append(self.get_task())
        return tasks


def load_support_set(data_dir, support_shots=5, img_size=128):
    transform = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    classes = ['normal', 'scratch', 'dent']
    images = []
    labels = []
    
    for cls_idx, cls in enumerate(classes):
        cls_dir = os.path.join(data_dir, cls)
        if os.path.exists(cls_dir):
            img_files = [f for f in os.listdir(cls_dir) if f.endswith(('.jpg', '.jpeg', '.png', '.bmp'))]
            selected = img_files[:support_shots] if len(img_files) >= support_shots else img_files
            
            for img_name in selected:
                img_path = os.path.join(cls_dir, img_name)
                img = Image.open(img_path).convert('RGB')
                img = transform(img)
                images.append(img)
                labels.append(cls_idx)
    
    return torch.stack(images), torch.tensor(labels)

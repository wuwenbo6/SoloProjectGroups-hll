import os
import sys
import torch
import argparse

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from maml.model import LightDefectClassifier, MAML
from maml.dataset import MAMLTrainer


def parse_args():
    parser = argparse.ArgumentParser(description='MAML Training for Defect Detection')
    parser.add_argument('--data_dir', type=str, default='./data/train', help='Training data directory')
    parser.add_argument('--save_path', type=str, default='./backend/models/maml_model.pth', help='Model save path')
    parser.add_argument('--img_size', type=int, default=128, help='Image size (smaller = faster)')
    parser.add_argument('--support_shots', type=int, default=5, help='Number of support shots per class')
    parser.add_argument('--query_shots', type=int, default=5, help='Number of query shots per class')
    parser.add_argument('--num_epochs', type=int, default=50, help='Number of training epochs')
    parser.add_argument('--batch_size', type=int, default=4, help='Batch size (number of tasks)')
    parser.add_argument('--lr', type=float, default=0.01, help='Inner loop learning rate')
    parser.add_argument('--meta_lr', type=float, default=0.001, help='Meta learning rate')
    parser.add_argument('--num_updates', type=int, default=3, help='Number of inner loop updates')
    parser.add_argument('--device', type=str, default='cuda' if torch.cuda.is_available() else 'cpu', help='Device')
    return parser.parse_args()


def main():
    args = parse_args()
    
    print(f"Using device: {args.device}")
    print(f"Training data: {args.data_dir}")
    print(f"Image size: {args.img_size}x{args.img_size}")
    
    os.makedirs(os.path.dirname(args.save_path), exist_ok=True)
    
    task_sampler = MAMLTrainer(
        root_dir=args.data_dir,
        support_shots=args.support_shots,
        query_shots=args.query_shots,
        img_size=args.img_size
    )
    
    model = LightDefectClassifier(num_classes=3, img_size=args.img_size)
    
    maml = MAML(
        model=model,
        device=args.device,
        lr=args.lr,
        meta_lr=args.meta_lr,
        num_updates=args.num_updates
    )
    
    print("Starting MAML training...")
    best_loss = float('inf')
    
    for epoch in range(args.num_epochs):
        total_loss = 0
        
        tasks = task_sampler.get_batch_tasks(batch_size=args.batch_size)
        loss = maml.meta_train_step(tasks)
        total_loss += loss
        
        avg_loss = total_loss / args.batch_size
        
        if (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch+1}/{args.num_epochs}], Meta Loss: {avg_loss:.4f}")
        
        if avg_loss < best_loss:
            best_loss = avg_loss
            maml.save_model(args.save_path)
            print(f"Model saved with loss: {best_loss:.4f}")
    
    print("Training completed!")
    print(f"Best meta loss: {best_loss:.4f}")
    
    return maml


if __name__ == '__main__':
    main()

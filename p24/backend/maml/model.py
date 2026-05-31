import torch
import torch.nn as nn
import torch.nn.functional as F
from collections import OrderedDict


class LightDefectClassifier(nn.Module):
    def __init__(self, num_classes=3, in_channels=3, img_size=128):
        super(LightDefectClassifier, self).__init__()
        self.img_size = img_size
        self.num_classes = num_classes
        
        def conv_block(in_c, out_c, stride=1):
            return nn.Sequential(
                nn.Conv2d(in_c, out_c, 3, stride=stride, padding=1, bias=False),
                nn.BatchNorm2d(out_c),
                nn.ReLU(inplace=True)
            )
        
        self.features = nn.Sequential(
            conv_block(in_channels, 16, stride=2),
            conv_block(16, 32, stride=2),
            conv_block(32, 48, stride=2),
            conv_block(48, 64, stride=2),
            nn.AdaptiveAvgPool2d(1)
        )
        
        self.classifier = nn.Sequential(
            nn.Dropout(0.2),
            nn.Linear(64, num_classes)
        )
        
        self._init_weights()
    
    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.normal_(m.weight, 0, 0.01)
                nn.init.constant_(m.bias, 0)
    
    def forward(self, x, weights=None):
        if weights is None:
            x = self.features(x)
            x = x.view(x.size(0), -1)
            x = self.classifier(x)
            return x
        else:
            return self._forward_with_weights(x, weights)
    
    def _forward_with_weights(self, x, weights):
        idx = 0
        for layer in self.features:
            if isinstance(layer, nn.Sequential):
                for sub_layer in layer:
                    if isinstance(sub_layer, nn.Conv2d):
                        w = weights.get(f'features.{idx}.0.weight')
                        b = weights.get(f'features.{idx}.0.bias')
                        stride = sub_layer.stride
                        x = F.conv2d(x, w, b, stride=stride, padding=1)
                    elif isinstance(sub_layer, nn.BatchNorm2d):
                        w = weights.get(f'features.{idx}.1.weight')
                        b = weights.get(f'features.{idx}.1.bias')
                        x = F.batch_norm(x, None, None, weight=w, bias=b, training=True)
                    elif isinstance(sub_layer, nn.ReLU):
                        x = F.relu(x, inplace=True)
                idx += 1
            elif isinstance(layer, nn.AdaptiveAvgPool2d):
                x = F.adaptive_avg_pool2d(x, 1)
        
        x = x.view(x.size(0), -1)
        
        for i, layer in enumerate(self.classifier):
            if isinstance(layer, nn.Dropout):
                x = F.dropout(x, 0.2, training=self.training)
            elif isinstance(layer, nn.Linear):
                w = weights.get(f'classifier.{i}.weight')
                b = weights.get(f'classifier.{i}.bias')
                x = F.linear(x, w, b)
        
        return x
    
    def get_weights(self):
        return OrderedDict(self.named_parameters())
    
    def get_features(self, x):
        x = self.features(x)
        return x.view(x.size(0), -1)


DefectClassifier = LightDefectClassifier


class MAML:
    def __init__(self, model, device, lr=0.01, meta_lr=0.001, num_updates=3):
        self.model = model.to(device)
        self.device = device
        self.lr = lr
        self.num_updates = num_updates
        self.meta_optimizer = torch.optim.Adam(self.model.parameters(), lr=meta_lr)
        self.criterion = nn.CrossEntropyLoss()
        
    def inner_loop(self, support_x, support_y, weights):
        for _ in range(self.num_updates):
            logits = self.model(support_x, weights)
            loss = self.criterion(logits, support_y)
            
            grads = torch.autograd.grad(loss, weights.values(), create_graph=True)
            weights = OrderedDict((k, v - self.lr * g) for (k, v), g in zip(weights.items(), grads))
        
        return weights
    
    def meta_train_step(self, task_batch):
        meta_loss = 0
        self.meta_optimizer.zero_grad()
        
        for support_x, support_y, query_x, query_y in task_batch:
            support_x = support_x.to(self.device)
            support_y = support_y.to(self.device)
            query_x = query_x.to(self.device)
            query_y = query_y.to(self.device)
            
            weights = self.model.get_weights()
            fast_weights = self.inner_loop(support_x, support_y, weights)
            
            query_logits = self.model(query_x, fast_weights)
            task_loss = self.criterion(query_logits, query_y)
            meta_loss += task_loss
        
        meta_loss /= len(task_batch)
        meta_loss.backward()
        self.meta_optimizer.step()
        
        return meta_loss.item()
    
    def fine_tune(self, support_x, support_y, num_steps=5):
        support_x = support_x.to(self.device)
        support_y = support_y.to(self.device)
        
        weights = self.model.get_weights()
        weights = {k: v.clone() for k, v in weights.items()}
        
        for _ in range(num_steps):
            logits = self.model(support_x, weights)
            loss = self.criterion(logits, support_y)
            grads = torch.autograd.grad(loss, weights.values(), create_graph=False)
            weights = {k: v - self.lr * g for (k, v), g in zip(weights.items(), grads)}
        
        return weights
    
    def predict(self, x, weights=None):
        self.model.eval()
        x = x.to(self.device)
        with torch.no_grad():
            logits = self.model(x, weights)
            probs = F.softmax(logits, dim=1)
        return probs
    
    def save_model(self, path):
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'meta_optimizer_state_dict': self.meta_optimizer.state_dict(),
        }, path)
    
    def load_model(self, path):
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        if 'meta_optimizer_state_dict' in checkpoint:
            try:
                self.meta_optimizer.load_state_dict(checkpoint['meta_optimizer_state_dict'])
            except:
                pass

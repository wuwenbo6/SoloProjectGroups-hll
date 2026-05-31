import os
import cv2
import numpy as np
from openvino.runtime import Core
import torch
from torchvision import transforms
from PIL import Image


class OpenVINOInferencer:
    def __init__(self, model_path, weights_path=None, device='CPU'):
        self.ie = Core()
        
        if weights_path is None:
            weights_path = model_path.replace('.xml', '.bin')
        
        self.model = self.ie.read_model(model=model_path, weights=weights_path)
        self.compiled_model = self.ie.compile_model(model=self.model, device_name=device)
        
        self.input_layer = self.compiled_model.input(0)
        self.output_layer = self.compiled_model.output(0)
        
        self.input_shape = self.input_layer.shape
        self.img_size = self.input_shape[2]
        
        self.transform = transforms.Compose([
            transforms.Resize((self.img_size, self.img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        self.classes = ['normal', 'scratch', 'dent']
    
    def preprocess(self, image):
        if isinstance(image, str):
            image = Image.open(image).convert('RGB')
        elif isinstance(image, np.ndarray):
            image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        
        image_tensor = self.transform(image)
        image_tensor = image_tensor.unsqueeze(0).numpy()
        
        return image_tensor
    
    def infer(self, image):
        input_data = self.preprocess(image)
        result = self.compiled_model([input_data])[self.output_layer]
        return result
    
    def predict(self, image):
        logits = self.infer(image)
        probs = self.softmax(logits)
        pred_class = np.argmax(probs, axis=1)[0]
        confidence = probs[0][pred_class]
        
        return {
            'class': self.classes[pred_class],
            'class_id': int(pred_class),
            'confidence': float(confidence),
            'probabilities': {cls: float(probs[0][i]) for i, cls in enumerate(self.classes)}
        }
    
    def softmax(self, x):
        exp_x = np.exp(x - np.max(x, axis=1, keepdims=True))
        return exp_x / np.sum(exp_x, axis=1, keepdims=True)


def convert_pytorch_to_openvino(pytorch_model, output_path, img_size=224):
    import torch
    
    pytorch_model.eval()
    
    dummy_input = torch.randn(1, 3, img_size, img_size)
    
    onnx_path = output_path.replace('.xml', '.onnx')
    
    torch.onnx.export(
        pytorch_model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=12,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output']
    )
    
    mo_command = f"mo --input_model {onnx_path} --output_dir {os.path.dirname(output_path)} --model_name {os.path.splitext(os.path.basename(output_path))[0]}"
    os.system(mo_command)
    
    return output_path

import numpy as np
import nibabel as nib
from PIL import Image, ImageDraw
import os

def polygon_to_mask(polygon_points, width, height):
    img = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(img)
    
    points = [(p['x'], p['y']) for p in polygon_points]
    if len(points) >= 3:
        draw.polygon(points, fill=1)
    
    return np.array(img)

def annotations_to_volume(annotations, image_size):
    width, height, num_slices = image_size
    volume = np.zeros((height, width, num_slices), dtype=np.uint8)
    
    for slice_idx, anns in annotations.items():
        slice_idx = int(slice_idx)
        if 0 <= slice_idx < num_slices:
            for ann in anns:
                if ann['type'] == 'polygon':
                    mask = polygon_to_mask(ann['points'], width, height)
                    volume[:, :, slice_idx] = np.logical_or(
                        volume[:, :, slice_idx],
                        mask
                    ).astype(np.uint8)
    
    return volume

def export_annotations_to_nifti(annotations, output_path, image_size=(512, 512, 1), affine=None):
    volume = annotations_to_volume(annotations, image_size)
    
    if affine is None:
        affine = np.eye(4)
    
    img = nib.Nifti1Image(volume, affine)
    
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    nib.save(img, output_path)
    
    return output_path

def load_nifti(nifti_path):
    img = nib.load(nifti_path)
    data = img.get_fdata()
    affine = img.affine
    return data, affine

def save_nifti(data, output_path, affine=None):
    if affine is None:
        affine = np.eye(4)
    
    img = nib.Nifti1Image(data.astype(np.float32), affine)
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    nib.save(img, output_path)
    return output_path

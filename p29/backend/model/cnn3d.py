import numpy as np
from typing import Tuple, List

try:
    import tensorflow as tf
    from tensorflow.keras import layers, models
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    tf = None
    layers = None
    models = None

__all__ = ['LipReading3DCNN', 'create_dummy_model', 'TENSORFLOW_AVAILABLE']

class LipReading3DCNN:
    def __init__(
        self,
        input_shape = (16, 64, 64, 1),
        num_classes = 22
    ):
        if not TENSORFLOW_AVAILABLE:
            raise ImportError("TensorFlow is not installed")
            
        self.input_shape = input_shape
        self.num_classes = num_classes
        self.class_names = [
            'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
            'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch',
            'sh', 'r', 'z', 'c', 's', 'silence'
        ]
        self.model = self._build_model()

    def _build_model(self):
        inputs = layers.Input(shape=self.input_shape)

        x = layers.Conv3D(32, (3, 3, 3), activation='relu', padding='same')(inputs)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling3D((1, 2, 2))(x)

        x = layers.Conv3D(64, (3, 3, 3), activation='relu', padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling3D((2, 2, 2))(x)

        x = layers.Conv3D(128, (3, 3, 3), activation='relu', padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling3D((2, 2, 2))(x)

        x = layers.Conv3D(256, (3, 3, 3), activation='relu', padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling3D((2, 2, 2))(x)

        x = layers.GlobalAveragePooling3D()(x)
        
        x = layers.Dense(512, activation='relu')(x)
        x = layers.Dropout(0.5)(x)
        
        x = layers.Dense(256, activation='relu')(x)
        x = layers.Dropout(0.3)(x)
        
        outputs = layers.Dense(self.num_classes, activation='softmax')(x)

        model = models.Model(inputs=inputs, outputs=outputs)
        
        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )

        return model

    def summary(self):
        return self.model.summary()

    def preprocess_frames(self, frames):
        processed = []
        for frame in frames:
            if len(frame.shape) == 3:
                gray = np.mean(frame, axis=-1)
            else:
                gray = frame
            
            if gray.shape != (64, 64):
                gray = tf.image.resize(
                    gray[..., np.newaxis], 
                    (64, 64)
                ).numpy().squeeze()
            
            gray = (gray - gray.mean()) / (gray.std() + 1e-8)
            processed.append(gray)

        sequence = np.array(processed)
        
        if len(sequence) < self.input_shape[0]:
            padding = np.zeros((self.input_shape[0] - len(sequence), 64, 64))
            sequence = np.concatenate([sequence, padding], axis=0)
        elif len(sequence) > self.input_shape[0]:
            sequence = sequence[:self.input_shape[0]]

        return sequence[..., np.newaxis]

    def predict(self, frames):
        try:
            processed = self.preprocess_frames(frames)
            processed = np.expand_dims(processed, axis=0)
            
            predictions = self.model.predict(processed, verbose=0)[0]
            class_idx = np.argmax(predictions)
            confidence = float(predictions[class_idx])
            
            return self.class_names[class_idx], confidence
        except Exception as e:
            print(f"Prediction error: {e}")
            return 'silence', 0.0

    def save_weights(self, path):
        self.model.save_weights(path)

    def load_weights(self, path):
        self.model.load_weights(path)

    def train(self, X_train, y_train, X_val, y_val, epochs=50, batch_size=8):
        early_stopping = tf.keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=10,
            restore_best_weights=True
        )
        
        reduce_lr = tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-6
        )

        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=[early_stopping, reduce_lr]
        )

        return history

def create_dummy_model():
    if not TENSORFLOW_AVAILABLE:
        raise ImportError("TensorFlow is not installed")
        
    model = LipReading3DCNN()
    
    dummy_data = np.random.randn(100, 16, 64, 64, 1)
    dummy_labels = np.random.randint(0, 22, 100)
    
    model.model.fit(dummy_data, dummy_labels, epochs=1, verbose=0)
    
    return model

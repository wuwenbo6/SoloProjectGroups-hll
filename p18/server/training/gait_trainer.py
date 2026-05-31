import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.utils import class_weight
import os
import json
from datetime import datetime
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


class GaitTrainer:
    def __init__(self, user_id, model_storage_path):
        self.user_id = user_id
        self.model_storage_path = model_storage_path
        self.user_model_path = os.path.join(model_storage_path, user_id)
        os.makedirs(self.user_model_path, exist_ok=True)
        
        self.window_size = 50
        self.feature_size = 6
        self.n_classes = 2

    def train(self, raw_data):
        print(f"开始训练用户 {self.user_id} 的模型...")
        
        X, y = self._preprocess_data(raw_data)
        print(f"预处理完成: {len(X)} 个样本")
        
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        model = self._build_model()
        
        early_stopping = EarlyStopping(
            monitor='val_loss',
            patience=10,
            restore_best_weights=True
        )
        
        class_weights = class_weight.compute_class_weight(
            'balanced',
            classes=np.unique(y_train),
            y=y_train.flatten()
        )
        class_weight_dict = dict(enumerate(class_weights))
        
        history = model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=50,
            batch_size=64,
            callbacks=[early_stopping],
            class_weight=class_weight_dict,
            verbose=1
        )
        
        loss, accuracy = model.evaluate(X_val, y_val, verbose=0)
        print(f"验证集准确率: {accuracy:.4f}")
        
        model_filename = f"gait_lstm_{self.user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.h5"
        model_path = os.path.join(self.user_model_path, model_filename)
        model.save(model_path)
        
        tflite_path = self._convert_to_tflite(model)
        
        self._save_training_history(history, accuracy)
        
        return tflite_path, accuracy

    def _preprocess_data(self, raw_data):
        df = pd.DataFrame(raw_data)
        
        df['accel_mag'] = np.sqrt(
            df['accelX']**2 + df['accelY']**2 + df['accelZ']**2
        )
        df['gyro_mag'] = np.sqrt(
            df['gyroX']**2 + df['gyroY']**2 + df['gyroZ']**2
        )
        
        features = df[['accelX', 'accelY', 'accelZ', 'gyroX', 'gyroY', 'gyroZ']].values
        
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)
        
        phase_mapping = {'STANCE': 0, 'SWING': 1}
        labels = df['predictedPhase'].map(phase_mapping).values
        
        X, y = self._create_sequences(features_scaled, labels)
        
        y = tf.keras.utils.to_categorical(y, num_classes=self.n_classes)
        
        return X, y

    def _create_sequences(self, features, labels):
        X, y = [], []
        
        for i in range(len(features) - self.window_size):
            X.append(features[i:i + self.window_size])
            y.append(labels[i + self.window_size])
        
        return np.array(X), np.array(y)

    def _build_model(self):
        model = Sequential([
            LSTM(64, return_sequences=True, input_shape=(self.window_size, self.feature_size)),
            BatchNormalization(),
            Dropout(0.3),
            
            LSTM(32, return_sequences=False),
            BatchNormalization(),
            Dropout(0.3),
            
            Dense(32, activation='relu'),
            BatchNormalization(),
            Dropout(0.2),
            
            Dense(self.n_classes, activation='softmax')
        ])
        
        model.compile(
            optimizer='adam',
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return model

    def _convert_to_tflite(self, model):
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]
        
        tflite_model = converter.convert()
        
        tflite_filename = f"gait_lstm_{self.user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.tflite"
        tflite_path = os.path.join(self.user_model_path, tflite_filename)
        
        with open(tflite_path, 'wb') as f:
            f.write(tflite_model)
        
        print(f"TFLite模型已保存: {tflite_path}")
        return tflite_path

    def _save_training_history(self, history, accuracy):
        history_path = os.path.join(
            self.user_model_path,
            f"training_history_{datetime.now().strftime('%Y%m%d%H%M%S')}.json"
        )
        
        history_dict = {
            'accuracy': [float(x) for x in history.history['accuracy']],
            'val_accuracy': [float(x) for x in history.history['val_accuracy']],
            'loss': [float(x) for x in history.history['loss']],
            'val_loss': [float(x) for x in history.history['val_loss']],
            'final_accuracy': float(accuracy),
            'timestamp': datetime.now().isoformat()
        }
        
        with open(history_path, 'w') as f:
            json.dump(history_dict, f, indent=2)
        
        self._plot_training_history(history)

    def _plot_training_history(self, history):
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
        
        ax1.plot(history.history['accuracy'], label='Training')
        ax1.plot(history.history['val_accuracy'], label='Validation')
        ax1.set_title('Model Accuracy')
        ax1.set_xlabel('Epoch')
        ax1.set_ylabel('Accuracy')
        ax1.legend()
        
        ax2.plot(history.history['loss'], label='Training')
        ax2.plot(history.history['val_loss'], label='Validation')
        ax2.set_title('Model Loss')
        ax2.set_xlabel('Epoch')
        ax2.set_ylabel('Loss')
        ax2.legend()
        
        plt.tight_layout()
        plot_path = os.path.join(
            self.user_model_path,
            f"training_plot_{datetime.now().strftime('%Y%m%d%H%M%S')}.png"
        )
        plt.savefig(plot_path)
        plt.close()


def create_default_model():
    default_path = os.path.join(os.getenv("MODEL_STORAGE_PATH", "./models"), "default")
    os.makedirs(default_path, exist_ok=True)
    
    n_samples = 10000
    window_size = 50
    feature_size = 6
    
    X = np.random.randn(n_samples, window_size, feature_size)
    
    y = np.zeros(n_samples)
    for i in range(n_samples):
        if np.mean(X[i, :, 0]) > 0.5:
            y[i] = 1
    
    y = tf.keras.utils.to_categorical(y, 2)
    
    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(window_size, feature_size)),
        BatchNormalization(),
        Dropout(0.3),
        LSTM(32, return_sequences=False),
        BatchNormalization(),
        Dropout(0.3),
        Dense(32, activation='relu'),
        Dense(2, activation='softmax')
    ])
    
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    model.fit(X, y, epochs=5, batch_size=64, verbose=1)
    
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()
    
    tflite_path = os.path.join(default_path, "gait_lstm_model.tflite")
    with open(tflite_path, 'wb') as f:
        f.write(tflite_model)
    
    print(f"默认模型已创建: {tflite_path}")
    return tflite_path


if __name__ == "__main__":
    create_default_model()

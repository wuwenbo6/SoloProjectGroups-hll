import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import classification_report, accuracy_score
from typing import Tuple, List, Dict
import glob
from feature_extractor import FeatureExtractor


BIRD_SPECIES = [
    "Acadian Flycatcher", "American Crow", "American Goldfinch", "American Robin",
    "Baltimore Oriole", "Barn Swallow", "Black-capped Chickadee", "Blue Jay",
    "Blue-gray Gnatcatcher", "Brown Creeper", "Carolina Chickadee", "Carolina Wren",
    "Cedar Waxwing", "Chipping Sparrow", "Common Yellowthroat", "Dark-eyed Junco",
    "Downy Woodpecker", "Eastern Bluebird", "Eastern Kingbird", "Eastern Phoebe",
    "Eastern Towhee", "European Starling", "Field Sparrow", "Gray Catbird",
    "Great Crested Flycatcher", "Hairy Woodpecker", "House Finch", "House Wren",
    "Indigo Bunting", "Mourning Dove", "Northern Cardinal", "Northern Flicker",
    "Northern Mockingbird", "Ovenbird", "Pine Warbler", "Purple Finch",
    "Red-bellied Woodpecker", "Red-eyed Vireo", "Red-headed Woodpecker", "Rose-breasted Grosbeak",
    "Ruby-throated Hummingbird", "Song Sparrow", "Tufted Titmouse", "White-breasted Nuthatch",
    "White-crowned Sparrow", "White-throated Sparrow", "Wood Thrush", "Yellow Warbler",
    "Yellow-bellied Sapsucker", "Yellow-throated Vireo"
]


class ModelTrainer:
    def __init__(self, model_path: str = "../models/bird_classifier.pkl",
                 scaler_path: str = "../models/scaler.pkl",
                 label_encoder_path: str = "../models/label_encoder.pkl"):
        self.model_path = model_path
        self.scaler_path = scaler_path
        self.label_encoder_path = label_encoder_path
        self.feature_extractor = FeatureExtractor()
        self.model = None
        self.scaler = None
        self.label_encoder = None
    
    def create_synthetic_data(self, n_samples_per_class: int = 20) -> Tuple[np.ndarray, np.ndarray]:
        np.random.seed(42)
        n_features = 858
        n_classes = len(BIRD_SPECIES)
        
        X = np.random.randn(n_samples_per_class * n_classes, n_features)
        y = []
        
        for class_idx in range(n_classes):
            start_idx = class_idx * n_samples_per_class
            end_idx = start_idx + n_samples_per_class
            X[start_idx:end_idx] += class_idx * 0.5
            y.extend([BIRD_SPECIES[class_idx]] * n_samples_per_class)
        
        return X.astype(np.float32), np.array(y)
    
    def load_training_data(self, data_dir: str) -> Tuple[np.ndarray, np.ndarray]:
        X = []
        y = []
        
        for species in BIRD_SPECIES:
            species_dir = os.path.join(data_dir, species.replace(" ", "_"))
            if not os.path.exists(species_dir):
                continue
            
            audio_files = glob.glob(os.path.join(species_dir, "*.wav")) + \
                          glob.glob(os.path.join(species_dir, "*.mp3"))
            
            for audio_file in audio_files:
                try:
                    features = self.feature_extractor.extract_from_file(audio_file)
                    X.append(features)
                    y.append(species)
                except Exception as e:
                    print(f"Error processing {audio_file}: {e}")
        
        if len(X) == 0:
            print("No training data found, using synthetic data...")
            return self.create_synthetic_data()
        
        return np.array(X), np.array(y)
    
    def train(self, data_dir: str = "../data", test_size: float = 0.2,
              n_estimators: int = 200, random_state: int = 42) -> Dict:
        X, y = self.load_training_data(data_dir)
        
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=y
        )
        
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        self.label_encoder = LabelEncoder()
        y_train_encoded = self.label_encoder.fit_transform(y_train)
        y_test_encoded = self.label_encoder.transform(y_test)
        
        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=20,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=random_state,
            n_jobs=-1
        )
        
        self.model.fit(X_train_scaled, y_train_encoded)
        
        y_pred = self.model.predict(X_test_scaled)
        accuracy = accuracy_score(y_test_encoded, y_pred)
        
        report = classification_report(
            y_test_encoded, y_pred,
            target_names=self.label_encoder.classes_,
            output_dict=True
        )
        
        self.save_model()
        
        return {
            "accuracy": accuracy,
            "classification_report": report,
            "n_samples": len(X),
            "n_classes": len(self.label_encoder.classes_)
        }
    
    def save_model(self):
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(self.model, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)
        joblib.dump(self.label_encoder, self.label_encoder_path)
        print(f"Model saved to {self.model_path}")
    
    def load_model(self):
        if not os.path.exists(self.model_path):
            print(f"Model not found at {self.model_path}, training new model...")
            self.train()
            return
        
        self.model = joblib.load(self.model_path)
        self.scaler = joblib.load(self.scaler_path)
        self.label_encoder = joblib.load(self.label_encoder_path)
    
    def predict(self, features: np.ndarray, top_k: int = 5) -> List[Dict]:
        if self.model is None:
            self.load_model()
        
        features_scaled = self.scaler.transform(features.reshape(1, -1))
        
        probabilities = self.model.predict_proba(features_scaled)[0]
        
        top_indices = np.argsort(probabilities)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            species = self.label_encoder.inverse_transform([idx])[0]
            confidence = float(probabilities[idx])
            results.append({
                "species": species,
                "confidence": confidence,
                "confidence_percent": round(confidence * 100, 2)
            })
        
        return results


if __name__ == "__main__":
    trainer = ModelTrainer()
    results = trainer.train()
    print(f"Training complete! Accuracy: {results['accuracy']:.2f}")
    print(f"Number of samples: {results['n_samples']}")
    print(f"Number of classes: {results['n_classes']}")

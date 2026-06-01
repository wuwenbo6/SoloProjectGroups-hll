import cv2
import numpy as np
import json
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from . import models
import uuid


class FeatureExtractor:
    @staticmethod
    def extract_color_histogram(image: np.ndarray, bins: Tuple[int, int, int] = (8, 8, 8)) -> np.ndarray:
        hist = cv2.calcHist([image], [0, 1, 2], None, bins, [0, 256, 0, 256, 0, 256])
        hist = cv2.normalize(hist, hist).flatten()
        return hist

    @staticmethod
    def extract_shape_features(image: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        moments = cv2.moments(gray)
        hu_moments = cv2.HuMoments(moments).flatten()
        return hu_moments

    @staticmethod
    def extract_combined_features(image: np.ndarray) -> np.ndarray:
        color_hist = FeatureExtractor.extract_color_histogram(image)
        shape_feat = FeatureExtractor.extract_shape_features(image)
        shape_feat = np.sign(shape_feat) * np.log1p(np.abs(shape_feat))
        shape_feat = (shape_feat - shape_feat.mean()) / (shape_feat.std() + 1e-8)
        combined = np.concatenate([color_hist * 2.0, shape_feat * 0.5])
        return combined

    @staticmethod
    def feature_to_string(feature: np.ndarray) -> str:
        return json.dumps(feature.tolist())

    @staticmethod
    def string_to_feature(feature_str: str) -> np.ndarray:
        return np.array(json.loads(feature_str))


class IndividualMatcher:
    def __init__(self, similarity_threshold: float = 0.75):
        self.similarity_threshold = similarity_threshold

    @staticmethod
    def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot_product / (norm1 * norm2)

    @staticmethod
    def chi2_distance(histA: np.ndarray, histB: np.ndarray, eps: float = 1e-10) -> float:
        d = 0.5 * np.sum([((a - b) ** 2) / (a + b + eps) for (a, b) in zip(histA, histB)])
        return 1.0 / (1.0 + d)

    def calculate_similarity(self, feat1: np.ndarray, feat2: np.ndarray) -> float:
        cos_sim = self.cosine_similarity(feat1, feat2)
        chi_sim = self.chi2_distance(feat1[:512], feat2[:512])
        return 0.6 * cos_sim + 0.4 * chi_sim

    def match_individual(
        self,
        db: Session,
        species: str,
        feature_vector: np.ndarray
    ) -> Tuple[Optional[models.Individual], float]:
        individuals = db.query(models.Individual).filter(
            models.Individual.species == species,
            models.Individual.feature_vector.isnot(None)
        ).all()

        best_match = None
        best_similarity = self.similarity_threshold

        for individual in individuals:
            stored_feature = FeatureExtractor.string_to_feature(individual.feature_vector)
            similarity = self.calculate_similarity(feature_vector, stored_feature)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = individual

        return best_match, best_similarity


class IndividualRecognitionManager:
    def __init__(self):
        self.feature_extractor = FeatureExtractor()
        self.matcher = IndividualMatcher()

    def extract_detection_features(
        self,
        full_image: np.ndarray,
        bbox: Tuple[int, int, int, int]
    ) -> Optional[np.ndarray]:
        x1, y1, x2, y2 = bbox
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(full_image.shape[1], x2), min(full_image.shape[0], y2)
        
        if x2 <= x1 or y2 <= y1:
            return None

        crop_img = full_image[y1:y2, x1:x2]
        if crop_img.size == 0:
            return None

        return self.feature_extractor.extract_combined_features(crop_img)

    def process_detection(
        self,
        db: Session,
        species: str,
        full_image: np.ndarray,
        bbox: Tuple[int, int, int, int],
        photo_id: int
    ) -> Tuple[models.Detection, models.Individual]:
        from datetime import datetime

        feature_vector = self.extract_detection_features(full_image, bbox)
        
        matched_individual = None
        similarity = 0.0

        if feature_vector is not None:
            matched_individual, similarity = self.matcher.match_individual(
                db, species, feature_vector
            )

        if matched_individual is None:
            individual_id_str = f"{species}_{uuid.uuid4().hex[:8]}"
            new_individual = models.Individual(
                species=species,
                individual_id=individual_id_str,
                sighting_count=1,
                feature_vector=self.feature_extractor.feature_to_string(feature_vector) if feature_vector is not None else None
            )
            db.add(new_individual)
            db.flush()
            individual = new_individual
        else:
            individual = matched_individual
            individual.sighting_count += 1
            individual.last_seen = datetime.now()
            if feature_vector is not None:
                old_feat = self.feature_extractor.string_to_feature(individual.feature_vector)
                updated_feat = old_feat * 0.7 + feature_vector * 0.3
                individual.feature_vector = self.feature_extractor.feature_to_string(updated_feat)

        detection = models.Detection(
            photo_id=photo_id,
            individual_id=individual.id,
            species=species,
            count=1,
            confidence="0.0",
            bbox=json.dumps(bbox),
            feature_vector=self.feature_extractor.feature_to_string(feature_vector) if feature_vector is not None else None
        )

        return detection, individual

    def get_recapture_rate(self, db: Session, species: Optional[str] = None) -> List[Dict]:
        query = db.query(models.Individual)
        if species:
            query = query.filter(models.Individual.species == species)
        
        individuals = query.all()
        
        species_stats = {}
        for ind in individuals:
            if ind.species not in species_stats:
                species_stats[ind.species] = {"total": 0, "recaptured": 0}
            species_stats[ind.species]["total"] += 1
            if ind.sighting_count > 1:
                species_stats[ind.species]["recaptured"] += 1

        result = []
        for sp, stats in species_stats.items():
            recapture_rate = stats["recaptured"] / stats["total"] if stats["total"] > 0 else 0.0
            result.append({
                "species": sp,
                "total_individuals": stats["total"],
                "recaptured_individuals": stats["recaptured"],
                "recapture_rate": round(recapture_rate, 4)
            })

        return result


recognizer_manager = IndividualRecognitionManager()

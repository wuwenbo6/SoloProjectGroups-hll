import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface RatingStarsProps {
  rating: number;
  totalStars?: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  showValue?: boolean;
  count?: number;
  className?: string;
}

export const RatingStars: React.FC<RatingStarsProps> = ({
  rating,
  totalStars = 5,
  size = 18,
  interactive = false,
  onRate,
  showValue = false,
  count,
  className = '',
}) => {
  const [hoverRating, setHoverRating] = useState(0);

  const handleClick = (star: number) => {
    if (interactive && onRate) {
      onRate(star);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="flex items-center">
        {Array.from({ length: totalStars }).map((_, index) => {
          const starValue = index + 1;
          const isFilled = starValue <= Math.round(displayRating);
          const isHalf = !isFilled && starValue - 0.5 <= displayRating;

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleClick(starValue)}
              onMouseEnter={() => interactive && setHoverRating(starValue)}
              onMouseLeave={() => interactive && setHoverRating(0)}
              className={`${
                interactive ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'
              }`}
              disabled={!interactive}
            >
              <Star
                size={size}
                className={`transition-colors ${
                  isFilled
                    ? 'fill-yellow-400 text-yellow-400'
                    : isHalf
                    ? 'text-yellow-400'
                    : 'text-gray-600'
                }`}
                style={
                  isHalf
                    ? {
                        background: `linear-gradient(to right, #facc15 50%, transparent 50%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }
                    : undefined
                }
              />
            </button>
          );
        })}
      </div>
      {showValue && (
        <span className="text-sm font-mono text-gray-300 ml-1">
          {rating.toFixed(1)}
          {count !== undefined && (
            <span className="text-gray-500 ml-1">({count})</span>
          )}
        </span>
      )}
    </div>
  );
};

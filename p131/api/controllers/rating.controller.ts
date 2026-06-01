import { Request, Response } from 'express';
import { ratingService } from '../services/rating.service';

export class RatingController {
  async addRating(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { score, comment } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      if (score === undefined || score < 1 || score > 5) {
        res.status(400).json({
          success: false,
          error: 'Score must be between 1 and 5',
        });
        return;
      }

      const rating = await ratingService.addRating(id, userId, score, comment);

      res.json({
        success: true,
        data: rating,
        message: 'Rating submitted successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async getRatings(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const page = req.query.page ? Number(req.query.page) : 1;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;

      const result = await ratingService.getPluginRatings(id, page, pageSize);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async getUserRating(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const rating = await ratingService.getUserRating(id, userId);

      res.json({
        success: true,
        data: rating,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }

  async deleteRating(req: Request, res: Response): Promise<void> {
    try {
      const { ratingId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      await ratingService.deleteRating(ratingId, userId);

      res.json({
        success: true,
        message: 'Rating deleted successfully',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  }
}

export const ratingController = new RatingController();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class RatingService {
  async addRating(
    pluginId: string,
    userId: string,
    score: number,
    comment?: string
  ) {
    if (score < 1 || score > 5) {
      throw new Error('Score must be between 1 and 5');
    }

    const existingRating = await prisma.rating.findUnique({
      where: {
        pluginId_userId: {
          pluginId,
          userId,
        },
      },
    });

    let rating;
    if (existingRating) {
      rating = await prisma.rating.update({
        where: { id: existingRating.id },
        data: { score, comment },
        include: {
          user: { select: { name: true, email: true } },
        },
      });
    } else {
      rating = await prisma.rating.create({
        data: { pluginId, userId, score, comment },
        include: {
          user: { select: { name: true, email: true } },
        },
      });
    }

    await this.updatePluginRatingStats(pluginId);

    return rating;
  }

  async getPluginRatings(pluginId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where: { pluginId },
        include: {
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.rating.count({ where: { pluginId } }),
    ]);

    const ratingDistribution = await this.getRatingDistribution(pluginId);

    return {
      items: ratings,
      total,
      page,
      pageSize,
      distribution: ratingDistribution,
    };
  }

  async getRatingDistribution(pluginId: string) {
    const ratings = await prisma.rating.findMany({
      where: { pluginId },
      select: { score: true },
    });

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const rating of ratings) {
      distribution[rating.score as keyof typeof distribution]++;
    }

    return distribution;
  }

  async getUserRating(pluginId: string, userId: string) {
    return prisma.rating.findUnique({
      where: {
        pluginId_userId: {
          pluginId,
          userId,
        },
      },
    });
  }

  private async updatePluginRatingStats(pluginId: string) {
    const stats = await prisma.rating.aggregate({
      where: { pluginId },
      _avg: { score: true },
      _count: { score: true },
    });

    await prisma.plugin.update({
      where: { id: pluginId },
      data: {
        averageRating: Math.round((stats._avg.score || 0) * 10) / 10,
        ratingCount: stats._count.score || 0,
      },
    });
  }

  async deleteRating(ratingId: string, userId: string) {
    const rating = await prisma.rating.findUnique({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new Error('Rating not found');
    }

    if (rating.userId !== userId) {
      throw new Error('Not authorized to delete this rating');
    }

    await prisma.rating.delete({ where: { id: ratingId } });
    await this.updatePluginRatingStats(rating.pluginId);

    return true;
  }
}

export const ratingService = new RatingService();

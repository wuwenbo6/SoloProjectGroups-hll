import { Router } from 'express';
import {
  getAllRecipes,
  getRecipeById,
  createRecipe as dbCreateRecipe,
  updateRecipe as dbUpdateRecipe,
  deleteRecipe as dbDeleteRecipe,
} from '../database/index.js';
import {
  authenticateToken,
  AuthRequest,
  requireRole,
  ROLES,
} from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const recipes = getAllRecipes();
    const formattedRecipes = (recipes as any[]).map((recipe) => ({
      ...recipe,
      parameters: JSON.parse(recipe.parameters),
    }));

    res.json({
      success: true,
      data: formattedRecipes,
    });
  } catch (error) {
    console.error('Get recipes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recipes',
    });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const recipeId = parseInt(req.params.id);
    const recipe = getRecipeById(recipeId) as any;

    if (!recipe) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found',
      });
    }

    res.json({
      success: true,
      data: {
        ...recipe,
        parameters: JSON.parse(recipe.parameters),
      },
    });
  } catch (error) {
    console.error('Get recipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recipe',
    });
  }
});

router.post('/', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req: AuthRequest, res) => {
  try {
    const { name, description, parameters } = req.body;

    if (!name || !parameters) {
      return res.status(400).json({
        success: false,
        error: 'Name and parameters are required',
      });
    }

    const result = dbCreateRecipe(name, description || '', parameters, req.user?.id || null);

    res.json({
      success: true,
      data: {
        id: (result as any).lastInsertRowid,
        name,
        description,
        parameters,
      },
    });
  } catch (error) {
    console.error('Create recipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create recipe',
    });
  }
});

router.put('/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req: AuthRequest, res) => {
  try {
    const recipeId = parseInt(req.params.id);
    const { name, description, parameters } = req.body;

    const existingRecipe = getRecipeById(recipeId);
    if (!existingRecipe) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found',
      });
    }

    dbUpdateRecipe(recipeId, name, description || '', parameters);

    res.json({
      success: true,
      message: 'Recipe updated',
    });
  } catch (error) {
    console.error('Update recipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update recipe',
    });
  }
});

router.delete('/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req: AuthRequest, res) => {
  try {
    const recipeId = parseInt(req.params.id);

    const existingRecipe = getRecipeById(recipeId);
    if (!existingRecipe) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found',
      });
    }

    dbDeleteRecipe(recipeId);

    res.json({
      success: true,
      message: 'Recipe deleted',
    });
  } catch (error) {
    console.error('Delete recipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete recipe',
    });
  }
});

router.post('/:id/apply', authenticateToken, requireRole(ROLES.ADMIN, ROLES.OPERATOR), (req: AuthRequest, res) => {
  try {
    const recipeId = parseInt(req.params.id);
    const recipe = getRecipeById(recipeId) as any;

    if (!recipe) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found',
      });
    }

    const parameters = JSON.parse(recipe.parameters);
    console.log(`Applying recipe ${recipe.name} by ${req.user?.username}`, parameters);

    res.json({
      success: true,
      message: `Recipe "${recipe.name}" applied successfully`,
      parameters,
    });
  } catch (error) {
    console.error('Apply recipe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply recipe',
    });
  }
});

export default router;

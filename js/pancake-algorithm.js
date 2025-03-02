import db from './db.js';

class PancakeAlgorithm {
  constructor() {
    // Rating weights
    this.ratingWeights = {
      'bad': -1,
      'mid': 0,
      'good': 1
    };
    
    // Learning rates based on rating confidence
    this.learningRates = {
      initial: 0.4,    // Faster learning at the start (increased from 0.3)
      confident: 0.2,  // Moderate adjustments (increased from 0.15)
      finetuning: 0.07 // Small adjustments (increased from 0.05)
    };
    
    // Minimum and maximum cooking times in seconds
    this.minTime = 30;  // 30 seconds
    this.maxTime = 240; // 4 minutes
    
    // Confidence tracking
    this.confidenceThreshold = 3; // Number of "good" ratings to be considered confident
    this.finetuningThreshold = 4; // Number of good ratings to start fine-tuning (reduced from 5)
    
    // Similarity weights for temperature - defines how much neighboring temperatures
    // influence the recommendations (e.g. experience at temperature 5 affects temps 4 and 6)
    this.temperatureSimilarity = {
      0: 1.0,  // Same temperature: 100% weight
      1: 0.6,  // Adjacent temperature (±1): 60% weight
      2: 0.3,  // Two steps away (±2): 30% weight
      3: 0.1   // Three steps away (±3): 10% weight
    };
  }
  
  /**
   * Updates recommendations based on user feedback
   * @param {number} temperature - The temperature level (1-9)
   * @param {number} firstSideTime - Time spent on first side in seconds
   * @param {number} secondSideTime - Time spent on second side in seconds
   * @param {string} rating - User rating ('bad', 'mid', 'good')
   * @param {number} recipeId - Optional recipe ID (defaults to current recipe)
   */
  async updateRecommendation(temperature, firstSideTime, secondSideTime, rating, recipeId = null) {
    // If no recipeId provided, get current recipe
    if (!recipeId) {
      recipeId = await db.getCurrentRecipeId();
    }
    
    // Get current recipe data
    const recipe = await db.getRecipePreset(recipeId);
    
    // Get current recommendation for this temperature
    const currentRecommendation = await db.getRecipeRecommendation(recipeId, temperature);
    
    // Get history for this recipe and temperature to determine confidence
    const history = await db.getPancakeHistory(50, recipeId);
    const temperatureHistory = history.filter(item => item.temperature === temperature);
    
    // Get recent ratings for confidence calculation
    const recentSize = Math.min(10, temperatureHistory.length);
    const recentRatings = temperatureHistory.slice(0, recentSize);
    const goodRatingsCount = recentRatings.filter(item => item.rating === 'good').length;
    
    // Determine learning rate based on confidence and history size
    let learningRate = this.learningRates.initial;
    let confidence = 0;
    
    if (recentSize > 0) {
      confidence = goodRatingsCount / recentSize;
    }
    
    // Adjust learning rate based on confidence score
    if (goodRatingsCount >= this.finetuningThreshold) {
      learningRate = this.learningRates.finetuning;
    } else if (goodRatingsCount >= this.confidenceThreshold) {
      learningRate = this.learningRates.confident;
    }
    
    // Calculate rating factor
    const ratingFactor = this.ratingWeights[rating];
    
    // Calculate adjustments with appropriate learning rate
    const firstSideAdjustment = this.calculateAdjustment(
      firstSideTime, 
      currentRecommendation.firstSideTime, 
      ratingFactor,
      learningRate,
      temperature,
      recipe
    );
    
    const secondSideAdjustment = this.calculateAdjustment(
      secondSideTime, 
      currentRecommendation.secondSideTime, 
      ratingFactor,
      learningRate,
      temperature,
      recipe
    );
    
    // Calculate new times
    let newFirstSideTime = currentRecommendation.firstSideTime + firstSideAdjustment;
    let newSecondSideTime = currentRecommendation.secondSideTime + secondSideAdjustment;
    
    // Ensure times stay within min/max bounds (use recipe-specific bounds if available)
    const minTime = recipe?.minCookTime || this.minTime;
    const maxTime = recipe?.maxCookTime || this.maxTime;
    
    newFirstSideTime = Math.max(minTime, Math.min(maxTime, newFirstSideTime));
    newSecondSideTime = Math.max(minTime, Math.min(maxTime, newSecondSideTime));
    
    // Round to whole seconds for cleaner display
    newFirstSideTime = Math.round(newFirstSideTime);
    newSecondSideTime = Math.round(newSecondSideTime);
    
    // This is an actual data point from user feedback, so increment the counter
    const newDataPoints = (currentRecommendation.dataPoints || 0) + 1;
    
    // Mark recipe as having real data
    if (!recipe.hasData) {
      recipe.hasData = true;
      await db.updateRecipePreset(recipe);
    }
    
    // Save updated recommendation
    await db.saveRecipeRecommendation(recipeId, temperature, {
      firstSideTime: newFirstSideTime,
      secondSideTime: newSecondSideTime,
      confidence: confidence,
      dataPoints: newDataPoints
    });
    
    // Update nearby temperatures based on similarity
    await this.updateNeighboringTemperatures(
      recipeId, 
      temperature, 
      firstSideTime, 
      secondSideTime, 
      rating,
      recipe
    );
    
    return {
      firstSideTime: newFirstSideTime,
      secondSideTime: newSecondSideTime,
      confidence: confidence
    };
  }
  
  /**
   * Update recommendations for temperatures similar to the rated one
   */
  async updateNeighboringTemperatures(recipeId, ratedTemp, firstSideTime, secondSideTime, rating, recipe) {
    // Only update neighbors for positive ratings
    if (rating !== 'good' && rating !== 'mid') {
      return;
    }
    
    // Define the neighboring temperatures to update (±3)
    const neighbors = [];
    for (let t = Math.max(1, ratedTemp - 3); t <= Math.min(9, ratedTemp + 3); t++) {
      if (t !== ratedTemp) { // Skip the original temperature
        neighbors.push(t);
      }
    }
    
    // Update each neighboring temperature with reduced influence
    for (const neighborTemp of neighbors) {
      // Calculate the temperature difference
      const difference = Math.abs(ratedTemp - neighborTemp);
      
      // Skip if beyond our similarity matrix
      if (difference > 3) continue;
      
      // Get weight based on similarity
      const weight = this.temperatureSimilarity[difference];
      
      // Get current recommendation for this neighboring temperature
      const neighborRec = await db.getRecipeRecommendation(recipeId, neighborTemp);
      
      // Scale the learning rate by similarity weight and rating quality
      const scaledRate = (rating === 'good' ? 1 : 0.5) * weight * this.learningRates.initial;
      
      // Calculate temperature-adjusted target times
      const tempDiff = neighborTemp - ratedTemp;
      // Higher temp = less time needed
      const tempAdjustment = tempDiff * (recipe?.tempScaleFactor || 7);
      
      // Calculate neighbor adjustments
      let neighborFirstAdjust = ((firstSideTime - tempAdjustment) - neighborRec.firstSideTime) * scaledRate;
      let neighborSecondAdjust = ((secondSideTime - tempAdjustment * 0.8) - neighborRec.secondSideTime) * scaledRate;
      
      // Dampen adjustments for neighbors
      neighborFirstAdjust *= weight;
      neighborSecondAdjust *= weight;
      
      // Apply adjustments
      let newFirstSideTime = neighborRec.firstSideTime + neighborFirstAdjust;
      let newSecondSideTime = neighborRec.secondSideTime + neighborSecondAdjust;
      
      // Ensure times stay within min/max bounds
      const minTime = recipe?.minCookTime || this.minTime;
      const maxTime = recipe?.maxCookTime || this.maxTime;
      
      newFirstSideTime = Math.max(minTime, Math.min(maxTime, newFirstSideTime));
      newSecondSideTime = Math.max(minTime, Math.min(maxTime, newSecondSideTime));
      
      // Round to whole seconds
      newFirstSideTime = Math.round(newFirstSideTime);
      newSecondSideTime = Math.round(newSecondSideTime);
      
      // Save neighbor recommendations with slight confidence increase
      // Only count as a data point if there's an actual user rating (not a calculated neighbor adjustment)
      const actualPoints = Math.floor(neighborRec.dataPoints || 0);
      
      await db.saveRecipeRecommendation(recipeId, neighborTemp, {
        firstSideTime: newFirstSideTime,
        secondSideTime: newSecondSideTime,
        confidence: Math.min(1, (neighborRec.confidence || 0) + (weight * 0.05)),
        dataPoints: (actualPoints > 0) ? actualPoints + weight : 0 // Only increment if there's real history
      });
    }
  }
  
  /**
   * Calculate time adjustment based on rating
   */
  calculateAdjustment(actualTime, recommendedTime, ratingFactor, learningRate, temperature, recipe) {
    let adjustment = 0;
    
    if (ratingFactor > 0) {
      // For "good" ratings, move recommendation closer to actual time
      adjustment = (actualTime - recommendedTime) * learningRate;
    } else if (ratingFactor < 0) {
      // For "bad" ratings, analyze what might have gone wrong
      const timeDiff = actualTime - recommendedTime;
      
      if (Math.abs(timeDiff) < 15) { // Increased from 10
        // If timing was close but still bad, temperature might be the issue
        // Make a small adjustment in the opposite direction of the actual time
        adjustment = -timeDiff * learningRate * 0.4; // Reduced from 0.5
      } else if (timeDiff < 0) {
        // Actual time < recommended: pancake was likely undercooked
        // We need more time (increase recommendation)
        adjustment = -timeDiff * learningRate * 0.9; // Reduced from 1.2
      } else {
        // Actual time > recommended: pancake was likely overcooked
        // We need less time (decrease recommendation)
        adjustment = -timeDiff * learningRate * 0.9; // Reduced from 1.2
      }
    } else {
      // For "mid" ratings
      // If we're far off, make a moderate adjustment
      // If we're close, make a tiny adjustment
      const timeDiff = actualTime - recommendedTime;
      
      if (Math.abs(timeDiff) > 25) { // Increased from 20
        // Significant difference, make a moderate adjustment
        adjustment = timeDiff * learningRate * 0.6; // Reduced from 0.7
      } else {
        // Small difference, make a tiny adjustment
        adjustment = timeDiff * learningRate * 0.2; // Reduced from 0.3
      }
    }
    
    // Add smaller randomness to avoid getting stuck in local optima
    // Note: reduced from 0.5 to 0.2 for more stable recommendations
    const randomFactor = (Math.random() * 2 - 1) * learningRate * 0.2;
    adjustment += randomFactor;
    
    return adjustment;
  }
  
  /**
   * Gets the pancake cooking stage based on elapsed time and recommended time
   */
  getPancakeStage(elapsedSeconds, recommendedSeconds) {
    const percentage = (elapsedSeconds / recommendedSeconds) * 100;
    
    if (percentage < 20) return 'raw';
    if (percentage < 45) return 'cooking';
    if (percentage < 75) return 'medium';
    if (percentage < 95) return 'cooked';
    return 'burnt';
  }
  
  /**
   * Resets all recommendations for a recipe to defaults
   */
  async resetRecipeRecommendations(recipeId) {
    if (!recipeId) {
      recipeId = await db.getCurrentRecipeId();
    }
    
    // Get the recipe
    const recipe = await db.getRecipePreset(recipeId);
    
    // Clear existing recommendations
    await db.clearRecipeRecommendations(recipeId);
    
    // Create default recommendations for temperatures 1-9
    for (let temp = 1; temp <= 9; temp++) {
      const firstSideTime = db.getDefaultFirstSideTime(temp, recipe);
      const secondSideTime = db.getDefaultSecondSideTime(temp, recipe);
      
      await db.saveRecipeRecommendation(recipeId, temp, {
        firstSideTime,
        secondSideTime,
        confidence: 0,
        dataPoints: 0
      });
    }
    
    return true;
  }
}

export default new PancakeAlgorithm();
class PancakeDB {
  constructor() {
    this.dbName = 'perfectPancakeDB';
    this.dbVersion = 3; // Increased version for recipe presets
    this.db = null;
    this.isOpen = false;
  }

  async open() {
    if (this.isOpen) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        
        // Create or update stores based on version
        if (oldVersion < 1) {
          // Create pancake history store
          if (!db.objectStoreNames.contains('pancakeHistory')) {
            const historyStore = db.createObjectStore('pancakeHistory', { keyPath: 'id', autoIncrement: true });
            historyStore.createIndex('timestamp', 'timestamp', { unique: false });
            historyStore.createIndex('temperature', 'temperature', { unique: false });
            historyStore.createIndex('rating', 'rating', { unique: false });
          }
  
          // Create cooking recommendations store
          if (!db.objectStoreNames.contains('cookingRecommendations')) {
            const recommendationsStore = db.createObjectStore('cookingRecommendations', { keyPath: 'temperature' });
          }
        }
        
        // Version 2 additions
        if (oldVersion < 2) {
          // Create statistics store
          if (!db.objectStoreNames.contains('statistics')) {
            db.createObjectStore('statistics', { keyPath: 'id' });
          }
          
          // Create user preferences store
          if (!db.objectStoreNames.contains('userPreferences')) {
            db.createObjectStore('userPreferences', { keyPath: 'id' });
          }
        }
        
        // Version 3 additions - Recipe presets
        if (oldVersion < 3) {
          // Create recipe presets store
          if (!db.objectStoreNames.contains('recipePresets')) {
            const presetStore = db.createObjectStore('recipePresets', { keyPath: 'id', autoIncrement: true });
            presetStore.createIndex('name', 'name', { unique: true });
          }
          
          // Update pancake history and recommendations to include recipeId
          if (db.objectStoreNames.contains('pancakeHistory')) {
            // Can't modify schema of existing stores, but we can handle it in code
            // Will add recipeId field to new records
          }
          
          // Update cookingRecommendations to use composite key
          if (db.objectStoreNames.contains('cookingRecommendations')) {
            const oldStore = db.objectStoreNames.contains('cookingRecommendations');
            // We'll migrate the data in a separate function after upgrade
            // and modify how we access recommendations to use recipeId + temperature
            
            // Create new store with composite key
            if (!db.objectStoreNames.contains('recipeRecommendations')) {
              db.createObjectStore('recipeRecommendations', { keyPath: ['recipeId', 'temperature'] });
            }
          }
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isOpen = true;
        
        // Check if we need to migrate data for version 3
        if (event.oldVersion < 3 && event.newVersion >= 3) {
          this.migrateToRecipeBasedData();
        }
        
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Error opening database:', event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  // Helper to migrate data after version 3 upgrade
  async migrateToRecipeBasedData() {
    try {
      // Create default recipe preset
      const defaultRecipe = {
        name: 'Basic Pancakes',
        description: 'Standard pancake batter recipe',
        createdAt: new Date().getTime(),
        isDefault: true
      };
      
      const defaultRecipeId = await this.addRecipePreset(defaultRecipe);
      
      // Get all existing recommendations
      const oldRecommendations = await this.getAllRecommendations();
      
      // Migrate each recommendation to include the default recipe ID
      for (const rec of oldRecommendations) {
        await this.saveRecipeRecommendation(defaultRecipeId, rec.temperature, {
          firstSideTime: rec.firstSideTime,
          secondSideTime: rec.secondSideTime,
          confidence: rec.confidence || 0
        });
      }
      
      // Update all history records to include the default recipe ID
      const transaction = this.db.transaction(['pancakeHistory'], 'readwrite');
      const store = transaction.objectStore('pancakeHistory');
      const allHistory = await this.getAllHistory();
      
      for (const record of allHistory) {
        if (!record.recipeId) {
          record.recipeId = defaultRecipeId;
          store.put(record);
        }
      }
      
      // Save the default recipe ID as a user preference
      await this.saveUserPreference('currentRecipeId', defaultRecipeId);
      
      console.log('Data migration to recipe-based model complete');
    } catch (error) {
      console.error('Error migrating data:', error);
    }
  }

  // Recipe Preset Methods
  async addRecipePreset(recipe) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipePresets'], 'readwrite');
      const store = transaction.objectStore('recipePresets');
      const request = store.add(recipe);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getRecipePresets() {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipePresets'], 'readonly');
      const store = transaction.objectStore('recipePresets');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getRecipePreset(id) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipePresets'], 'readonly');
      const store = transaction.objectStore('recipePresets');
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateRecipePreset(recipe) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipePresets'], 'readwrite');
      const store = transaction.objectStore('recipePresets');
      const request = store.put(recipe);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async deleteRecipePreset(id) {
    await this.open();
    
    return new Promise(async (resolve, reject) => {
      try {
        // Check if this is the default recipe - don't allow deleting it
        const recipe = await this.getRecipePreset(id);
        if (recipe && recipe.isDefault) {
          reject(new Error("Cannot delete the default recipe preset"));
          return;
        }
        
        // Check if this is the current recipe
        const currentRecipeId = await this.getCurrentRecipeId();
        if (id === currentRecipeId) {
          // We need to switch to another recipe before deleting this one
          const recipes = await this.getRecipePresets();
          const defaultRecipe = recipes.find(r => r.isDefault);
          
          if (defaultRecipe) {
            // Switch to the default recipe
            await this.saveUserPreference('currentRecipeId', defaultRecipe.id);
          } else if (recipes.length > 1) {
            // Find another recipe that's not this one
            const otherRecipe = recipes.find(r => r.id !== id);
            if (otherRecipe) {
              await this.saveUserPreference('currentRecipeId', otherRecipe.id);
            }
          }
        }
        
        // Delete history records for this recipe
        const history = await this.getAllHistory(id);
        console.log(`Deleting ${history.length} history records for recipe ${id}`);
        
        for (const record of history) {
          await this.deletePancakeRecord(record.id);
        }
        
        // Delete recommendations for this recipe
        await this.clearRecipeRecommendations(id);
        
        // Finally delete the recipe
        const transaction = this.db.transaction(['recipePresets'], 'readwrite');
        const store = transaction.objectStore('recipePresets');
        const request = store.delete(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async getCurrentRecipeId() {
    // Get the current recipe ID from user preferences, or default to the first recipe
    const currentId = await this.getUserPreference('currentRecipeId');
    
    if (currentId) return currentId;
    
    // If no current recipe is set, find the default one
    const recipes = await this.getRecipePresets();
    const defaultRecipe = recipes.find(r => r.isDefault);
    
    if (defaultRecipe) {
      await this.saveUserPreference('currentRecipeId', defaultRecipe.id);
      return defaultRecipe.id;
    }
    
    // Fallback to the first recipe if no default exists
    if (recipes.length > 0) {
      await this.saveUserPreference('currentRecipeId', recipes[0].id);
      return recipes[0].id;
    }
    
    // No recipes exist yet - this shouldn't happen with proper migration
    console.error('No recipe presets found - creating default');
    const defaultId = await this.addRecipePreset({
      name: 'Basic Pancakes',
      description: 'Standard pancake batter recipe',
      createdAt: new Date().getTime(),
      isDefault: true
    });
    
    await this.saveUserPreference('currentRecipeId', defaultId);
    return defaultId;
  }
  
  // Updated Pancake History Methods
  async addPancakeRecord(record) {
    await this.open();
    
    // Ensure the record has a recipeId
    if (!record.recipeId) {
      record.recipeId = await this.getCurrentRecipeId();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pancakeHistory'], 'readwrite');
      const store = transaction.objectStore('pancakeHistory');
      const request = store.add(record);
      
      request.onsuccess = () => {
        // Update stats after adding a record
        this.updateStatistics(record);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deletePancakeRecord(id) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pancakeHistory'], 'readwrite');
      const store = transaction.objectStore('pancakeHistory');
      const request = store.delete(id);
      
      request.onsuccess = () => {
        // Update stats after deleting a record
        this.updateStatistics();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPancakeHistory(limit = 10, recipeId = null) {
    await this.open();
    
    // If no recipeId specified, get the current one
    if (!recipeId) {
      recipeId = await this.getCurrentRecipeId();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pancakeHistory'], 'readonly');
      const store = transaction.objectStore('pancakeHistory');
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');
      
      const history = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          
          // Only include records for the specified recipe
          if (!recipeId || record.recipeId === recipeId) {
            if (history.length < limit) {
              history.push(record);
            }
          }
          
          cursor.continue();
        } else {
          resolve(history);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async getAllHistory(recipeId = null) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pancakeHistory'], 'readonly');
      const store = transaction.objectStore('pancakeHistory');
      const request = store.getAll();
      
      request.onsuccess = () => {
        let history = request.result;
        
        // Filter by recipe if specified
        if (recipeId) {
          history = history.filter(item => item.recipeId === recipeId);
        }
        
        resolve(history);
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async getHistoryByTemperature(temperature, recipeId = null) {
    await this.open();
    
    // If no recipeId specified, get the current one
    if (!recipeId) {
      recipeId = await this.getCurrentRecipeId();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pancakeHistory'], 'readonly');
      const store = transaction.objectStore('pancakeHistory');
      const index = store.index('temperature');
      const range = IDBKeyRange.only(temperature);
      const request = index.getAll(range);
      
      request.onsuccess = () => {
        let history = request.result;
        
        // Filter by recipe if specified
        if (recipeId) {
          history = history.filter(item => item.recipeId === recipeId);
        }
        
        resolve(history);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Legacy method - redirects to recipe-based recommendation
  async saveRecommendation(temperature, recommendation) {
    const recipeId = await this.getCurrentRecipeId();
    return this.saveRecipeRecommendation(recipeId, temperature, recommendation);
  }
  
  async saveRecipeRecommendation(recipeId, temperature, recommendation) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipeRecommendations'], 'readwrite');
      const store = transaction.objectStore('recipeRecommendations');
      const request = store.put({
        recipeId,
        temperature,
        firstSideTime: recommendation.firstSideTime,
        secondSideTime: recommendation.secondSideTime,
        lastUpdated: new Date().getTime(),
        confidence: recommendation.confidence || 0,
        dataPoints: recommendation.dataPoints || 0
      });
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Legacy method - redirects to recipe-based recommendation
  async getRecommendation(temperature) {
    const recipeId = await this.getCurrentRecipeId();
    return this.getRecipeRecommendation(recipeId, temperature);
  }
  
  async getRecipeRecommendation(recipeId, temperature) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipeRecommendations'], 'readonly');
      const store = transaction.objectStore('recipeRecommendations');
      const request = store.get([recipeId, temperature]);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          // Check if we have a recipe without temperature data
          this.getRecipePreset(recipeId).then(recipe => {
            // Default recommendations if none exist for this temperature/recipe
            resolve({
              recipeId,
              temperature,
              firstSideTime: this.getDefaultFirstSideTime(temperature, recipe),
              secondSideTime: this.getDefaultSecondSideTime(temperature, recipe),
              lastUpdated: new Date().getTime(),
              confidence: 0,
              dataPoints: 0
            });
          }).catch(err => {
            // Fallback if recipe not found
            resolve({
              recipeId,
              temperature,
              firstSideTime: this.getDefaultFirstSideTime(temperature),
              secondSideTime: this.getDefaultSecondSideTime(temperature),
              lastUpdated: new Date().getTime(),
              confidence: 0,
              dataPoints: 0
            });
          });
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Legacy method - redirects to recipe-based recommendations
  async getAllRecommendations() {
    const recipeId = await this.getCurrentRecipeId();
    return this.getRecipeRecommendations(recipeId);
  }
  
  async getRecipeRecommendations(recipeId) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipeRecommendations'], 'readonly');
      const store = transaction.objectStore('recipeRecommendations');
      const request = store.getAll();
      
      request.onsuccess = () => {
        // Filter to only include recommendations for the specified recipe
        const recommendations = request.result.filter(rec => rec.recipeId === recipeId);
        resolve(recommendations);
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async clearRecipeRecommendations(recipeId) {
    await this.open();
    
    // Get all recommendations for this recipe
    const recommendations = await this.getRecipeRecommendations(recipeId);
    
    if (recommendations.length === 0) {
      return; // Nothing to clear
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['recipeRecommendations'], 'readwrite');
      const store = transaction.objectStore('recipeRecommendations');
      
      let completed = 0;
      let errors = 0;
      
      // Delete each recommendation
      recommendations.forEach(rec => {
        const request = store.delete([recipeId, rec.temperature]);
        
        request.onsuccess = () => {
          completed++;
          if (completed + errors === recommendations.length) {
            if (errors > 0) {
              reject(new Error(`Failed to delete ${errors} recommendations`));
            } else {
              resolve();
            }
          }
        };
        
        request.onerror = () => {
          console.error('Error deleting recommendation:', request.error);
          errors++;
          if (completed + errors === recommendations.length) {
            reject(new Error(`Failed to delete ${errors} recommendations`));
          }
        };
      });
    });
  }
  
  async updateStatistics(newRecord = null) {
    await this.open();
    
    try {
      // Get current recipe ID
      const recipeId = await this.getCurrentRecipeId();
      
      // Get all history for this recipe
      const history = await this.getAllHistory(recipeId);
      
      // Calculate statistics
      const stats = {
        id: `recipe_${recipeId}`,
        recipeId,
        totalPancakes: history.length,
        goodPancakes: history.filter(item => item.rating === 'good').length,
        midPancakes: history.filter(item => item.rating === 'mid').length,
        badPancakes: history.filter(item => item.rating === 'bad').length,
        averageFirstSideTime: 0,
        averageSecondSideTime: 0,
        popularTemperature: 0,
        bestTemperature: 0,
        lastUpdated: new Date().getTime()
      };
      
      // Calculate averages
      if (history.length > 0) {
        stats.averageFirstSideTime = Math.round(
          history.reduce((sum, item) => sum + item.firstSideTime, 0) / history.length
        );
        
        stats.averageSecondSideTime = Math.round(
          history.reduce((sum, item) => sum + (item.secondSideTime || 0), 0) / history.length
        );
        
        // Find most popular temperature
        const tempCounts = {};
        history.forEach(item => {
          tempCounts[item.temperature] = (tempCounts[item.temperature] || 0) + 1;
        });
        
        let maxCount = 0;
        for (const temp in tempCounts) {
          if (tempCounts[temp] > maxCount) {
            maxCount = tempCounts[temp];
            stats.popularTemperature = parseInt(temp);
          }
        }
        
        // Find best temperature (highest percentage of good ratings)
        const tempRatings = {};
        const tempGoodRatings = {};
        
        history.forEach(item => {
          tempRatings[item.temperature] = (tempRatings[item.temperature] || 0) + 1;
          if (item.rating === 'good') {
            tempGoodRatings[item.temperature] = (tempGoodRatings[item.temperature] || 0) + 1;
          }
        });
        
        let bestRatio = 0;
        for (const temp in tempRatings) {
          const goodRatio = (tempGoodRatings[temp] || 0) / tempRatings[temp];
          if (goodRatio > bestRatio && tempRatings[temp] >= 3) { // At least 3 ratings
            bestRatio = goodRatio;
            stats.bestTemperature = parseInt(temp);
          }
        }
      }
      
      // Save recipe-specific statistics
      await this.saveStatistics(stats);
      
      // Also update global statistics
      await this.updateGlobalStatistics();
      
      return stats;
    } catch (error) {
      console.error('Error updating statistics:', error);
      throw error;
    }
  }
  
  async updateGlobalStatistics() {
    // Get all history
    const history = await this.getAllHistory();
    
    // Calculate statistics
    const stats = {
      id: 'global',
      totalPancakes: history.length,
      goodPancakes: history.filter(item => item.rating === 'good').length,
      midPancakes: history.filter(item => item.rating === 'mid').length,
      badPancakes: history.filter(item => item.rating === 'bad').length,
      averageFirstSideTime: 0,
      averageSecondSideTime: 0,
      popularTemperature: 0,
      bestTemperature: 0,
      lastUpdated: new Date().getTime()
    };
    
    // Calculate averages
    if (history.length > 0) {
      stats.averageFirstSideTime = Math.round(
        history.reduce((sum, item) => sum + item.firstSideTime, 0) / history.length
      );
      
      stats.averageSecondSideTime = Math.round(
        history.reduce((sum, item) => sum + (item.secondSideTime || 0), 0) / history.length
      );
      
      // Find most popular temperature
      const tempCounts = {};
      history.forEach(item => {
        tempCounts[item.temperature] = (tempCounts[item.temperature] || 0) + 1;
      });
      
      let maxCount = 0;
      for (const temp in tempCounts) {
        if (tempCounts[temp] > maxCount) {
          maxCount = tempCounts[temp];
          stats.popularTemperature = parseInt(temp);
        }
      }
      
      // Find best temperature (highest percentage of good ratings)
      const tempRatings = {};
      const tempGoodRatings = {};
      
      history.forEach(item => {
        tempRatings[item.temperature] = (tempRatings[item.temperature] || 0) + 1;
        if (item.rating === 'good') {
          tempGoodRatings[item.temperature] = (tempGoodRatings[item.temperature] || 0) + 1;
        }
      });
      
      let bestRatio = 0;
      for (const temp in tempRatings) {
        const goodRatio = (tempGoodRatings[temp] || 0) / tempRatings[temp];
        if (goodRatio > bestRatio && tempRatings[temp] >= 3) { // At least 3 ratings
          bestRatio = goodRatio;
          stats.bestTemperature = parseInt(temp);
        }
      }
    }
    
    // Save global statistics
    await this.saveStatistics(stats);
    
    return stats;
  }
  
  async saveStatistics(stats) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['statistics'], 'readwrite');
      const store = transaction.objectStore('statistics');
      const request = store.put(stats);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getStatistics(recipeId = null) {
    await this.open();
    
    // If no recipeId specified, get the current one
    if (!recipeId) {
      recipeId = await this.getCurrentRecipeId();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['statistics'], 'readonly');
      const store = transaction.objectStore('statistics');
      const request = store.get(`recipe_${recipeId}`);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          // Try to get global statistics
          const globalRequest = store.get('global');
          
          globalRequest.onsuccess = () => {
            if (globalRequest.result) {
              resolve(globalRequest.result);
            } else {
              // Default empty statistics
              resolve({
                id: `recipe_${recipeId}`,
                recipeId,
                totalPancakes: 0,
                goodPancakes: 0,
                midPancakes: 0,
                badPancakes: 0,
                averageFirstSideTime: 0,
                averageSecondSideTime: 0,
                popularTemperature: 5,
                bestTemperature: 5,
                lastUpdated: new Date().getTime()
              });
            }
          };
          
          globalRequest.onerror = () => reject(globalRequest.error);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async getGlobalStatistics() {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['statistics'], 'readonly');
      const store = transaction.objectStore('statistics');
      const request = store.get('global');
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          // Default empty statistics
          resolve({
            id: 'global',
            totalPancakes: 0,
            goodPancakes: 0,
            midPancakes: 0,
            badPancakes: 0,
            averageFirstSideTime: 0,
            averageSecondSideTime: 0,
            popularTemperature: 5,
            bestTemperature: 5,
            lastUpdated: new Date().getTime()
          });
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async saveUserPreference(key, value) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['userPreferences'], 'readwrite');
      const store = transaction.objectStore('userPreferences');
      const request = store.put({
        id: key,
        value: value,
        lastUpdated: new Date().getTime()
      });
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async getUserPreference(key, defaultValue = null) {
    await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['userPreferences'], 'readonly');
      const store = transaction.objectStore('userPreferences');
      const request = store.get(key);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value);
        } else {
          resolve(defaultValue);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  getDefaultFirstSideTime(temperature, recipe = null) {
    // Initial recommendations based on temperature (in seconds)
    // Higher temperature = less time needed
    
    // Check if we have a recipe with specific base times
    let baseTime = 90; // Default: 1.5 minutes at temperature 5
    let tempScaleFactor = 10; // Default: reduce by 10 seconds per temperature level above 5
    
    if (recipe) {
      // If recipe has specific defaults, use those
      if (recipe.defaultBaseTime) {
        baseTime = recipe.defaultBaseTime;
      }
      
      // Thick batters need different scaling
      if (recipe.batterThickness === 'thick') {
        tempScaleFactor = 15; // Thicker batter is more affected by temperature
        baseTime = 110; // Thicker batter takes longer by default
      } else if (recipe.batterThickness === 'thin') {
        tempScaleFactor = 7; // Thinner batter is less affected by temperature
        baseTime = 70; // Thinner batter cooks faster by default
      } else {
        // Regular batter
        baseTime = 90;
        tempScaleFactor = 10;
      }
    }
    
    // Calculate time based on temperature
    const tempFactor = (temperature - 5) * tempScaleFactor;
    
    // Add small randomness to avoid identical suggestions for new recipes
    // This will only affect initial values since they'll be updated with feedback
    let initialValue = Math.round(baseTime - tempFactor);
    if (!recipe?.hasData) {
      // Add ±5% variance to initial recommendations to make it feel less mechanical
      const variance = initialValue * 0.05 * (Math.random() * 2 - 1);
      initialValue = Math.round(initialValue + variance);
    }
    
    // Ensure result is between min and max times
    const minTime = recipe?.minCookTime || 30;
    const maxTime = recipe?.maxCookTime || 240;
    
    return Math.max(minTime, Math.min(maxTime, initialValue));
  }

  getDefaultSecondSideTime(temperature, recipe = null) {
    // Second side typically cooks faster
    const firstSideTime = this.getDefaultFirstSideTime(temperature, recipe);
    
    // Different recipes have different ratios between first and second side
    let ratio = 0.8; // Default: second side cooks in 80% of the time
    
    if (recipe) {
      if (recipe.secondSideRatio) {
        ratio = recipe.secondSideRatio;
      }
    }
    
    return Math.round(firstSideTime * ratio);
  }
  
  // For debugging/diagnostics
  async dumpDatabaseInfo() {
    console.log("====== DATABASE DIAGNOSTICS ======");
    await this.open();
    
    try {
      // Get recipe info
      const recipes = await this.getRecipePresets();
      console.log("Recipes:", recipes);
      
      // Get current recipe
      const currentRecipeId = await this.getCurrentRecipeId();
      console.log("Current Recipe ID:", currentRecipeId);
      
      // Get recommendations
      if (currentRecipeId) {
        const recommendations = await this.getRecipeRecommendations(currentRecipeId);
        console.log("Current Recipe Recommendations:", recommendations);
      }
      
      // Get history
      const history = await this.getAllHistory();
      console.log("History Count:", history.length);
      
      // Get stats
      const stats = await this.getStatistics();
      console.log("Statistics:", stats);
      
      console.log("====== END DIAGNOSTICS ======");
      return true;
    } catch (error) {
      console.error("Error in diagnostics:", error);
      return false;
    }
  }
}

export default new PancakeDB();
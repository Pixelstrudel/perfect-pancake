import db from './db.js';
import timer from './timer.js';
import pancakeAlgorithm from './pancake-algorithm.js';

class PancakeApp {
  constructor() {
    // DOM Elements
    this.temperatureEl = document.getElementById('temperature');
    this.tempValueEl = document.getElementById('temp-value');
    this.pancakeEl = document.getElementById('pancake');
    this.pancakeContainer = document.getElementById('pancake-container');
    this.bubblesContainer = document.getElementById('bubbles-container');
    this.timerEl = document.getElementById('timer');
    this.actionBtn = document.getElementById('action-btn');
    this.ratingPanel = document.getElementById('rating-panel');
    this.ratingBtns = document.querySelectorAll('.rating-btn');
    this.suggestedTimeEl = document.getElementById('suggested-time');
    this.suggestedTempEl = document.getElementById('suggested-temp');
    this.historyListEl = document.getElementById('history-list');
    this.progressBar = document.getElementById('progress-bar');
    this.targetTimeEl = document.getElementById('target-time');
    this.recipeSelectEl = document.getElementById('recipe-select');
    this.newRecipeBtn = document.getElementById('new-recipe-btn');
    this.recipeNameEl = document.getElementById('recipe-name');
    this.recipeDescEl = document.getElementById('recipe-description');
    this.editRecipeBtn = document.getElementById('edit-recipe-btn');
    this.deleteRecipeBtn = document.getElementById('delete-recipe-btn');
    
    // Animation properties
    this.bubbleInterval = null;
    this.sizzleInterval = null;
    this.steamInterval = null;
    
    // Cooking phases
    this.PHASES = {
      READY: 'ready',
      FIRST_SIDE: 'firstSide',
      FLIP: 'flip',
      SECOND_SIDE: 'secondSide',
      DONE: 'done'
    };
    
    // App state
    this.state = {
      temperature: 5,
      phase: this.PHASES.READY,
      firstSideTime: 0,
      secondSideTime: 0,
      currentRecommendation: null,
      currentRecipe: null,
      recipes: [],
      autoFlip: true // Whether to automatically prompt for flipping at suggested time
    };
    
    // Initialize the app
    this.init();
  }
  
  async init() {
    // Event listeners
    this.temperatureEl.addEventListener('input', this.handleTemperatureChange.bind(this));
    this.actionBtn.addEventListener('click', this.handleActionButton.bind(this));
    this.ratingBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.handleRating(e.target.dataset.rating));
    });
    
    // Set up recipe selector
    if (this.recipeSelectEl) {
      this.recipeSelectEl.addEventListener('change', this.handleRecipeChange.bind(this));
    }
    
    // Set up recipe buttons
    if (this.newRecipeBtn) {
      // Make sure we're using the bound method
      const boundShowModal = this.showNewRecipeModal.bind(this);
      this.newRecipeBtn.addEventListener('click', boundShowModal);
      console.log("New recipe button initialized");
    }
    
    // Set up edit button
    if (this.editRecipeBtn) {
      this.editRecipeBtn.addEventListener('click', this.handleEditRecipe.bind(this));
      console.log("Edit recipe button initialized");
    }
    
    // Set up delete button
    if (this.deleteRecipeBtn) {
      this.deleteRecipeBtn.addEventListener('click', this.handleDeleteRecipe.bind(this));
      console.log("Delete recipe button initialized");
    }
    
    // Set initial temperature
    this.state.temperature = parseInt(this.temperatureEl.value);
    this.tempValueEl.textContent = this.state.temperature;
    
    // Load recipes and set current one
    await this.loadRecipes();
    
    // Load recommendation for current temperature and recipe
    await this.loadRecommendation();
    
    // Load history
    await this.loadHistory();
    
    // Add welcome animation
    this.pancakeContainer.classList.add('pulse-animation');
    setTimeout(() => this.pancakeContainer.classList.remove('pulse-animation'), 800);
    
    // Set up event delegation for history item actions
    this.historyListEl.addEventListener('click', this.handleHistoryItemAction.bind(this));
  }
  
  async loadRecipes() {
    try {
      // Diagnostic check
      console.log("loadRecipes called");
      
      // Dump database info
      await db.dumpDatabaseInfo();
      
      // Get all recipes
      const recipes = await db.getRecipePresets();
      console.log("Loaded recipes:", recipes);
      this.state.recipes = recipes;
      
      // Get current recipe ID
      const currentRecipeId = await db.getCurrentRecipeId();
      console.log("Current recipe ID:", currentRecipeId);
      
      this.state.currentRecipe = recipes.find(r => r.id === currentRecipeId);
      console.log("Current recipe:", this.state.currentRecipe);
      
      // Check if recipe selection exists
      console.log("Recipe selector element:", this.recipeSelectEl);
      
      // Update recipe selector UI if it exists
      if (this.recipeSelectEl) {
        this.recipeSelectEl.innerHTML = '';
        
        // If we don't have any recipes yet, create a default one
        if (recipes.length === 0) {
          console.log("No recipes found - creating default one");
          const defaultRecipe = {
            name: 'Basic Pancakes',
            description: 'Standard pancake batter recipe',
            batterThickness: 'regular',
            createdAt: new Date().getTime(),
            isDefault: true
          };
          
          const recipeId = await db.addRecipePreset(defaultRecipe);
          defaultRecipe.id = recipeId;
          
          await db.saveUserPreference('currentRecipeId', recipeId);
          this.state.recipes = [defaultRecipe];
          this.state.currentRecipe = defaultRecipe;
          
          const option = document.createElement('option');
          option.value = recipeId;
          option.textContent = defaultRecipe.name;
          option.selected = true;
          this.recipeSelectEl.appendChild(option);
        } else {
          // Add options for all existing recipes
          recipes.forEach(recipe => {
            const option = document.createElement('option');
            option.value = recipe.id;
            option.textContent = recipe.name;
            option.selected = recipe.id === currentRecipeId;
            this.recipeSelectEl.appendChild(option);
          });
        }
      }
      
      // Update recipe info display
      this.updateRecipeDisplay();
      
      // Update edit/delete button visibility based on if current recipe is default
      this.updateRecipeActionButtons();
      
    } catch (error) {
      console.error('Error loading recipes:', error);
      
      // If we fail to load recipes, create a default one
      try {
        if (!this.state.currentRecipe) {
          const defaultRecipe = {
            name: 'Basic Pancakes',
            description: 'Standard pancake batter recipe',
            batterThickness: 'regular',
            createdAt: new Date().getTime(),
            isDefault: true
          };
          
          const recipeId = await db.addRecipePreset(defaultRecipe);
          defaultRecipe.id = recipeId;
          
          await db.saveUserPreference('currentRecipeId', recipeId);
          this.state.recipes = [defaultRecipe];
          this.state.currentRecipe = defaultRecipe;
          
          // Update UI
          this.updateRecipeDisplay();
          this.updateRecipeActionButtons();
          
          console.log("Created default recipe as fallback");
          this.showToast("Created default recipe");
        }
      } catch (fallbackError) {
        console.error("Failed to create default recipe:", fallbackError);
      }
    }
  }
  
  updateRecipeDisplay() {
    // Update recipe name display if it exists
    if (this.recipeNameEl && this.state.currentRecipe) {
      this.recipeNameEl.textContent = this.state.currentRecipe.name;
    }
    
    // Update description if it exists
    if (this.recipeDescEl && this.state.currentRecipe) {
      this.recipeDescEl.textContent = this.state.currentRecipe.description || '';
    }
  }
  
  updateRecipeActionButtons() {
    // Hide or show recipe edit/delete buttons based on whether this is the default recipe
    if (this.editRecipeBtn && this.deleteRecipeBtn && this.state.currentRecipe) {
      const isDefault = this.state.currentRecipe.isDefault === true;
      
      this.editRecipeBtn.style.display = isDefault ? 'none' : 'block';
      this.deleteRecipeBtn.style.display = isDefault ? 'none' : 'block';
    }
  }
  
  async loadRecommendation() {
    try {
      const recommendation = await db.getRecommendation(this.state.temperature);
      this.state.currentRecommendation = recommendation;
      
      // Update UI with recommendation
      this.suggestedTimeEl.textContent = `${this.formatSeconds(recommendation.firstSideTime)} / ${this.formatSeconds(recommendation.secondSideTime)}`;
      this.targetTimeEl.textContent = this.formatSeconds(recommendation.firstSideTime);
      this.suggestedTempEl.textContent = this.state.temperature;
      
      // Update suggestion explanation based on confidence
      const explanationEl = document.getElementById('recommendation-explanation');
      if (explanationEl) {
        if (!recommendation.dataPoints || recommendation.dataPoints < 1) {
          explanationEl.textContent = "This is a starting suggestion. Rate your pancakes to improve it.";
        } else if (recommendation.dataPoints < 3) {
          explanationEl.textContent = `Based on ${Math.floor(recommendation.dataPoints)} tries. More feedback needed.`;
        } else if (recommendation.dataPoints < 7) {
          explanationEl.textContent = `Getting better! Based on ${Math.floor(recommendation.dataPoints)} tries.`;
        } else {
          explanationEl.textContent = `Well-tuned recommendation based on ${Math.floor(recommendation.dataPoints)} tries.`;
        }
      }
      
      // Update progress bar (reset to 0)
      this.progressBar.style.width = '0%';
      
      // Update confidence indicator if available
      const confidenceEl = document.getElementById('confidence-indicator');
      if (confidenceEl && recommendation.confidence !== undefined) {
        const confidencePercent = Math.min(100, Math.round(recommendation.confidence * 100));
        confidenceEl.style.width = `${confidencePercent}%`;
        
        // Change color based on confidence
        if (confidencePercent < 30) {
          confidenceEl.className = 'confidence low';
        } else if (confidencePercent < 70) {
          confidenceEl.className = 'confidence medium';
        } else {
          confidenceEl.className = 'confidence high';
        }
      }
    } catch (error) {
      console.error('Error loading recommendation:', error);
    }
  }
  
  async loadHistory() {
    try {
      const currentRecipeId = await db.getCurrentRecipeId();
      const history = await db.getPancakeHistory(20, currentRecipeId); // Show more history items
      this.renderHistory(history);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  }
  
  renderHistory(history) {
    this.historyListEl.innerHTML = '';
    
    if (history.length === 0) {
      this.historyListEl.innerHTML = '<div class="history-item empty-history">No cooking history yet</div>';
      return;
    }
    
    history.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.dataset.id = item.id;
      
      const ratingClass = `rating-${item.rating}`;
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleDateString();
      const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      historyItem.innerHTML = `
        <div class="history-item-content">
          <div class="history-main">
            <span class="rating-indicator ${ratingClass}"></span>
            <span class="history-temp">Level ${item.temperature}</span>
            <span class="history-times">${this.formatSeconds(item.firstSideTime)} / ${this.formatSeconds(item.secondSideTime)}</span>
          </div>
          <div class="history-date">${formattedDate} ${formattedTime}</div>
        </div>
        <button class="history-delete-btn" data-id="${item.id}" title="Delete this entry">×</button>
      `;
      
      this.historyListEl.appendChild(historyItem);
    });
    
    // Add clear history button if there are entries
    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'clear-history-btn';
    clearAllBtn.textContent = 'Clear All History';
    clearAllBtn.addEventListener('click', this.showClearHistoryConfirmation.bind(this));
    this.historyListEl.appendChild(clearAllBtn);
  }
  
  async handleHistoryItemAction(e) {
    // Check if delete button was clicked
    if (e.target.classList.contains('history-delete-btn')) {
      const itemId = parseInt(e.target.dataset.id);
      
      if (confirm('Delete this history entry?')) {
        try {
          await db.deletePancakeRecord(itemId);
          await this.loadHistory(); // Reload history
          await this.loadRecommendation(); // Reload recommendation as it may have changed
          
          // Show confirmation toast
          this.showToast('History entry deleted');
        } catch (error) {
          console.error('Error deleting history item:', error);
          this.showToast('Failed to delete entry', 'error');
        }
      }
    }
  }
  
  async showClearHistoryConfirmation() {
    if (confirm('Are you sure you want to clear all history for this recipe? This cannot be undone.')) {
      try {
        const recipeId = await db.getCurrentRecipeId();
        const history = await db.getAllHistory(recipeId);
        
        // Delete each history item for this recipe
        for (const item of history) {
          await db.deletePancakeRecord(item.id);
        }
        
        // Reset recommendations to defaults
        await pancakeAlgorithm.resetRecipeRecommendations(recipeId);
        
        // Reload everything
        await this.loadHistory();
        await this.loadRecommendation();
        
        this.showToast('All history cleared');
      } catch (error) {
        console.error('Error clearing history:', error);
        this.showToast('Failed to clear history', 'error');
      }
    }
  }
  
  showToast(message, type = 'info') {
    // Check if toast container exists, create if not
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  async handleRecipeChange(e) {
    const recipeId = parseInt(e.target.value);
    
    // Save selected recipe as current
    await db.saveUserPreference('currentRecipeId', recipeId);
    
    // Update state and UI
    this.state.currentRecipe = this.state.recipes.find(r => r.id === recipeId);
    
    // Update recipe display
    this.updateRecipeDisplay();
    
    // Update edit/delete button visibility
    this.updateRecipeActionButtons();
    
    // Reload recommendation and history
    await this.loadRecommendation();
    await this.loadHistory();
    
    // Show confirmation toast
    this.showToast(`Switched to ${this.state.currentRecipe.name}`);
  }
  
  async handleEditRecipe() {
    if (!this.state.currentRecipe) return;
    
    // Don't allow editing the default recipe
    if (this.state.currentRecipe.isDefault) {
      this.showToast("Cannot edit the default recipe", "error");
      return;
    }
    
    // Show edit modal with current recipe data
    this.showRecipeEditModal(this.state.currentRecipe);
  }
  
  async handleDeleteRecipe() {
    if (!this.state.currentRecipe) return;
    
    // Don't allow deleting the default recipe
    if (this.state.currentRecipe.isDefault) {
      this.showToast("Cannot delete the default recipe", "error");
      return;
    }
    
    // Confirm deletion
    if (confirm(`Are you sure you want to delete the recipe "${this.state.currentRecipe.name}"? This will also delete all history and recommendations for this recipe.`)) {
      try {
        await db.deleteRecipePreset(this.state.currentRecipe.id);
        
        // Show confirmation
        this.showToast(`Recipe "${this.state.currentRecipe.name}" deleted`);
        
        // Reload everything
        await this.loadRecipes();
        await this.loadRecommendation();
        await this.loadHistory();
      } catch (error) {
        console.error("Error deleting recipe:", error);
        this.showToast("Error deleting recipe: " + error.message, "error");
      }
    }
  }
  
  showRecipeEditModal(recipe) {
    console.log("Editing recipe:", recipe);
    
    // Remove any existing modals first
    const existingBackdrops = document.querySelectorAll('.modal-backdrop');
    existingBackdrops.forEach(el => el.remove());
    
    const existingModals = document.querySelectorAll('.modal');
    existingModals.forEach(el => el.remove());
    
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'recipe-edit-modal';
    
    // Modal content
    modal.innerHTML = `
      <h2>Edit Recipe</h2>
      <form id="edit-recipe-form">
        <div class="form-group">
          <label for="edit-recipe-name">Recipe Name:</label>
          <input type="text" id="edit-recipe-name" required placeholder="e.g., Buttermilk Pancakes" value="${recipe.name}">
        </div>
        <div class="form-group">
          <label for="edit-recipe-description">Description (optional):</label>
          <textarea id="edit-recipe-description" placeholder="Describe your recipe...">${recipe.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="edit-batter-thickness">Batter Thickness:</label>
          <select id="edit-batter-thickness">
            <option value="regular" ${recipe.batterThickness === 'regular' ? 'selected' : ''}>Regular</option>
            <option value="thin" ${recipe.batterThickness === 'thin' ? 'selected' : ''}>Thin</option>
            <option value="thick" ${recipe.batterThickness === 'thick' ? 'selected' : ''}>Thick</option>
          </select>
        </div>
        <input type="hidden" id="edit-recipe-id" value="${recipe.id}">
        <div class="form-actions">
          <button type="button" class="cancel-btn">Cancel</button>
          <button type="submit" class="create-btn">Save Changes</button>
        </div>
      </form>
    `;
    
    // Add to DOM
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    
    // Force the browser to recognize the modal
    setTimeout(() => {
      const modalEl = document.getElementById('recipe-edit-modal');
      if (modalEl) {
        // Force reflow
        modalEl.style.opacity = 0.99;
        setTimeout(() => {
          modalEl.style.opacity = 1;
        }, 10);
      }
    }, 10);
    
    // Setup event listeners
    const cancelBtn = modal.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
      backdrop.remove();
      modal.remove();
    });
    
    // Clicking backdrop also closes modal
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        modal.remove();
      }
    });
    
    // Form submission
    const form = modal.querySelector('#edit-recipe-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const nameInput = document.getElementById('edit-recipe-name');
      const descInput = document.getElementById('edit-recipe-description');
      const thicknessSelect = document.getElementById('edit-batter-thickness');
      const recipeIdInput = document.getElementById('edit-recipe-id');
      
      if (!nameInput || !recipeIdInput) {
        console.error("Form elements not found");
        this.showToast('Error finding form elements', 'error');
        return;
      }
      
      const name = nameInput.value.trim();
      const description = descInput.value.trim();
      const batterThickness = thicknessSelect.value;
      const recipeId = parseInt(recipeIdInput.value);
      
      if (!name) {
        this.showToast('Please enter a recipe name', 'error');
        return;
      }
      
      try {
        // Get the existing recipe to preserve other properties
        const existingRecipe = await db.getRecipePreset(recipeId);
        if (!existingRecipe) {
          throw new Error("Recipe not found");
        }
        
        // Update the recipe
        const updatedRecipe = {
          ...existingRecipe,
          name,
          description,
          batterThickness,
          lastUpdated: new Date().getTime()
        };
        
        // Update batter-specific properties
        if (batterThickness === 'thick') {
          updatedRecipe.defaultBaseTime = 110; // Thicker batter takes longer
          updatedRecipe.tempScaleFactor = 15; // More affected by temperature
          updatedRecipe.secondSideRatio = 0.75; // Second side ratio
        } else if (batterThickness === 'thin') {
          updatedRecipe.defaultBaseTime = 70; // Thinner batter cooks faster
          updatedRecipe.tempScaleFactor = 7; // Less affected by temperature
          updatedRecipe.secondSideRatio = 0.9; // Second side ratio (closer to first side)
        } else {
          // Regular batter
          updatedRecipe.defaultBaseTime = 90;
          updatedRecipe.tempScaleFactor = 10;
          updatedRecipe.secondSideRatio = 0.8;
        }
        
        console.log("Saving updated recipe:", updatedRecipe);
        
        // Save the updated recipe
        await db.updateRecipePreset(updatedRecipe);
        
        // Update the state
        const recipeIndex = this.state.recipes.findIndex(r => r.id === recipeId);
        if (recipeIndex >= 0) {
          this.state.recipes[recipeIndex] = updatedRecipe;
        }
        
        if (this.state.currentRecipe.id === recipeId) {
          this.state.currentRecipe = updatedRecipe;
        }
        
        // Reload everything
        await this.loadRecipes();
        await this.loadRecommendation(); 
        
        // Close modal
        backdrop.remove();
        modal.remove();
        
        // Show confirmation
        this.showToast(`Recipe "${name}" updated successfully`);
      } catch (error) {
        console.error('Error updating recipe:', error);
        this.showToast('Failed to update recipe: ' + error.message, 'error');
      }
    });
  }
  
  showNewRecipeModal() {
    console.log("showNewRecipeModal called"); // Debug log
    
    // Remove any existing modals first (in case one is already open)
    const existingBackdrops = document.querySelectorAll('.modal-backdrop');
    existingBackdrops.forEach(el => el.remove());
    
    const existingModals = document.querySelectorAll('.modal');
    existingModals.forEach(el => el.remove());
    
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'recipe-modal';
    
    // Modal content
    modal.innerHTML = `
      <h2>Create New Recipe Preset</h2>
      <form id="new-recipe-form">
        <div class="form-group">
          <label for="recipe-name-input">Recipe Name:</label>
          <input type="text" id="recipe-name-input" required placeholder="e.g., Buttermilk Pancakes">
        </div>
        <div class="form-group">
          <label for="recipe-description-input">Description (optional):</label>
          <textarea id="recipe-description-input" placeholder="Describe your recipe..."></textarea>
        </div>
        <div class="form-group">
          <label for="batter-thickness">Batter Thickness:</label>
          <select id="batter-thickness">
            <option value="regular">Regular</option>
            <option value="thin">Thin</option>
            <option value="thick">Thick</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="cancel-btn">Cancel</button>
          <button type="submit" class="create-btn">Create Recipe</button>
        </div>
      </form>
    `;
    
    // Add to DOM
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    
    // Force the browser to recognize the modal
    setTimeout(() => {
      const modalEl = document.getElementById('recipe-modal');
      if (modalEl) {
        // Force reflow
        modalEl.style.opacity = 0.99;
        setTimeout(() => {
          modalEl.style.opacity = 1;
        }, 10);
      }
    }, 10);
    
    console.log("Modal added to DOM"); // Debug log
    
    // Setup event listeners
    const cancelBtn = modal.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
      backdrop.remove();
      modal.remove();
    });
    
    // Clicking backdrop also closes modal
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        modal.remove();
      }
    });
    
    // Escape key closes modal
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape') {
        backdrop.remove();
        modal.remove();
        document.removeEventListener('keydown', handleEscapeKey);
      }
    };
    document.addEventListener('keydown', handleEscapeKey);
    
    // Form submission
    const form = modal.querySelector('#new-recipe-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log("Form submitted"); // Debug log
      
      const nameInput = document.getElementById('recipe-name-input');
      const descInput = document.getElementById('recipe-description-input'); // Fixed the ID
      const thicknessSelect = document.getElementById('batter-thickness');
      
      if (!nameInput || !descInput || !thicknessSelect) {
        console.error("Form elements not found:", {
          nameInput,
          descInput,
          thicknessSelect
        });
        this.showToast('Error finding form elements', 'error');
        return;
      }
      
      const name = nameInput.value.trim();
      const description = descInput.value.trim();
      const batterThickness = thicknessSelect.value;
      
      console.log("Form values:", { name, description, batterThickness }); // Debug log
      
      if (!name) {
        this.showToast('Please enter a recipe name', 'error');
        return;
      }
      
      try {
        // Create new recipe preset
        const newRecipe = {
          name,
          description,
          batterThickness,
          createdAt: new Date().getTime()
        };
        
        // Add initial cook time adjustments based on batter thickness
        if (batterThickness === 'thick') {
          newRecipe.defaultBaseTime = 110; // Thicker batter takes longer
          newRecipe.tempScaleFactor = 15; // More affected by temperature
          newRecipe.secondSideRatio = 0.75; // Second side ratio
        } else if (batterThickness === 'thin') {
          newRecipe.defaultBaseTime = 70; // Thinner batter cooks faster
          newRecipe.tempScaleFactor = 7; // Less affected by temperature
          newRecipe.secondSideRatio = 0.9; // Second side ratio (closer to first side)
        }
        
        console.log("Saving recipe:", newRecipe); // Debug log
        
        // Save the recipe
        const recipeId = await db.addRecipePreset(newRecipe);
        newRecipe.id = recipeId;
        
        console.log("Recipe saved with ID:", recipeId); // Debug log
        
        // Initialize recommendations for this recipe
        await pancakeAlgorithm.resetRecipeRecommendations(recipeId);
        
        // Set as current recipe
        await db.saveUserPreference('currentRecipeId', recipeId);
        
        // Update state
        this.state.recipes.push(newRecipe);
        this.state.currentRecipe = newRecipe;
        
        // Reload everything
        await this.loadRecipes();
        await this.loadRecommendation();
        await this.loadHistory();
        
        // Close modal
        backdrop.remove();
        modal.remove();
        
        // Show confirmation
        this.showToast(`Recipe "${name}" created successfully`);
      } catch (error) {
        console.error('Error creating recipe:', error);
        this.showToast('Failed to create recipe', 'error');
      }
    });
  }
  
  handleTemperatureChange(e) {
    // Only allow temperature changes when not cooking
    if (this.state.phase !== this.PHASES.READY) return;
    
    this.state.temperature = parseInt(e.target.value);
    this.tempValueEl.textContent = this.state.temperature;
    
    // Add visual feedback
    this.tempValueEl.classList.add('pulse-animation');
    setTimeout(() => this.tempValueEl.classList.remove('pulse-animation'), 300);
    
    this.loadRecommendation();
  }
  
  handleActionButton() {
    // Handle different phases with a single button
    switch (this.state.phase) {
      case this.PHASES.READY:
        this.startCooking();
        break;
      case this.PHASES.FIRST_SIDE:
        this.flipPancake();
        break;
      case this.PHASES.SECOND_SIDE:
        this.finishCooking();
        break;
      default:
        // If we're in DONE phase, this shouldn't happen
        // If we're in FLIP phase, wait for animation to complete
        break;
    }
  }
  
  startCooking() {
    // Reset the app state for a new cooking session
    this.state.phase = this.PHASES.FIRST_SIDE;
    this.state.firstSideTime = 0;
    this.state.secondSideTime = 0;
    
    // Update UI
    this.actionBtn.textContent = 'Flip Pancake';
    this.actionBtn.classList.add('cooking');
    this.ratingPanel.classList.add('hidden');
    this.ratingPanel.classList.remove('visible');
    this.pancakeEl.className = 'raw';
    
    // Add visual feedback
    this.actionBtn.classList.add('pulse-animation');
    setTimeout(() => this.actionBtn.classList.remove('pulse-animation'), 300);
    
    // Start the timer
    timer.reset();
    timer.start(this.updateTimerDisplay.bind(this));
    
    // Start animations
    this.startCookingAnimations();
  }
  
  flipPancake() {
    // Save the time for the first side
    this.state.firstSideTime = timer.getElapsedInSeconds();
    this.state.phase = this.PHASES.FLIP;
    
    // Update UI during flip
    this.actionBtn.textContent = 'Flipping...';
    this.actionBtn.disabled = true;
    this.actionBtn.classList.remove('cooking');
    this.actionBtn.classList.add('flipping');
    
    // Stop animations temporarily
    this.stopCookingAnimations();
    
    // Create and add a flip effect element
    const flipEffect = document.createElement('div');
    flipEffect.className = 'flip-effect';
    this.pancakeContainer.appendChild(flipEffect);
    
    // Store current pancake color class
    const currentColorClass = this.pancakeEl.className;
    
    // Add flip animation
    this.pancakeEl.classList.add('flip-pancake');
    
    // Add sizzle sound effect (if browser allows)
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRjQFAABXQVZFZm10IBAAAAABAAEAgD4AAIA+AAABAAgAZGF0YRAFAACAgICAgICAgICAgICAgICAgICAgICBgYGBgYGBgYGBgYGBgoKCgoKCgoKCgoKCgoKDg4ODg4ODg4ODg4ODg4SEhISEhISEhISEhISEhYWFhYWFhYWFhYWFhYWGhoaGhoaGhoaGhoaGhoeHh4eHh4eHh4eHh4eHiIiIiIiIiIiIiIiIiImJiYmJiYmJiYmJiYmJioqKioqKioqKioqKiouLi4uLi4uLi4uLi4uLjIyMjIyMjIyMjIyMjIyNjY2NjY2NjY2NjY2Njo6Ojo6Ojo6Ojo6Ojo+Pj4+Pj4+Pj4+Pj4+QkJCQkJCQkJCQkJCQkJGRkZGRkZGRkZGRkZGRkpKSkpKSkpKSkpKSkpKTk5OTk5OTk5OTk5OTlJSUlJSUlJSUlJSUlJSVlZWVlZWVlZWVlZWVlpaWlpaWlpaWlpaWlpaXl5eXl5eXl5eXl5eXmJiYmJiYmJiYmJiYmJiZmZmZmZmZmZmZmZmZmpqampqampqampqampqbm5ubm5ubm5ubm5ubm5ycnJycnJycnJycnJycnZ2dnZ2dnZ2dnZ2dnZ2enp6enp6enp6enp6enp+fn5+fn5+fn5+fn5+foKCgoKCgoKCgoKCgoKChoaGhoaGhoaGhoaGhoaKioqKioqKioqKioqKio6Ojo6Ojo6Ojo6Ojo6OkpKSkpKSkpKSkpKSkpKWlpaWlpaWlpaWlpaWlpqampqampqampqampqanp6enp6enp6enp6enp6ioqKioqKioqKioqKioqampqampqampqampqaqqqqqqqqqqqqqqqqqqq6urq6urq6urq6urq6usrKysrKysrKysrKysrK2tra2tra2tra2tra2trq6urq6urq6urq6urq6vr6+vr6+vr6+vr6+vr7CwsLCwsLCwsLCwsLCwsbGxsbGxsbGxsbGxsbGysrKysrKysrKysrKysrOzs7Ozs7Ozs7Ozs7OztLS0tLS0tLS0tLS0tLS1tbW1tbW1tbW1tbW1tba2tra2tra2tra2tra2t7e3t7e3t7e3t7e3t7e4uLi4uLi4uLi4uLi4uLm5ubm5ubm5ubm5ubm5urq6urq6urq6urq6urq7u7u7u7u7u7u7u7u7u7y8vLy8vLy8vLy8vLy8vb29vb29vb29vb29vb2+vr6+vr6+vr6+vr6+vr+/v7+/v7+/v7+/v7+/wMDAwMDAwMDAwMDAwMDBwcHBwcHBwcHBwcHBwcLCwsLCwsLCwsLCwsLCw8PDw8PDw8PDw8PDw8PExMTExMTExMTExMTExMXFxcXFxcXFxcXFxcXFxsbGxsbGxsbGxsbGxsbHx8fHx8fHx8fHx8fHx8jIyMjIyMjIyMjIyMjIycnJycnJycnJycnJycnKysrKysrKysrKysrKysvLy8vLy8vLy8vLy8vLzMzMzMzMzMzMzMzMzMzNzc3Nzc3Nzc3Nzc3Nzc7Ozs7Ozs7Ozs7Ozs7Oz8/Pz8/Pz8/Pz8/Pz8/Q0NDQ0NDQ0NDQ0NDQ0NHR0dHR0dHR0dHR0dHR0tLS0tLS0tLS0tLS0tLS09PT09PT09PT09PT09PT1NTU1NTU1NTU1NTU1NTV1dXV1dXV1dXV1dXV1dbW1tbW1tbW1tbW1tbW19fX19fX19fX19fX19fY2NjY2NjY2NjY2NjY2NnZ2dnZ2dnZ2dnZ2dnZ2tra2tra2tra2tra2tra29vb29vb29vb29vb29vc3Nzc3Nzc3Nzc3Nzc3N3d3d3d3d3d3d3d3d3d3t7e3t7e3t7e3t7e3t7f39/f39/f39/f39/f39/g4ODg4ODg4ODg4ODg4OHh4eHh4eHh4eHh4eHh4uLi4uLi4uLi4uLi4uLj4+Pj4+Pj4+Pj4+Pj4+Tk5OTk5OTk5OTk5OTk5eXl5eXl5eXl5eXl5eXm5ubm5ubm5ubm5ubm5ufn5+fn5+fn5+fn5+fn6Ojo6Ojo6Ojo6Ojo6Ojp6enp6enp6enp6enp6erq6urq6urq6urq6urq6+vr6+vr6+vr6+vr6+vs7Ozs7Ozs7Ozs7Ozs7O3t7e3t7e3t7e3t7e3t7u7u7u7u7u7u7u7u7u7v7+/v7+/v7+/v7+/v7/Dw8PDw8PDw8PDw8PDw8fHx8fHx8fHx8fHx8fHy8vLy8vLy8vLy8vLy8vPz8/Pz8/Pz8/Pz8/Pz9PT09PT09PT09PT09PT19fX19fX19fX19fX19fbFxcXGwb+9u7u7uru7uLazr6ypqamopqKakIyHg39+fnx4cGZjY2NgXlxZVlNTU1FRT01MS0tKSkpKSkpKSkpLS0tLTU1OT1FSU1ZXWVtdYGRpbnN3e4CChYeKjpSdqLW8wMDBwcLDygAA');
      audio.volume = 0.2;
      audio.play();
    } catch (e) {
      // Silently fail if audio not supported
    }
    
    setTimeout(() => {
      // Animation complete - remove flip effect
      if (flipEffect.parentNode === this.pancakeContainer) {
        flipEffect.remove();
      }
      
      this.pancakeEl.classList.remove('flip-pancake');
      this.pancakeEl.className = 'raw';
      
      // Reset timer for second side
      timer.reset();
      timer.start(this.updateTimerDisplay.bind(this));
      
      // Update target time for second side
      this.targetTimeEl.textContent = this.formatSeconds(this.state.currentRecommendation.secondSideTime);
      
      // Reset progress bar for second side
      this.progressBar.style.width = '0%';
      
      // Update UI
      this.state.phase = this.PHASES.SECOND_SIDE;
      this.actionBtn.textContent = `Done Cooking (${this.formatSeconds(this.state.currentRecommendation.secondSideTime)})`;
      this.actionBtn.disabled = false;
      this.actionBtn.classList.remove('flipping');
      this.actionBtn.classList.add('done');
      
      // Show a toast with second side recommendation
      this.showToast(`Second side: ${this.formatSeconds(this.state.currentRecommendation.secondSideTime)} recommended`);
      
      // Restart animations
      this.startCookingAnimations();
    }, 1200);
  }
  
  finishCooking() {
    // Save the time for the second side
    this.state.secondSideTime = timer.getElapsedInSeconds();
    this.state.phase = this.PHASES.DONE;
    
    // Stop the timer
    timer.pause();
    
    // Stop animations
    this.stopCookingAnimations();
    
    // Update UI
    this.actionBtn.textContent = 'Start Cooking';
    this.actionBtn.classList.remove('done');
    
    // Show rating panel with animation
    this.ratingPanel.classList.remove('hidden');
    setTimeout(() => this.ratingPanel.classList.add('visible'), 50);
  }
  
  async handleRating(rating) {
    // Add feedback animation
    const clickedBtn = document.querySelector(`.rating-btn[data-rating="${rating}"]`);
    clickedBtn.classList.add('pulse-animation');
    
    // Get current recipe ID
    const recipeId = await db.getCurrentRecipeId();
    
    // Save pancake record to history with recipe ID
    const record = {
      temperature: this.state.temperature,
      firstSideTime: this.state.firstSideTime,
      secondSideTime: this.state.secondSideTime,
      rating: rating,
      recipeId: recipeId,
      timestamp: new Date().getTime()
    };
    
    try {
      await db.addPancakeRecord(record);
      
      // Update recommendation based on rating with recipe ID
      if (this.state.firstSideTime > 0) {
        await pancakeAlgorithm.updateRecommendation(
          this.state.temperature,
          this.state.firstSideTime,
          this.state.secondSideTime,
          rating,
          recipeId
        );
      }
      
      // Reload recommendation and history
      await this.loadRecommendation();
      await this.loadHistory();
      
      // Create feedback message based on rating
      let feedbackMessage = "";
      if (rating === "good") {
        feedbackMessage = "Great! Recipe updated for perfect results";
      } else if (rating === "mid") {
        feedbackMessage = "Thanks for the feedback. Making slight adjustments";
      } else if (rating === "bad") {
        feedbackMessage = "Sorry it didn't turn out well. Adjusting recipe";
      }
      
      // Show feedback toast
      if (feedbackMessage) {
        this.showToast(feedbackMessage);
      }
      
      // Hide the rating panel with animation
      this.ratingPanel.classList.remove('visible');
      setTimeout(() => {
        this.ratingPanel.classList.add('hidden');
        
        // Reset to ready state
        this.state.phase = this.PHASES.READY;
        
        // Add completion animation
        this.actionBtn.classList.add('pulse-animation');
        setTimeout(() => this.actionBtn.classList.remove('pulse-animation'), 500);
      }, 500);
    } catch (error) {
      console.error('Error saving pancake record:', error);
      this.showToast('Failed to save rating', 'error');
    }
  }
  
  updateTimerDisplay(elapsed) {
    this.timerEl.textContent = timer.formatElapsedTime();
    
    // Get current phase-specific data
    const elapsedSeconds = Math.floor(elapsed / 1000);
    const isFirstSide = this.state.phase === this.PHASES.FIRST_SIDE;
    const recommendedTime = isFirstSide 
      ? this.state.currentRecommendation.firstSideTime 
      : this.state.currentRecommendation.secondSideTime;
    
    // Update progress bar
    const progressPercentage = Math.min((elapsedSeconds / recommendedTime) * 100, 100);
    this.progressBar.style.width = `${progressPercentage}%`;
    
    // Update pancake stage
    const stage = pancakeAlgorithm.getPancakeStage(elapsedSeconds, recommendedTime);
    this.pancakeEl.className = stage;
    
    // Check if we're approaching recommended time and add visual cue
    const timeLeftSeconds = recommendedTime - elapsedSeconds;
    
    if (timeLeftSeconds <= 5 && timeLeftSeconds > 0) {
      // Visual alert when close to recommended time
      this.timerEl.style.color = '#f44336'; // Red color
      
      if (!this.timerEl.classList.contains('pulse-animation')) {
        this.timerEl.classList.add('pulse-animation');
      }
      
      // Make the action button pulse too
      if (!this.actionBtn.classList.contains('pulse-animation')) {
        this.actionBtn.classList.add('pulse-animation');
      }
    } else {
      this.timerEl.style.color = ''; // Reset to default
      this.timerEl.classList.remove('pulse-animation');
      this.actionBtn.classList.remove('pulse-animation');
    }
    
    // Auto-suggest flipping when time is reached (if enabled)
    if (isFirstSide && this.state.autoFlip && elapsedSeconds >= recommendedTime && !this.actionBtn.classList.contains('highlight')) {
      this.actionBtn.classList.add('pulse-animation');
      
      // Add a subtle notification sound (if browser allows)
      try {
        const audio = new Audio('data:audio/wav;base64,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');
        audio.volume = 0.3;
        audio.play();
      } catch (e) {
        // Silently fail if audio not supported
      }
    }
  }
  
  startCookingAnimations() {
    // Clear any existing intervals
    this.stopCookingAnimations();
    
    // Create bubbles randomly
    this.bubbleInterval = setInterval(() => {
      // Only create bubbles for raw and cooking stages
      const currentClass = this.pancakeEl.className;
      if (currentClass === 'raw' || currentClass === 'cooking') {
        this.createBubble();
      }
    }, 300); // More frequent bubbles
    
    // Create sizzle spots
    this.sizzleInterval = setInterval(() => {
      this.createSizzleSpot();
    }, 200);
    
    // Create steam
    this.steamInterval = setInterval(() => {
      const currentClass = this.pancakeEl.className;
      if (currentClass === 'medium' || currentClass === 'cooked' || currentClass === 'burnt') {
        this.createSteam();
      }
    }, 800);
  }
  
  stopCookingAnimations() {
    // Clear intervals
    [this.bubbleInterval, this.sizzleInterval, this.steamInterval].forEach(interval => {
      if (interval) {
        clearInterval(interval);
      }
    });
    
    this.bubbleInterval = null;
    this.sizzleInterval = null;
    this.steamInterval = null;
    
    // Remove all existing animation elements
    this.bubblesContainer.innerHTML = '';
  }
  
  createBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    // Random size between 2px and 5px
    const size = Math.floor(Math.random() * 4) + 2;
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    
    // Random position on the pancake
    const pancakeRect = this.pancakeEl.getBoundingClientRect();
    const containerRect = this.bubblesContainer.getBoundingClientRect();
    
    // Calculate center and radius
    const centerX = pancakeRect.left - containerRect.left + (pancakeRect.width / 2);
    const centerY = pancakeRect.top - containerRect.top + (pancakeRect.height / 2);
    const radius = (pancakeRect.width / 2) * 0.8; // Keep bubbles within 80% of radius
    
    // Random angle and distance from center (polar coordinates)
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    
    // Convert to Cartesian coordinates
    const left = centerX + Math.cos(angle) * distance;
    const top = centerY + Math.sin(angle) * distance;
    
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    
    // Random animation duration
    const duration = Math.random() * 1.2 + 1;
    bubble.style.animationDuration = `${duration}s`;
    
    // Add to container and remove after animation
    this.bubblesContainer.appendChild(bubble);
    setTimeout(() => {
      if (bubble.parentNode === this.bubblesContainer) {
        bubble.remove();
      }
    }, duration * 1000 + 100);
  }
  
  createSizzleSpot() {
    const spot = document.createElement('div');
    spot.className = 'sizzle-spot';
    
    // Random size for varied effect
    const size = Math.floor(Math.random() * 2) + 2;
    spot.style.width = `${size}px`;
    spot.style.height = `${size}px`;
    
    // Random position around the pancake edge
    const pancakeRect = this.pancakeEl.getBoundingClientRect();
    const containerRect = this.bubblesContainer.getBoundingClientRect();
    
    // Calculate pancake center relative to container
    const centerX = pancakeRect.left - containerRect.left + (pancakeRect.width / 2);
    const centerY = pancakeRect.top - containerRect.top + (pancakeRect.height / 2);
    const radius = (pancakeRect.width / 2);
    
    // Position spots right at the edge of the pancake
    const angle = Math.random() * Math.PI * 2;
    const edgeRadius = radius * (0.98 + Math.random() * 0.05); // Very close to the edge
    
    const left = centerX + Math.cos(angle) * edgeRadius;
    const top = centerY + Math.sin(angle) * edgeRadius;
    
    spot.style.left = `${left}px`;
    spot.style.top = `${top}px`;
    
    // Vary the animation duration slightly
    const duration = Math.random() * 0.4 + 0.6;
    spot.style.animationDuration = `${duration}s`;
    
    // Add to container and remove after animation
    this.bubblesContainer.appendChild(spot);
    setTimeout(() => {
      if (spot.parentNode === this.bubblesContainer) {
        spot.remove();
      }
    }, duration * 1000 + 100);
  }
  
  createSteam() {
    const steam = document.createElement('div');
    steam.className = 'steam';
    
    // Random size for steam puff
    const size = Math.floor(Math.random() * 10) + 8;
    steam.style.width = `${size}px`;
    steam.style.height = `${size}px`;
    
    // Random position above the pancake surface
    const pancakeRect = this.pancakeEl.getBoundingClientRect();
    const containerRect = this.bubblesContainer.getBoundingClientRect();
    
    // Calculate center and radius
    const centerX = pancakeRect.left - containerRect.left + (pancakeRect.width / 2);
    const centerY = pancakeRect.top - containerRect.top + (pancakeRect.height / 2);
    const radius = (pancakeRect.width / 2) * 0.7; // Steam comes from within the pancake
    
    // Random angle and distance from center (polar coordinates)
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    
    // Convert to Cartesian coordinates
    const left = centerX + Math.cos(angle) * distance;
    const top = centerY + Math.sin(angle) * distance;
    
    steam.style.left = `${left}px`;
    steam.style.top = `${top}px`;
    
    // Random animation duration
    const duration = Math.random() * 2 + 2.5;
    steam.style.animationDuration = `${duration}s`;
    
    // Create a more realistic steam effect
    const opacity = (Math.random() * 0.2 + 0.3).toFixed(2);
    steam.style.opacity = opacity;
    
    // Add to container and remove after animation
    this.bubblesContainer.appendChild(steam);
    setTimeout(() => {
      if (steam.parentNode === this.bubblesContainer) {
        steam.remove();
      }
    }, duration * 1000 + 100);
  }
  
  formatSeconds(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60); // Ensure whole number
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PancakeApp();
});
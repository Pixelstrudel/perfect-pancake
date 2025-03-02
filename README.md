# Perfect Pancake - Self-Calibrating Pancake Timer PWA

Perfect Pancake is a Progressive Web App that helps you cook the perfect pancake by learning from your feedback over time. It uses a sophisticated learning algorithm to provide increasingly accurate cooking time recommendations based on your stove's temperature and pancake recipe.

## Features

- **Self-Calibrating Timer**: Records cooking times for each side of your pancake and learns from your feedback
- **Temperature Awareness**: Adjusts recommendations based on your stove's heat level (1-9) with neighborhood learning
- **Recipe Presets**: Create and manage multiple pancake recipes with separate learning for each type
- **Visual Feedback**: Watch as the virtual pancake changes color based on cooking time
- **History Management**: View, delete, and analyze your cooking history for each recipe
- **Data Persistence**: Stores your cooking history and recommendations in IndexedDB
- **Mobile-First & PWA**: Works offline and can be installed on your home screen

## How to Use

1. Select your pancake recipe from the dropdown (or create a new one)
2. Set your stove's temperature using the slider (1-9)
3. Press "Start Cooking" when you pour the batter
4. Press "Flip Pancake" when you flip the first side
5. Press "Done" when your pancake is fully cooked
6. Rate your pancake (Bad, Mid, Good)
7. The app will learn from your feedback and suggest better times for future pancakes!

## Recipe Management

- **Create Recipes**: Add new recipes with custom parameters (thickness, expected cooking times)
- **Edit Recipes**: Modify existing recipes as you refine your batter
- **History Per Recipe**: Each recipe maintains its own learning history and recommendations
- **Confidence Display**: See how confident the app is about its recommendations for each recipe

## Installation

This is a Progressive Web App, which means you can install it on your device:

1. Visit the hosted website
2. For mobile: Look for the "Add to Home Screen" option in your browser
3. For desktop: Look for the install icon in your browser's address bar

## Development

### Setting Up Locally

1. Clone this repository
2. Navigate to the project directory
3. Serve the `public` directory with any static file server:
   ```
   # Using Python
   python3 -m http.server -d public
   
   # Using Node.js
   npx serve public
   ```
4. Visit `http://localhost:8000` in your browser

## License

MIT

## Contributing

Contributions are welcome! Feel free to submit a pull request or open an issue.
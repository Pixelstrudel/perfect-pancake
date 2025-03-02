# Deploying Perfect Pancake to GitHub Pages

This guide will help you deploy your Perfect Pancake app to GitHub Pages.

## Prerequisites

1. A GitHub account
2. Git installed on your computer
3. Node.js and npm installed on your computer

## Step 1: Create a GitHub Repository

1. Go to GitHub and create a new repository named "perfectpancake"
2. Make sure it's public if you want to use GitHub Pages with a free account

## Step 2: Initialize Git and Push Your Code

```bash
# Initialize git in your project directory
git init

# Add your files to git
git add .

# Commit your files
git commit -m "Initial commit"

# Add your GitHub repository as a remote
git remote add origin https://github.com/YOUR_USERNAME/perfectpancake.git

# Push your code to GitHub
git push -u origin main
```

## Step 3: Install Dependencies

```bash
# Install dependencies from package.json
npm install
```

## Step 4: Deploy to GitHub Pages

```bash
# Deploy to GitHub Pages
npm run deploy
```

This will create a gh-pages branch in your repository with the contents of the public directory.

## Step 5: Configure GitHub Pages

1. Go to your repository on GitHub
2. Click on "Settings"
3. Scroll down to the "GitHub Pages" section
4. In the Source section, select the "gh-pages" branch
5. Click Save

Your app will be available at: `https://YOUR_USERNAME.github.io/perfectpancake/`

## Updating Your Deployment

When you make changes to your app:

```bash
# Add your changes
git add .

# Commit your changes
git commit -m "Description of changes"

# Push to GitHub
git push

# Deploy the updated version
npm run deploy
```

## Custom Domain (Optional)

If you want to use a custom domain:

1. Purchase a domain from a domain registrar
2. Add a CNAME record pointing to YOUR_USERNAME.github.io
3. In your GitHub repository settings, under GitHub Pages, add your custom domain
4. Create a CNAME file in the public directory with your domain name

```bash
echo "www.yourdomain.com" > public/CNAME
```

Then deploy again.
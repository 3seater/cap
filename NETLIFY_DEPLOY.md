# Netlify Deployment Guide

## Important Note
This is a **Node.js server application** with Socket.io for real-time multiplayer. Netlify is primarily for static sites, so you have two options:

### Option 1: Deploy Static Files to Netlify + Server Elsewhere (Recommended)

1. **Deploy static files to Netlify:**
   - Build command: (leave empty or use `echo 'No build needed'`)
   - Publish directory: `public`
   - The `netlify.toml` file is already configured

2. **Deploy server to a platform that supports WebSockets:**
   - **Render.com** (Free tier available)
   - **Railway.app** (Free tier available)
   - **Heroku** (Paid plans)
   - **Fly.io** (Free tier available)

3. **Update the Socket.io connection in `public/game.js`:**
   - Change the socket connection URL to your server's URL
   - Example: `const socket = io('https://your-server.onrender.com');`

### Option 2: Use Netlify Functions (Not Recommended for Socket.io)
Socket.io requires persistent connections, which don't work well with serverless functions.

## Quick Deploy to Render.com (Server)

1. Go to https://render.com
2. Create a new "Web Service"
3. Connect your GitHub repository
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Your server will get a URL like: `https://your-app.onrender.com`
6. Update `public/game.js` to use this URL for Socket.io

## Current Setup
- Static files: Can be served by Netlify
- Server: Needs to be deployed separately to a platform that supports WebSockets


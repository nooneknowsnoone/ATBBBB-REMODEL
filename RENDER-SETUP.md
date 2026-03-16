# How to Deploy Your Autobot on Render

## Don't Use Blueprint! Use Manual Web Service Instead

## Step-by-Step:

### Step 1: Don't use Blueprint
The error means render.yaml isn't on GitHub yet. **Use Manual Web Service instead!**

### Step 2: Create Web Service Manually

1. Go back to Render Dashboard: https://dashboard.render.com
2. Click **"New"** → **"Web Service"** (NOT Blueprint!)

### Step 3: Connect Your GitHub

1. You should see your repos
2. Click on **"vincentsensei09 / autobot"**
3. Click **"Connect"**

### Step 4: Configure the Web Service

Fill in the form:

| Setting | Value |
|---------|-------|
| **Name** | `autobot` |
| **Build Command** | `npm install` |
| **Start Command** | `node index.js` |

### Step 5: Add Environment Variables

Look for **"Environment Variables"** section (or click "Advanced"):

Click **"Add"** 3 times:

**Variable 1:**
- Key: `JSONBIN_API_KEY`
- Value: `$2a$10$YINw6ogQt1eY3s.ffmYQWuowrZnMZO3OPRbta2ZwazHwFf7GwtRS2`

**Variable 2:**
- Key: `JSONBIN_BIN_ID`
- Value: `69b7bd75b7ec241ddc71a066`

**Variable 3:**
- Key: `USE_EXTERNAL_STORAGE`
- Value: `true`

### Step 6: Create!

1. Click **"Create Web Service"** button
2. Wait 1-2 minutes
3. Click the URL when ready!

---

## That's It!

Your bot will deploy and save data to JSONBin.io!

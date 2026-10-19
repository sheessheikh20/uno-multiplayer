# 🎴 UNO Multiplayer Arena

A real-time multiplayer UNO card game built with **Node.js**, **Express**, and **Socket.IO**. Designed with a modern, mobile-friendly interface and official classic UNO rules plus popular house rules.

---

## ⚡ Special Rules Supported

1. **+4 on +2 Stack Allowed (Combo Attack)**:
   - When a player faces a `+4` (Wild Draw 4) or `+2` (Draw Two), they can counter by stacking another `+2` or `+4`!
   - The penalty accumulates (e.g. `+4` + `+2` = `+6` cards) and passes to the next player until someone cannot counter and must draw the accumulated penalty!

2. **UNO Catch Penalty (Total Players in Match)**:
   - If a player reaches 1 card remaining without calling **UNO!**, opponents have an 8-second window to hit **CATCH UNO!**.
   - If caught, the player must draw cards equal to the **total number of players in the match**!

3. **Winners Podium System (No Complex Points)**:
   - No math or 500-point counting.
   - For 5+ players: Top 2 Winners (🥇 1st & 🥈 2nd Place).
   - For 2-3 players: 1-2 Winners.
   - The match crowns the winners on a podium as soon as they empty their cards!

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
http://localhost:3000
```

---

## 🌐 Deploy to Render (Recommended & Free)

Render natively supports persistent Node.js WebSockets 24/7 for free:

1. Push this repository to your GitHub account (`sheessheikh20`).
2. Go to **[Render.com](https://render.com)** and sign in with GitHub.
3. Click **"New +"** -> **"Web Service"**.
4. Connect this `uno-multiplayer` repository.
5. Settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Click **"Deploy Web Service"**.
7. Share your live `.onrender.com` link with friends!

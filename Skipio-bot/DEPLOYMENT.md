# 🚀 Discord Bot Deployment Guide (Free Options)

Discord bots need to run 24/7. Here are the best "absolutely free" ways to deploy your bot without keeping your computer on.

## Option 1: Render (Recommended)
Render is very reliable and has a great free tier.

### 1. Push your code to GitHub
If your project isn't on GitHub yet:
1. Create a new private repository on GitHub.
2. Push your code there. **CRITICAL: Ensure your `.env` is in `.gitignore` so you don't leak your tokens!**

### 2. Connect to Render
1. Go to [Render.com](https://render.com) and sign up.
2. Click "New" -> **Background Worker**.
3. Connect your GitHub repository.
4. Settings:
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r new_app_repo/Skipio-bot/requirements.txt`
   - **Start Command**: `python new_app_repo/Skipio-bot/b.py`
5. Click **Advanced** and add your **Environment Variables** (the same ones from your `.env` file).
6. Deploy!

---

## Option 2: Koyeb
Koyeb provides a "Nano" instance for free with 512MB RAM, which is plenty for a Discord bot.

1. Create a [Koyeb](https://www.koyeb.com/) account.
2. Create a new App -> GitHub.
3. Configure the directory as `new_app_repo/Skipio-bot`.
4. Set the Health Check to **None** (since this is a bot, not a web server).
5. Add your Environment Variables.
6. Deploy.

---

## Option 3: Oracle Cloud "Always Free"
This is the most "professional" option but takes about 15-20 minutes to set up. You get a full virtual machine (VM) for free forever.

1. Sign up for [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/).
2. Create an **Ampere A1 Compute Instance** (ARM-based, up to 4 CPUs and 24GB RAM for free).
3. SSH into the server.
4. Clone your repo, setup python, and run the bot using `tmux` or `pm2` so it stays alive after you close the terminal.

### Pro-Tip for Deployment
Always use **pm2** (if possible) or a docker container to ensure the bot restarts automatically if it crashes.
```bash
# Example with pm2
pm2 start main.py --name "skipio-bot" --interpreter python3
```

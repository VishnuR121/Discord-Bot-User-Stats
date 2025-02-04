// index.js
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');

// File to save/load stats
const statsFile = 'stats.json';

// "stats" tracks each user's counts
let stats = {};

// Load existing stats if file exists
if (fs.existsSync(statsFile)) {
  const rawData = fs.readFileSync(statsFile, 'utf-8');
  stats = JSON.parse(rawData);
}

// Save stats to disk
function saveStats() {
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
}

// Create client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Ensure a user's stats are initialized properly
function initUserStats(message) {
  const userId = message.author.id;
  const username = message.author.username;

  if (!stats[userId]) {
    stats[userId] = {
      username,
      messages: 0,
      images: 0,
      gifs: 0,
      videos: 0,
      links: 0,
    };
  } else {
    // If user changes their username, update it
    stats[userId].username = username;
    // Repair any missing stats fields (in case older data was incomplete)
    if (stats[userId].messages === undefined) stats[userId].messages = 0;
    if (stats[userId].images === undefined)   stats[userId].images   = 0;
    if (stats[userId].gifs === undefined)     stats[userId].gifs     = 0;
    if (stats[userId].videos === undefined)   stats[userId].videos   = 0;
    if (stats[userId].links === undefined)    stats[userId].links    = 0;
  }
}

// Process a single message to update stats
function processMessage(message) {
  // Ignore bot messages
  if (message.author.bot) return;

  initUserStats(message);

  const userId = message.author.id;
  
  // Increment messages
  stats[userId].messages++;

  // Check attachments (images, gifs, videos)
  if (message.attachments.size > 0) {
    message.attachments.forEach((attachment) => {
      const fileName = attachment.name?.toLowerCase() || '';
      if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        stats[userId].images++;
      } else if (fileName.endsWith('.gif')) {
        stats[userId].gifs++;
      } else if (
        fileName.endsWith('.mp4') ||
        fileName.endsWith('.mov') ||
        fileName.endsWith('.avi') ||
        fileName.endsWith('.wmv')
      ) {
        stats[userId].videos++;
      }
    });
  }

  // Check for links
  const linkRegex = /(https?:\/\/[^\s]+)/g;
  if (linkRegex.test(message.content)) {
    stats[userId].links++;
  }

  // Save to file
  saveStats();
}

// Function to fetch all historical messages (when using !fetchHistory)
async function fetchAllMessagesForGuild(guild) {
  if (!guild) {
    console.log('Guild not found or bot not in server.');
    return;
  }

  for (const [channelId, channel] of guild.channels.cache) {
    // Only text channels
    if (channel.type === ChannelType.GuildText) {
      console.log(`Fetching messages from #${channel.name} (${channelId})...`);

      let lastMessageId = null;
      let fetchedCount = 0;

      while (true) {
        try {
          const options = { limit: 100 };
          if (lastMessageId) options.before = lastMessageId;

          const fetchedMessages = await channel.messages.fetch(options);
          if (fetchedMessages.size === 0) break;

          fetchedMessages.forEach((msg) => processMessage(msg));

          fetchedCount += fetchedMessages.size;
          lastMessageId = fetchedMessages.last().id;
          console.log(`Fetched ${fetchedMessages.size} messages (total: ${fetchedCount}).`);

          // If fewer than 100 were returned, we've reached the earliest
          if (fetchedMessages.size < 100) break;
        } catch (error) {
          console.error(`Error fetching messages in ${channel.name}:`, error);
          break;
        }
      }

      console.log(`Done fetching #${channel.name}. Total messages fetched: ${fetchedCount}\n`);
    }
  }

  console.log('Finished retroactively fetching all channels!');
}

// On bot ready (no auto-fetch)
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// On new message
client.on('messageCreate', async (message) => {
  // Basic commands
  if (message.content === '!ping') {
    return message.channel.send('Pong!');
  }
  if (message.content === '!zain') {
    return message.channel.send('hyder' || 'hashim');
  }
  if (message.content === '!arjun') {
    return message.channel.send('ishaan');
  }

  // Command to fetch history
  if (message.content === '!fetchHistory') {
    if (!message.guild) {
      return message.reply('Please use this command in a server channel.');
    }
    
    // Fetch all guild members so we have a better chance of resolving displayName
    await message.guild.members.fetch();
    await fetchAllMessagesForGuild(message.guild);

    return message.channel.send('Finished fetching all historical messages!');
  }

  // Process (live) messages for stats
  processMessage(message);

  // The !stats command
  if (message.content === '!stats') {
    const entries = Object.entries(stats);
    if (entries.length === 0) {
      return message.channel.send('No data yet!');
    }

    // Sort each category in descending order
    const messagesLeaderboard = [...entries].sort((a, b) => b[1].messages - a[1].messages);
    const imagesLeaderboard   = [...entries].sort((a, b) => b[1].images  - a[1].images);
    const gifsLeaderboard     = [...entries].sort((a, b) => b[1].gifs    - a[1].gifs);
    const videosLeaderboard   = [...entries].sort((a, b) => b[1].videos  - a[1].videos);
    const linksLeaderboard    = [...entries].sort((a, b) => b[1].links   - a[1].links);

    // We'll abbreviate by showing only top 10
    async function getTopTenUsers(leaderboard, category, message) {
      const topTen = leaderboard.slice(0, 10);
      let text = '';
    
      for (const [userId, userStats] of topTen) {
        let displayName = userStats.username;
        
        // Try to get the user from the guild cache
        let member = message.guild.members.cache.get(userId);
        
        // If the member isn't in the cache, fetch them
        if (!member) {
          try {
            member = await message.guild.members.fetch(userId);
          } catch (error) {
            // Handle unknown member (user might have left the guild)
            if (error.code === 10007) {
              console.log(`User ${userId} is no longer in the guild.`);
              displayName = "Unknown User";
            } else {
              console.error(`Error fetching member ${userId}:`, error);
            }
          }
        }
    
        // If the member is found, use their display name
        if (member) {
          displayName = member.displayName || member.user.username;
        }
    
        // If still no displayName, fallback to userId
        if (!displayName) displayName = userId;
    
        const count = userStats[category];
        text += `${topTen.indexOf([userId, userStats]) + 1}. **${displayName}** - \`${count}\`\n`;
      }
      
      return text || 'No data';
    }
    
    // Await for async function results
    const messagesText = await getTopTenUsers(messagesLeaderboard, 'messages', message);
    const imagesText   = await getTopTenUsers(imagesLeaderboard, 'images', message);
    const gifsText     = await getTopTenUsers(gifsLeaderboard, 'gifs', message);
    const videosText   = await getTopTenUsers(videosLeaderboard, 'videos', message);
    const linksText    = await getTopTenUsers(linksLeaderboard, 'links', message);

    let statsMessage = '**Server Leaderboard (Top 10):**\n\n';
    statsMessage += `**Messages:**\n${messagesText}\n`;
    statsMessage += `**Images:**\n${imagesText}\n`;
    statsMessage += `**GIFs:**\n${gifsText}\n`;
    statsMessage += `**Videos:**\n${videosText}\n`;
    statsMessage += `**Links:**\n${linksText}\n`;

    message.channel.send(statsMessage);
  }
});

// Replace YOUR_BOT_TOKEN with the actual token from the Discord Developer Portal
client.login('HERE');

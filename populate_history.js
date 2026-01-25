const fs = require('fs-extra')
const { AtpAgent } = require('@atproto/api')
const { bluesky } = require('./keys.js')

const agent = new AtpAgent({
  service: bluesky.service,
})

const HISTORY_FILE = './location_history.json'

// Extract coordinates and location from post text
const parsePost = (postText) => {
  // Extract "Somewhere near X" location name
  const locationMatch = postText.match(/Somewhere (?:near|in|remote in) (.+?)\n/)
  const locationName = locationMatch ? locationMatch[1].trim() : null
  
  // Extract coordinates (format: "XX.XXXXX, YY.YYYYY")
  const coordMatch = postText.match(/([-\d.]+),\s*([-\d.]+)/)
  if (!coordMatch) return null
  
  const lat = parseFloat(coordMatch[1])
  const lon = parseFloat(coordMatch[2])
  
  if (isNaN(lat) || isNaN(lon)) return null
  
  return {
    lat,
    lon,
    locationName: locationName || 'Unknown Location',
  }
}

const populateHistory = async () => {
  await agent.login(bluesky)
  
  console.log(`Fetching recent posts from @${bluesky.identifier}...`)
  
  const response = await agent.getAuthorFeed({
    actor: bluesky.identifier,
    limit: 8,
  })
  
  const history = []
  
  for (const item of response.data.feed) {
    const post = item.post
    const text = post.record.text
    
    const parsed = parsePost(text)
    if (parsed) {
      history.push({
        ...parsed,
        timestamp: new Date(post.record.createdAt).getTime(),
      })
      console.log(`Found: ${parsed.locationName} (${parsed.lat}, ${parsed.lon})`)
    }
  }
  
  history.sort((a, b) => b.timestamp - a.timestamp)
  
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2))
  
  console.log(`\nSaved ${history.length} locations to ${HISTORY_FILE}`)
  console.log('\nRecent journey:')
  history.forEach((loc, idx) => {
    console.log(`${idx + 1}. ${loc.locationName}`)
  })
}

populateHistory().catch(console.error)
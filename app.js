const fs = require('fs-extra')
const axios = require('axios')
const randomFloat = require('random-float')
const emoji = require('node-emoji')
const GoogleMapsAPI = require('googlemaps')
const { AtpAgent } = require('@atproto/api')
const sharp = require('sharp')

const { google, bluesky } = require('./keys.js')
const {
  cleanup,
  getRandomInt,
  getRandomIntInRange,
  makePost,
  sleep,
} = require('./util.js')

const agent = new AtpAgent({
  service: bluesky.service,
})

const gmAPI = new GoogleMapsAPI(google)
const assetDirectory = './assets/'
const HISTORY_FILE = './location_history.json'

/**
 * Weighted bounding boxes per continent
 * Coastal / populated regions get higher weight
 */
const CONTINENTS = [
  {
    name: 'North America',
    boxes: [
      { lat: [25, 49], lon: [-125, -67], weight: 4 }, // US / Mexico populated
      { lat: [43, 60], lon: [-130, -60], weight: 2 }, // Canada
      { lat: [15, 25], lon: [-100, -75], weight: 1 }, // Central America
    ],
    emojis: ['🌎', '🍔', '🏈', '🍿', '🐕', '🦅', '🌲', '🏔️', '🦬', '🌵'],
  },
  {
    name: 'South America',
    boxes: [
      { lat: [-35, 5], lon: [-75, -35], weight: 4 }, // Brazil / Andes coast
      { lat: [-55, -15], lon: [-75, -60], weight: 1 }, // Patagonia
    ],
    emojis: ['🌎', '⚽️', '🏊', '🌮', '🌯', '🦜', '☕', '🦙', '🌴', '🐆'],
  },
  {
    name: 'Europe',
    boxes: [
      { lat: [40, 55], lon: [-5, 30], weight: 5 }, // Western / Central Europe
      { lat: [55, 70], lon: [10, 40], weight: 2 }, // Scandinavia
      { lat: [45, 55], lon: [30, 60], weight: 1 }, // Eastern Europe
    ],
    emojis: ['🌍', '⚽️', '💶', '🚲', '🍝', '🏰', '🍺', '🎨', '⚓', '🧀'],
  },
  {
    name: 'Africa',
    boxes: [
      { lat: [-35, 5], lon: [10, 40], weight: 3 }, // Southern / East Africa
      { lat: [5, 35], lon: [-10, 35], weight: 3 }, // North / West Africa
      { lat: [-5, 15], lon: [35, 50], weight: 1 }, // Horn of Africa
    ],
    emojis: ['🌍', '🐘', '🦒', '🌊', '🍗', '🦁', '🦓', '🌅', '🥁', '🦏'],
  },
  {
    name: 'Asia',
    boxes: [
      { lat: [20, 45], lon: [100, 145], weight: 4 }, // East Asia
      { lat: [10, 30], lon: [70, 90], weight: 3 }, // India / SE Asia
      { lat: [40, 60], lon: [60, 100], weight: 1 }, // Central Asia
    ],
    emojis: ['🌏', '🚄', '🍜', '🥟', '🏯', '🐼', '🍛', '🎎', '🐅'],
  },
  {
    name: 'Australia',
    boxes: [
      { lat: [-38, -12], lon: [113, 153], weight: 4 }, // Coastal AU
      { lat: [-30, -20], lon: [120, 135], weight: 1 }, // Interior
    ],
    emojis: ['🐨', '🦘', '🌏', '♨️', '🏜️', '🪃', '🦎', '🏖️', '🐊', '🌊'],
  },
  {
    name: 'Antarctica',
    boxes: [
      { lat: [-90, -65], lon: [-180, 180], weight: 1 },
    ],
    emojis: ['🧊', '☃️', '🥌', '⛸️', '🏂', '🐧', '🌨️', '🦭', '⛷️'],
  },
]

const chooseWeighted = (items) => {
  const total = items.reduce((sum, i) => sum + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    if ((r -= item.weight) <= 0) return item
  }
  return items[0]
}

const reverseGeocode = async (lat, lon) => {
  const params = {
    latlng: `${lat},${lon}`,
    result_type: 'locality|natural_feature|point_of_interest|administrative_area_level_1',
  }

  return new Promise((resolve, reject) => {
    gmAPI.reverseGeocode(params, (err, result) => {
      if (err) {
        reject(err)
        return
      }
      
      if (!result || !result.results || result.results.length === 0) {
        resolve(null)
        return
      }

      const place = result.results[0]
      const components = place.address_components

      let locality = null
      let area = null
      let country = null

      components.forEach(comp => {
        if (comp.types.includes('locality')) {
          locality = comp.long_name
        }
        if (comp.types.includes('administrative_area_level_1')) {
          area = comp.long_name
        }
        if (comp.types.includes('country')) {
          country = comp.long_name
        }
      })

      resolve({ locality, area, country, formatted: place.formatted_address })
    })
  })
}

const chooseContinent = async () => {
  const continent = CONTINENTS[getRandomInt(CONTINENTS.length - 1)]
  const box = chooseWeighted(continent.boxes)

  const lat = randomFloat(box.lat[0], box.lat[1])
  const lon = randomFloat(box.lon[0], box.lon[1])
  const center = `${lat.toFixed(5)}, ${lon.toFixed(5)}`

  let locationName = continent.name
  try {
    const geoData = await reverseGeocode(lat, lon)
    if (geoData) {
      if (geoData.locality) {
        locationName = `${geoData.locality}, ${geoData.country || continent.name}`
      } else if (geoData.area) {
        locationName = `${geoData.area}, ${geoData.country || continent.name}`
      } else if (geoData.country) {
        locationName = geoData.country
      }
      if (!geoData.locality && !geoData.area) {
        locationName = `Somewhere remote in ${geoData.country || continent.name}`
      }
    }
  } catch (err) {
    console.log('Reverse geocoding failed, using continent name:', err.message)
  }

  let status = `Somewhere near ${locationName}`
  status +=
    '\n\n' +
    center +
    '\n\n' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji

  return { center, status, continent, locationName, lat, lon }
}

const loadHistory = async () => {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    return []
  }
}

const saveHistory = async (history) => {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2))
}

const addToHistory = async (lat, lon, locationName) => {
  const history = await loadHistory()
  history.unshift({ lat, lon, locationName, timestamp: Date.now() })
  
  if (history.length > 8) {
    history.length = 8
  }
  
  await saveHistory(history)
  return history
}

const createJourneyBanner = async (history) => {
  if (history.length === 0) {
    console.log('No history yet, skipping banner creation')
    return
  }

  console.log(`Creating journey banner with ${history.length} locations:`)
  history.forEach((loc, idx) => {
    console.log(`  ${idx + 1}. ${loc.locationName} (${loc.lat}, ${loc.lon})`)
  })

  // Calculate the center and bounds of all markers
  const lats = history.map(loc => loc.lat)
  const lons = history.map(loc => loc.lon)
  
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  
  const centerLat = (minLat + maxLat) / 2
  const centerLon = (minLon + maxLon) / 2
  
  // Add padding to ensure markers aren't cut off
  const latPadding = (maxLat - minLat) * 0.3
  const lonPadding = (maxLon - minLon) * 0.3

  console.log(`Bounds: lat [${minLat}, ${maxLat}], lon [${minLon}, ${maxLon}]`)
  console.log(`Center: ${centerLat}, ${centerLon}`)

  // Build markers manually for the URL
  const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray', 'gray']
  const markerStrings = history.map((loc, idx) => {
    const color = colors[idx] || 'gray'
    const label = (idx + 1).toString()
    return `markers=color:${color}%7Clabel:${label}%7C${loc.lat},${loc.lon}`
  }).join('&')

  // Specify visible region to ensure all markers are shown
  const visibleRegion = `visible=${minLat - latPadding},${minLon - lonPadding}%7C${maxLat + latPadding},${maxLon + lonPadding}`

  const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap'
  const params = [
    'maptype=terrain',
    'size=3000x1000',
    'scale=1',
    visibleRegion,
    markerStrings,
    `key=${google.key}`
  ].join('&')

  const journeyMapUrl = `${baseUrl}?${params}`

  console.log('Journey map URL:', journeyMapUrl)

  const journeyResponse = await axios({
    url: journeyMapUrl,
    method: 'GET',
    responseType: 'arraybuffer',
  })

  await fs.writeFile(assetDirectory + 'banner_raw.png', journeyResponse.data)

  // Resize to 2560x660 to fit properly, then center on 2560x2560 canvas
  const resizedBanner = await sharp(assetDirectory + 'banner_raw.png')
    .resize(2560, 660, { fit: 'cover', position: 'center' })
    .toBuffer()

  // Create the final banner as JPEG with compression to stay under 976KB
  await sharp({
    create: {
      width: 2560,
      height: 2560,
      channels: 4,
      background: { r: 230, g: 240, b: 245, alpha: 1 }
    }
  })
  .composite([{
    input: resizedBanner,
    top: 950,
    left: 0
  }])
  .jpeg({ quality: 85, progressive: true })
  .toFile(assetDirectory + 'banner.jpg')

  console.log('Banner saved successfully (centered in 2560x2560 canvas)')
}

const updateProfileBanner = async (bannerPath) => {
  const buffer = fs.readFileSync(bannerPath)

  const { data } = await agent.uploadBlob(buffer, {
    encoding: 'image/jpeg',
  })

  const { data: existing } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.actor.profile',
    rkey: 'self',
  })

  const profileRecord = existing.value || {}

  await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.actor.profile',
    rkey: 'self',
    record: {
      ...profileRecord,
      banner: data.blob,
    },
  })
}

const downloadMap = async (center, maptype, zoom, imagePath) => {
  const imageURL = gmAPI.staticMap({
    center,
    zoom,
    maptype,
    size: '1024x1024',
    scale: 1,
  })

  const response = await axios({
    url: imageURL,
    method: 'GET',
    responseType: 'arraybuffer',
  })

  if (response.data.length < 20000) {
    return false
  }

  await fs.writeFile(imagePath, response.data)
  return true
}

const uploadImage = async (imagePath) => {
  const buffer = fs.readFileSync(imagePath)
  const { data } = await agent.uploadBlob(buffer, { encoding: 'image/png' })

  return {
    image: data.blob,
    alt: 'Map image',
  }
}

const updateProfileImage = async (imagePath, chosenContinent, history) => {
  const buffer = fs.readFileSync(imagePath)

  const { data } = await agent.uploadBlob(buffer, {
    encoding: 'image/png',
  })

  const { data: existing } = await agent.com.atproto.repo.getRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.actor.profile',
    rkey: 'self',
  })

  const profileRecord = existing.value || {}
  
  // Build description with recent journey
  let description = `Currently somewhere in ${chosenContinent.name} ${chosenContinent.emojis[getRandomInt(chosenContinent.emojis.length - 1)]}`
  
  if (history.length > 0) {
    const colors = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚫']
    description += '\n\nRecent Journey:'
    history.forEach((loc, idx) => {
      const nextLine = `\n${colors[idx]} ${loc.locationName}`
      if (description.length + nextLine.length <= 253) { // 253 to leave room for "..." when we need to truncate
        description += nextLine
      }
    })
  }

  if (description.length > 256) {
    description = description.substring(0, 253) + '...'
  }

  await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: 'app.bsky.actor.profile',
    rkey: 'self',
    record: {
      ...profileRecord,
      avatar: data.blob,
      description: description,
    },
  })
}

const post = async (status, lat, lon) => {
  const images = [
    await uploadImage(assetDirectory + 'satellite.png'),
    await uploadImage(assetDirectory + 'hybrid.png'),
    await uploadImage(assetDirectory + 'terrain.png'),
  ]

  const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`
  const coordinates = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  
  const textBeforeCoords = status.split('\n\n')[0] + '\n\n'
  const textAfterCoords = '\n\n' + status.split('\n\n').slice(2).join('\n\n')
  
  const fullText = textBeforeCoords + coordinates + textAfterCoords
  
  const byteStart = new TextEncoder().encode(textBeforeCoords).length
  const byteEnd = byteStart + new TextEncoder().encode(coordinates).length

  await makePost(agent, {
    text: fullText,
    facets: [
      {
        index: {
          byteStart,
          byteEnd,
        },
        features: [
          {
            $type: 'app.bsky.richtext.facet#link',
            uri: mapsUrl,
          },
        ],
      },
    ],
    embed: { $type: 'app.bsky.embed.images', images },
    createdAt: new Date().toISOString(),
  })
}

const run = async () => {
  cleanup(assetDirectory)

  await agent.login(bluesky)
  fs.ensureDirSync(assetDirectory)

  const zoom = getRandomIntInRange(11, 15)

  let imageInfo
  let success = false
  let retryCount = 0

  while (!success && retryCount < 5) {
    console.log(`Downloading satellite map, retry ${retryCount}...`)
    imageInfo = await chooseContinent()
    success = await downloadMap(
      imageInfo.center,
      'satellite',
      zoom,
      assetDirectory + 'satellite.png'
    )
    if (!success) {
      console.log('No satellite imagery at this location, trying another...')
      retryCount++
      sleep(2)
      
      continue
    }

    // Also verify hybrid and terrain maps exist before proceeding
    console.log('Downloading hybrid map...')
    const hybridSuccess = await downloadMap(
      imageInfo.center,
      'hybrid',
      zoom,
      assetDirectory + 'hybrid.png'
    )

    console.log('Downloading terrain map...')
    const terrainSuccess = await downloadMap(
      imageInfo.center,
      'terrain',
      zoom,
      assetDirectory + 'terrain.png'
    )

    if (!hybridSuccess || !terrainSuccess) {
      console.log('Hybrid or terrain map unavailable, trying another location...')
      success = false
      retryCount++
      sleep(2)
    }
  }

  await post(imageInfo.status, imageInfo.lat, imageInfo.lon)

  const history = await addToHistory(imageInfo.lat, imageInfo.lon, imageInfo.locationName)
  await createJourneyBanner(history)

  await updateProfileImage(assetDirectory + 'satellite.png', imageInfo.continent, history)
  
  if (history.length > 0) {
    await updateProfileBanner(assetDirectory + 'banner.jpg')
  }
}

run().catch(console.error)
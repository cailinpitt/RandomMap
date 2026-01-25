const fs = require('fs-extra')
const axios = require('axios')
const randomFloat = require('random-float')
const emoji = require('node-emoji')
const GoogleMapsAPI = require('googlemaps')
const { AtpAgent } = require('@atproto/api')

const { google, bluesky } = require('./keys.js')
const {
  cleanup,
  getRandomInt,
  getRandomIntInRange,
  makePost,
} = require('./util.js')

const agent = new AtpAgent({
  service: bluesky.service,
})

const gmAPI = new GoogleMapsAPI(google)
const assetDirectory = './assets/'

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
  },
  {
    name: 'South America',
    boxes: [
      { lat: [-35, 5], lon: [-75, -35], weight: 4 }, // Brazil / Andes coast
      { lat: [-55, -15], lon: [-75, -60], weight: 1 }, // Patagonia
    ],
  },
  {
    name: 'Europe',
    boxes: [
      { lat: [40, 55], lon: [-5, 30], weight: 5 }, // Western / Central Europe
      { lat: [55, 70], lon: [10, 40], weight: 2 }, // Scandinavia
      { lat: [45, 55], lon: [30, 60], weight: 1 }, // Eastern Europe
    ],
  },
  {
    name: 'Africa',
    boxes: [
      { lat: [-35, 5], lon: [10, 40], weight: 3 }, // Southern / East Africa
      { lat: [5, 35], lon: [-10, 35], weight: 3 }, // North / West Africa
      { lat: [-5, 15], lon: [35, 50], weight: 1 }, // Horn of Africa
    ],
  },
  {
    name: 'Asia',
    boxes: [
      { lat: [20, 45], lon: [100, 145], weight: 4 }, // East Asia
      { lat: [10, 30], lon: [70, 90], weight: 3 }, // India / SE Asia
      { lat: [40, 60], lon: [60, 100], weight: 1 }, // Central Asia
    ],
  },
  {
    name: 'Australia',
    boxes: [
      { lat: [-38, -12], lon: [113, 153], weight: 4 }, // Coastal AU
      { lat: [-30, -20], lon: [120, 135], weight: 1 }, // Interior
    ],
  },
  {
    name: 'Antarctica',
    boxes: [
      { lat: [-90, -65], lon: [-180, 180], weight: 1 },
    ],
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

const chooseContinent = () => {
  const continent = CONTINENTS[getRandomInt(CONTINENTS.length - 1)]
  const box = chooseWeighted(continent.boxes)

  const lat = randomFloat(box.lat[0], box.lat[1])
  const lon = randomFloat(box.lon[0], box.lon[1])
  const center = `${lat.toFixed(5)}, ${lon.toFixed(5)}`

  let status = `Somewhere in ${continent.name}`
  status +=
    '\n\n' +
    center +
    '\n\n' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji + ' ' +
    emoji.random().emoji

  return { center, status }
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

  // No-imagery tiles are tiny
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

const post = async (status) => {
  const images = [
    await uploadImage(assetDirectory + 'satellite.png'),
    await uploadImage(assetDirectory + 'hybrid.png'),
    await uploadImage(assetDirectory + 'terrain.png'),
  ]

  await makePost(agent, {
    text: status,
    embed: { $type: 'app.bsky.embed.images', images },
    createdAt: new Date().toISOString(),
  })
}

const run = async () => {
  await agent.login(bluesky)
  fs.ensureDirSync(assetDirectory)

  const zoom = getRandomIntInRange(11, 15)

  let imageInfo
  let success = false

  // Retry until satellite imagery exists
  while (!success) {
    imageInfo = chooseContinent()
    success = await downloadMap(
      imageInfo.center,
      'satellite',
      zoom,
      assetDirectory + 'satellite.png'
    )
  }

  await downloadMap(
    imageInfo.center,
    'hybrid',
    zoom,
    assetDirectory + 'hybrid.png'
  )

  await downloadMap(
    imageInfo.center,
    'terrain',
    zoom,
    assetDirectory + 'terrain.png'
  )

  await post(imageInfo.status)
  cleanup(assetDirectory)
}

run().catch(console.error)

import fs from 'fs-extra'
import axios from 'axios'
import path from 'path'
import randomFloat from 'random-float'
import emoji from 'node-emoji'
import GoogleMapsAPI from 'googlemaps'
import { AtpAgent } from '@atproto/api'

import { google, bluesky } from './keys.js'
import {
  cleanup,
  getRandomInt,
  getRandomIntInRange,
  makePost,
} from './util.js'

const agent = new AtpAgent({
  service: bluesky.service,
})

await agent.login({
  identifier: bluesky.identifier,
  password: bluesky.password,
})

const gmAPI = new GoogleMapsAPI(google)
const assetDirectory = './assets/'


const chooseContinent = () => {
  let center
  const continent = getRandomInt(5)
  let status = 'Somewhere in'

  switch (continent) {
    case 0:
      center = `${randomFloat(30.2, 50)}, ${randomFloat(-118.7, -76.6)}`
      status += ' North America'
      break
    case 1:
      center = `${randomFloat(-13.9, 1.4)}, ${randomFloat(-75.3, -39.7)}`
      status += ' South America'
      break
    case 2:
      center = `${randomFloat(-19.9, 21.3)}, ${randomFloat(14.4, 34.2)}`
      status += ' Africa'
      break
    case 3:
      center = `${randomFloat(43.0, 48)}, ${randomFloat(2.5, 44.6)}`
      status += ' Europe'
      break
    case 4:
      center = `${randomFloat(21.2, 49.7)}, ${randomFloat(70, 106)}`
      status += ' Asia'
      break
    default:
      center = `${randomFloat(-31.6, -20.6)}, ${randomFloat(116.1, 145.2)}`
      status += ' Australia'
  }

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
  const imageParams = {
    center,
    zoom,
    maptype,
    size: '4000x4000',
    scale: 2,
  }

  const imageURL = gmAPI.staticMap(imageParams)
  const image = path.resolve(imagePath)

  const response = await axios({
    url: imageURL,
    method: 'GET',
    responseType: 'arraybuffer',
  })

  await fs.writeFile(image, response.data)
}

const uploadImage = async (imagePath) => {
  const buffer = fs.readFileSync(imagePath)

  const { data } = await agent.uploadBlob(buffer, {
    encoding: 'image/png',
  })

  return {
    image: data.blob,
    alt: 'Map image',
  }
}

const post = async (status) => {
  const images = []

  images.push(await uploadImage(assetDirectory + 'satellite.png'))
  images.push(await uploadImage(assetDirectory + 'terrain.png'))

  await makePost(agent, {
    text: status,
    embed: {
      $type: 'app.bsky.embed.images',
      images,
    },
    createdAt: new Date().toISOString(),
  })
}

const run = async () => {
  fs.ensureDirSync(assetDirectory)

  const imageInfo = chooseContinent()
  const zoom = getRandomIntInRange(11, 15)

  await downloadMap(imageInfo.center, 'satellite', zoom, assetDirectory + 'satellite.png')
  await downloadMap(imageInfo.center, 'terrain', zoom, assetDirectory + 'terrain.png')

  await post(imageInfo.status)

  cleanup(assetDirectory)
}

run().catch(console.error)

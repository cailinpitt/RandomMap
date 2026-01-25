const fs = require('fs-extra')

/**
 * Remove directory
 * @param String assetDirectory path to the directory to remove
 */
const cleanup = (assetDirectory) => fs.removeSync(assetDirectory)

/**
 * Generate random number in range [0, max]
 */
const getRandomInt = (max) =>
  Math.floor(Math.random() * Math.floor(max + 1))

/**
 * Generate random number in range [min, max]
 */
const getRandomIntInRange = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min

/**
 * Bluesky post wrapper
 */
const makePost = async (agent, record) => {
  return agent.post(record)
}

/**
 * Sleep for a specified amount of seconds
 */
const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = {
  cleanup,
  getRandomInt,
  getRandomIntInRange,
  makePost,
  sleep,
}

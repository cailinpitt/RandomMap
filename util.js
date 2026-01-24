import fs from 'fs-extra'

/**
 * Remove directory
 * @param String assetDirectory path to the directory to remove
 */
const cleanup = (assetDirectory) => fs.removeSync(assetDirectory)

/**
 * Generate random number in range [0, max]
 * @param Number max number in range
 * @return random number in [0, max]
 */
const getRandomInt = (max) =>
  Math.floor(Math.random() * Math.floor(max + 1))

/**
 * Generate random number in range [min, max]
 * @param Number min number in range
 * @param Number max number in range
 * @return random number in [min, max]
 */
const getRandomIntInRange = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min

/**
 * "makePost" replacement for Bluesky
 * Keeps the same idea: one function that sends a post
 */
const makePost = async (agent, record) => {
  return agent.post(record)
}

export {
  cleanup,
  getRandomInt,
  getRandomIntInRange,
  makePost,
}

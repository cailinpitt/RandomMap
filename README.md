# RandomMap

<p align="center">
 <a href = "https://bsky.app/profile/arandommap.bsky.social">
  <img src = "./screenshot.jpg" alt = "Twitter Screenshot" />
 </a>
</p>

[@arandommap.bsky.social](https://bsky.app/profile/arandommap.bsky.social) is a Bluesky (formerly Twitter) Bot that runs every several hours on a Raspberry Pi and tweets random aerial images of the Earth. Inspired by the [Earth View extension for Google Chrome](https://chrome.google.com/webstore/detail/earth-view-from-google-ea/bhloflhklmhfpedakmangadcdofhnnoh?hl=en). I had a five hour layover and decided to be productive.

# Code
RandomMap picks a random continent (except Antarctica, would be boring) and generates a random coordinates inside the chosen continent. It then uses the Google Maps API to download satellite and terrain images of the generated coordinates, and tweets the pictures!

# Run
Run `npm ci` to download project dependencies

Create a `keys.js` file and create objects to hold your Bluesky and Google Developer API keys. Make sure to export them, too:

```js
const google = {
    key: '...',
};
const bluesky = {
    identifier: '....',
    password: '...',
    service: 'https://bsky.social',
};

module.exports = {
    google,
    bluesky
};
```

Now you're all set. Simply do `npm run local`

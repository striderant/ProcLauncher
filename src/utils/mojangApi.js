import axios from 'axios';

const VERSION_MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

export async function fetchVersions() {
  try {
    const response = await axios.get(VERSION_MANIFEST_URL);
    return response.data;
  } catch (error) {
    console.error('Error fetching Minecraft versions:', error);
    return null;
  }
}

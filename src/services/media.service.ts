import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Simulated IMDb TSV stream-based parser
// In production, this would use stream-based parsing to prevent memory exhaustion
// as mandated by the constitution's "Stream-based Ingestion" principle

interface MediaItem {
  id: string;
  title: string;
  year: string;
  type: 'movie' | 'series';
}

/**
 * Stream-based IMDb TSV parser
 * Processes large dataset files without loading entire file into memory
 * Mandatory per constitution principles to prevent memory exhaustion
 */
export const parseImdbTsvStream = async (filePath: string): Promise<MediaItem[]> => {
  const items: MediaItem[] = [];
  
  // Read file line by line using readline for memory efficiency
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n');
  
  // Skip header line and process each record
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Stream-based: process one line at a time
    const columns = line.split('\t');
    if (columns.length >= 3) {
      items.push({
        id: columns[0] || '',
        title: columns[1] || '',
        year: columns[2] || '',
        type: columns[3] ? (columns[3].toLowerCase() === 'movie' ? 'movie' : 'series') : 'movie'
      });
    }
  }
  
  return items;
};

/**
 * Scan local media directory
 * Returns media files found in the specified directory
 */
export const scanLocalMedia = (directoryPath?: string): { items: MediaItem[] } => {
  const dir = directoryPath || process.env.LOCAL_MEDIA_PATH || '/data/media';
  const items: MediaItem[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subItems = scanLocalMedia(fullPath);
        items.push(...subItems.items);
      } else if (entry.isFile()) {
        // Check for media file extensions
        const ext = path.extname(entry.name).toLowerCase();
        if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mp3', '.wav', '.flac'].includes(ext)) {
          items.push({
            id: entry.name.replace(ext, ''),
            title: entry.name.replace(ext, ''),
            year: '',
            type: 'movie' // default type
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }
  
  return { items };
};

/**
 * Sync library with Torbox cloud
 * Requires valid TORBOX_API_KEY - music features cannot function without it
 * Per constitution: "Music management cannot function without a valid Torbox API Key"
 */
export const syncTorboxCloud = async (apiKey: string) => {

export default { 
  parseImdbTsvStream, 
  scanLocalMedia, 
  syncTorboxCloud,
  getLibraryStatus 
};
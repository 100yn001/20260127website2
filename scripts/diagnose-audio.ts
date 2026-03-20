/**
 * Diagnostic script to check audio files in Firebase Storage
 * Run this to verify what's actually stored in your Firebase
 */

import { getMetadata, ref } from 'firebase/storage';
import { storage } from '../config/firebase';

export async function diagnoseAudioFile(audioUrl: string) {
  try {
    console.log('🔍 Diagnosing audio file:', audioUrl);
    
    // Fetch the file headers
    const response = await fetch(audioUrl, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    
    console.log('📦 File headers:', {
      status: response.status,
      contentType,
      contentLength: contentLength ? `${contentLength} bytes` : 'unknown',
      sizeInMB: contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(2) + ' MB' : 'unknown',
    });
    
    // Try to get Firebase Storage metadata if it's a Firebase URL
    if (audioUrl.includes('firebasestorage.googleapis.com')) {
      try {
        // Extract path from URL
        const urlObj = new URL(audioUrl);
        const pathMatch = urlObj.pathname.match(/\/o\/(.+)\?/);
        if (pathMatch) {
          const path = decodeURIComponent(pathMatch[1]);
          console.log('📁 Firebase path:', path);
          
          const storageRef = ref(storage, path);
          const metadata = await getMetadata(storageRef);
          console.log('☁️ Firebase metadata:', {
            contentType: metadata.contentType,
            size: metadata.size,
            sizeInMB: (metadata.size / 1024 / 1024).toFixed(2) + ' MB',
            uploadedAt: metadata.timeCreated,
            customMetadata: metadata.customMetadata,
          });
        }
      } catch (metadataError) {
        console.warn('⚠️ Could not fetch Firebase metadata:', metadataError);
      }
    }
    
    // Fetch a sample of the content
    const sampleResponse = await fetch(audioUrl);
    const blob = await sampleResponse.blob();
    const text = await blob.slice(0, 200).text();
    
    console.log('📄 Content sample (first 200 bytes as text):', text);
    
    // Check if it looks like text/JSON
    if (text.includes('{') || text.includes('<!') || text.includes('error')) {
      console.error('❌ This file appears to contain TEXT/JSON instead of audio!');
      console.error('Full sample:', text);
      return { isValid: false, reason: 'Contains text instead of audio data' };
    }
    
    // Check if it's too small
    if (blob.size < 1000) {
      console.error('❌ File is suspiciously small:', blob.size, 'bytes');
      return { isValid: false, reason: `File too small (${blob.size} bytes)` };
    }
    
    // Check content type
    if (contentType && !contentType.includes('audio')) {
      console.error('❌ Wrong content type:', contentType);
      return { isValid: false, reason: `Wrong content type: ${contentType}` };
    }
    
    console.log('✅ File appears to be valid audio');
    return { isValid: true };
    
  } catch (error) {
    console.error('❌ Error diagnosing file:', error);
    return { isValid: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Example usage:
// import { diagnoseAudioFile } from '@/scripts/diagnose-audio';
// await diagnoseAudioFile('https://firebasestorage.googleapis.com/...');

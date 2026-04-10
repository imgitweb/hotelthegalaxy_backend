
const path = require("path");

const tf = require('@tensorflow/tfjs');
const faceapi = require("@vladmandic/face-api");
const { Canvas, Image, ImageData, loadImage } = require("canvas");

// Monkey patch face-api to work in Node.js instead of the browser
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

const loadModels = async () => {
  if (modelsLoaded) return;
  const modelsPath = path.join(__dirname, "../models"); // Ensure this folder exists with the weights
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
  modelsLoaded = true;
  console.log("Face API Models Loaded Successfully");
};

// Generate an embedding (descriptor) from an image path
const generateEmbedding = async (imagePath) => {
  await loadModels();
  const img = await loadImage(imagePath);
  const detections = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detections) {
    throw new Error("No face detected in the image. Please take a clearer photo.");
  }
  
  // Convert Float32Array to standard array for MongoDB storage
  return Array.from(detections.descriptor); 
};

// Compare live photo embedding with stored database embedding
const compareFaces = (storedEmbedding, liveEmbedding) => {
  const storedDescriptor = new Float32Array(storedEmbedding);
  const liveDescriptor = new Float32Array(liveEmbedding);
  
  // Calculates Euclidean distance. Lower is better. 
  // 0.6 is the standard threshold for face-api.js
  const distance = faceapi.euclideanDistance(storedDescriptor, liveDescriptor);
  return distance < 0.6; 
};

module.exports = { generateEmbedding, compareFaces, loadModels };
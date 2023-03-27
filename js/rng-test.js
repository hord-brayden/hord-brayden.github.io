import { getRNGFunction } from './rng-functions.js';
import { frequencyTest, benfordsLawTest } from './statistical-tests.js';
import { readJSONFile } from './file-utils.js';

async function runTests() {
  const rngSelect = document.getElementById("rngSelect");
  const rngMethod = rngSelect.value;
  const jsonFileInput = document.getElementById("jsonFile");
  const jsonFile = jsonFileInput.files[0];

  const seed = 12345;
  const generateRandomNumber = getRNGFunction(rngMethod, seed);

  let samples;
  if (jsonFile) {
    samples = await readJSONFile(jsonFile);
  } else {
    const numSamples = 100000;
    samples = Array.from({ length: numSamples }, () => {
      const randomNumber = generateRandomNumber();
      return Math.round(randomNumber * 1e15) / 1e15;
    });
  }

  const numBins = 100;
  const frequencyTestResults = frequencyTest(samples, numBins);
  const benfordsLawTestResults = benfordsLawTest(samples);

  const binSize = 1 / numBins;
  const formattedBinCounts = frequencyTestResults.binCounts.map((count, index) => {
    const lowerBound = (index * binSize).toFixed(2);
    const upperBound = ((index + 1) * binSize).toFixed(2);
    return `Bin ${index + 1} (${lowerBound}-${upperBound}): ${count}`;
  }).join(',<br>');

  const formattedDigitCounts = benfordsLawTestResults.digitCounts.map((count, index) => {
    return `Digit ${index + 1}: ${count}`;
  }).join(',<br>');

  const resultsElement = document.getElementById("results");
  const freqTestStyle = !frequencyTestResults.pass ? 'frequencyFalse' : 'frequencyPass';
  const benfordTestStyle = !benfordsLawTestResults.pass ? 'frequencyFalse' : 'frequencyPass';
  resultsElement.innerHTML = `<h2 class="main-label">RNG Method: ${rngMethod}</h2>
  <div class="results-container">
  <div class="standard-chi-results">
  <h2 class="main-label">Frequency Test:</h2>
  <p class="main-label">Chi-Squared: ${frequencyTestResults.chiSquared}</p>
  <p class="main-label" id="freqTestElement">Pass: ${frequencyTestResults.pass}</p>
  <div class="bin-counts">
    <p>Bin Counts:</p>
    <pre>[<br>${formattedBinCounts}<br>]</pre>
  </div>
  </div>
  <div class="benfords-chi-results">
  <h2 class="main-label">Benford's Law Test:</h2>
  <p class="main-label">Chi-Squared: ${benfordsLawTestResults.chiSquared}</p>
  <p class="main-label" id="benfordTestElement">Pass: ${benfordsLawTestResults.pass}</p>
  <div class="digit-counts">
    <p>Digit Counts:</p>
    <pre>[<br>${formattedDigitCounts}<br>]</pre>
  </div></div></div>`.trim();

  // Apply styles to the elements
  document.getElementById("freqTestElement").classList.add(freqTestStyle);
  document.getElementById("benfordTestElement").classList.add(benfordTestStyle);
  
}


// Add an event listener to the button
const runTestsButton = document.getElementById("runTestsButton");
runTestsButton.addEventListener("click", runTests);

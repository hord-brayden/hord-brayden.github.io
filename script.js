/* Better Hardware-based entropy model */
seedXorshiftState();

function getBetterRandom() {
    return (xorshift() >>> 0) / (0xFFFFFFFF + 1);
  }
  

function seedXorshiftState() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  xorshiftState = buffer[0];
}

function xorshift() {
  xorshiftState ^= xorshiftState << 13;
  xorshiftState ^= xorshiftState >> 17;
  xorshiftState ^= xorshiftState << 5;
  return xorshiftState;
}

const canvas = document.getElementById('randomNumberPlot');
const ctx = canvas.getContext('2d');
const plotButton = document.getElementById('plotButton');
const darkModeToggle = document.querySelector('#dark-mode-toggle-btn');
const darkMode = localStorage.getItem('darkMode');
const isOsDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

function plotRandomNumbers(count) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    drawCartesianGraph(ctx, canvas);
  
    const randomValues = [];
  
    for (let i = 0; i < count; i++) {
      const x = Math.random();
      const y = Math.random();
  
      const plotX = x * canvas.width;
      const plotY = y * canvas.height;
  
      ctx.beginPath();
      ctx.arc(plotX, plotY, 2, 0, Math.PI * 2, true);
      ctx.fillStyle = 'blue';
      ctx.fill();
  
      randomValues.push([x.toFixed(2), y.toFixed(2)]);
    }

    const sectorCounts = countSectors(randomValues);
    displaySectorCounts(sectorCounts);
    displayRandomValues(randomValues);
  }

  function plotBetterRandomNumbers(count) {
    const canvas2 = document.getElementById("randomNumberPlot2");
    const ctx2 = canvas2.getContext("2d");
    ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
  
    drawCartesianGraph(ctx2, canvas2);
  
    const randomValues = [];
  
    for (let i = 0; i < count; i++) {
      const x = getBetterRandom();
      const y = getBetterRandom();
  
      const plotX = x * canvas2.width;
      const plotY = y * canvas2.height;
  
      ctx2.beginPath();
      ctx2.arc(plotX, plotY, 2, 0, Math.PI * 2, true);
      ctx2.fillStyle = "blue";
      ctx2.fill();
  
      randomValues.push([x.toFixed(2), y.toFixed(2)]);
    }
  
    const sectorCounts = countSectors(randomValues);
    displaySectorCounts(sectorCounts, "sectorCounts2");
    displayRandomValues(randomValues, "randomValues2");
  }
  
  document.getElementById("plotButton2").addEventListener("click", () => plotBetterRandomNumbers(100));  

function generatePassword() {
  const length = parseInt(document.getElementById("passwordLength").value);
  const includeUppercase = document.getElementById("includeUppercase").checked;
  const includeLowercase = document.getElementById("includeLowercase").checked;
  const includeNumbers = document.getElementById("includeNumbers").checked;
  const includeSymbols = document.getElementById("includeSymbols").checked;

  let characters = '';
  const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
  const numberChars = '0123456789';
  const symbolChars = '!@#$%^&*()_-+=<>?{}[]|';
  
  if (includeUppercase) {
  characters += uppercaseChars;
  }
  if (includeLowercase) {
  characters += lowercaseChars;
  }
  if (includeNumbers) {
  characters += numberChars;
  }
  if (includeSymbols) {
  characters += symbolChars;
  }
  
  let password = '';
  for (let i = 0; i < length; i++) {
  const randomIndex = Math.floor(Math.random() * characters.length);
  password += characters[randomIndex];
  }
  
  document.getElementById("passwordOutput").value = password;
  }
  
  function copyToClipboard() {
  const output = document.getElementById("passwordOutput");
  output.select();
  output.setSelectionRange(0, 99999);
  document.execCommand("copy");
  }
  
  function toggleDarkMode() {
  if (darkModeToggle.checked) {
  document.body.classList.add('dark-mode');
  localStorage.setItem('darkMode', 'enabled');
  } else {
  document.body.classList.remove('dark-mode');
  localStorage.setItem('darkMode', null);
  }
  }
  
  // Set dark mode based on OS preference
  if (isOsDarkMode) {
  document.body.classList.add('dark-mode');
  darkModeToggle.checked = true;
  }
  
  // Toggle dark mode based on user preference
  if (darkMode === 'enabled') {
  document.body.classList.add('dark-mode');
  darkModeToggle.checked = true;
  }
  
  darkModeToggle.addEventListener('change', toggleDarkMode);
  plotButton.addEventListener('click', () => {
  plotRandomNumbers(100);
  });
  
  document.getElementById("plotButton").addEventListener("click", () => plotRandomNumbers(100));

  document.getElementById("generatePassword").addEventListener("click", generatePassword);
  
  // Generate a default password on page load
  generatePassword();

  function drawCartesianGraph(ctx, canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const axisColor = 'gray';
    const lineWidth = 1;
    const tickSize = 5;
    const values = [0, 0.25, 0.5, 0.75, 1];
  
    ctx.beginPath();
    ctx.lineWidth = lineWidth;
  
    // Draw X axis
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.strokeStyle = axisColor;
    ctx.stroke();
  
    // Draw Y axis
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.strokeStyle = axisColor;
    ctx.stroke();
  
    // Draw X axis values
    ctx.textBaseline = "middle";
    values.forEach(value => {
      const x = width * value;
      const y = height / 2;
  
      ctx.moveTo(x, y - tickSize / 2);
      ctx.lineTo(x, y + tickSize / 2);
      ctx.strokeStyle = axisColor;
      ctx.stroke();
  
      ctx.font = "12px Arial";
      ctx.textAlign = value === 0 ? "left" : value === 1 ? "right" : "center";
      ctx.fillStyle = axisColor;
      ctx.fillText(value, x, y + tickSize * 2);
    });
  
    // Draw Y axis values
    ctx.textAlign = "center";
    values.forEach(value => {
      const x = width / 2;
      const y = height * (1 - value);
  
      ctx.moveTo(x - tickSize / 2, y);
      ctx.lineTo(x + tickSize / 2, y);
      ctx.strokeStyle = axisColor;
      ctx.stroke();
  
      ctx.font = "12px Arial";
      ctx.textBaseline = value === 0 ? "bottom" : value === 1 ? "top" : "middle";
      ctx.fillStyle = axisColor;
      ctx.fillText(value, x - tickSize * 2, y);
    });
  
    ctx.closePath();
  }
  
  function countSectors(randomValues) {
    const sectorCounts = {
      sector1: 0,
      sector2: 0,
      sector3: 0,
      sector4: 0
    };
  
    randomValues.forEach(([x, y]) => {
      if (x >= 0.5 && y >= 0.5) {
        sectorCounts.sector1++;
      } else if (x < 0.5 && y >= 0.5) {
        sectorCounts.sector2++;
      } else if (x < 0.5 && y < 0.5) {
        sectorCounts.sector3++;
      } else if (x >= 0.5 && y < 0.5) {
        sectorCounts.sector4++;
      }
    });
  
    return sectorCounts;
  }

  function displaySectorCounts(sectorCounts, elementId = "sectorCounts") {
    const sectorCountsDivContainer = document.getElementById(elementId);
    const sectorCountsDiv = document.createElement("div");
    sectorCountsDiv.innerHTML = `
      <p class="sectorOutput">Sector 1: ${sectorCounts.sector1}</p>
      <p class="sectorOutput">Sector 2: ${sectorCounts.sector2}</p>
      <p class="sectorOutput">Sector 3: ${sectorCounts.sector3}</p>
      <p class="sectorOutput">Sector 4: ${sectorCounts.sector4}</p>
    `;
  
    // Clear previous sector counts
    sectorCountsDivContainer.innerHTML = "";
    sectorCountsDivContainer.appendChild(sectorCountsDiv);
  }  
  
  function displayRandomValues(randomValues, elementId = "randomValues") {
    const randomValuesDiv = document.getElementById(elementId);
    randomValuesDiv.innerHTML = randomValues.join(", ");
  }
  
  
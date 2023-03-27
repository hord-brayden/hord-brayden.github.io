function frequencyTest(samples, numBins) {
    const binCounts = Array(numBins).fill(0);
    samples.forEach((sample) => {
      const binIndex = Math.floor(sample * numBins);
      binCounts[binIndex]++;
    });
  
    const expectedBinCount = samples.length / numBins;
    const chiSquared = binCounts.reduce((sum, count) => {
      const diff = count - expectedBinCount;
      return sum + (diff * diff) / expectedBinCount;
    }, 0);
  
    return {
      binCounts,
      chiSquared,
      pass: chiSquared < 3.841, // For a significance level of 0.05 with 1 degree of freedom
    };
  }

  function benfordsLawTest(samples) {
    const digitCounts = Array(9).fill(0);
    const totalSamples = samples.length;
  
    samples.forEach((sample) => {
        const firstDigit = parseInt(sample.toString().charAt(2), 10); // The leading digit after the decimal point
        digitCounts[firstDigit - 1]++;
    });
  
    const frequencies = digitCounts.map((count) => count / totalSamples);
    const benfordsLawFrequencies = Array.from({ length: 9 }, (_, i) => Math.log10((i + 2) / (i + 1)));
  
    const chiSquared = digitCounts.reduce((sum, count, index) => {
        const expectedCount = benfordsLawFrequencies[index] * totalSamples;
        const diff = count - expectedCount;
        return sum + (diff * diff) / expectedCount;
    }, 0);
  
    return {
        digitCounts,
        frequencies,
        chiSquared,
        pass: chiSquared < 15.507, // For a significance level of 0.05 with 8 degrees of freedom
    };
  }

export { frequencyTest, benfordsLawTest };
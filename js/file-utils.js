async function readJSONFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
  
      reader.onload = (event) => {
        try {
          const samples = JSON.parse(event.target.result);
          resolve(samples);
        } catch (error) {
          reject(error);
        }
      };
  
      reader.onerror = (error) => {
        reject(error);
      };
  
      reader.readAsText(file);
    });
  }

export { readJSONFile };
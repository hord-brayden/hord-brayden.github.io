function randomizeInputArray(inputId, outputId) {
    const inputElement = document.getElementById(inputId);
    const outputElement = document.getElementById(outputId);
    if (inputElement && outputElement) {
        const numbers = inputElement.value.split(/[\s,]+/).filter(Boolean).map(Number);
        for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }
        outputElement.value = numbers.join(", ");
    }
    else {
        // for default or missing attributes
        console.log("somethin is up home-slice. input id is set to ", inputId, "and output id is set to ", outputId);
    }
}

randomizeInputArray('arrayInput', 'arrayOutput');

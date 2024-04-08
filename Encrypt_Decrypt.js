(async () => {
    const action = prompt("Do you want to encrypt or decrypt? (E/D):");

    // Function to derive a key from a passphrase
    async function deriveKey(passphrase) {
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            {name: 'PBKDF2'},
            false,
            ['deriveKey']
        );
        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode('a unique salt'),
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256},
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Function to encrypt data
    async function encrypt(data, passphrase) {
        const key = await deriveKey(passphrase);
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Generate a unique IV
        const encoder = new TextEncoder();
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv,
            },
            key,
            encoder.encode(data)
        );
        return { encryptedData, iv };
    }

    // Function to decrypt data
    async function decrypt(encryptedData, iv, passphrase) {
        const key = await deriveKey(passphrase);
        const decryptedData = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv,
            },
            key,
            encryptedData
        );
        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    }

    if (action.toLowerCase() === 'e') {
        // Encrypt
        const data = prompt("Enter the plaintext password:");
        const passphrase = prompt("Enter your passphrase:");
        const { encryptedData, iv } = await encrypt(data, passphrase);
        console.log('IV (as hex):', Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''));
        console.log('Encrypted data (as hex):', Array.from(new Uint8Array(encryptedData)).map(b => b.toString(16).padStart(2, '0')).join(''));
    } else if (action.toLowerCase() === 'd') {
        // Decrypt
        const encryptedDataHex = prompt("Enter your encrypted data (as hex string):");
        const ivHex = prompt("Enter your IV (as hex string):");
        const passphrase = prompt("Enter your passphrase:");

        const encryptedData = new Uint8Array(encryptedDataHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        const decryptedData = await decrypt(encryptedData, iv, passphrase);
        console.log('Decrypted data:', decryptedData);
    } else {
        console.log("Invalid action. Please enter 'E' to encrypt or 'D' to decrypt.");
    }
})();

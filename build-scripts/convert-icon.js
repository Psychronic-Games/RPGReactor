const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function convertIcon() {
    const inputPath = path.join(__dirname, '../images/icon.png');
    const outputPath = path.join(__dirname, '../images/icon.ico');

    console.log('Converting PNG icon to ICO format...');
    console.log(`Input: ${inputPath}`);
    console.log(`Output: ${outputPath}`);

    try {
        // Check if input file exists
        if (!fs.existsSync(inputPath)) {
            console.error(`Error: Icon file not found at ${inputPath}`);
            process.exit(1);
        }

        // Convert PNG to ICO (supports multiple sizes: 16, 24, 32, 48, 64, 128, 256)
        // The default export is a function, so we call pngToIco.default if needed
        const converter = pngToIco.default || pngToIco;
        const buf = await converter(inputPath);

        fs.writeFileSync(outputPath, buf);

        console.log('Icon converted successfully!');
        console.log(`Windows icon saved to: ${outputPath}`);
    } catch (error) {
        console.error('Error converting icon:', error.message);
        console.error(error);
        process.exit(1);
    }
}

convertIcon();

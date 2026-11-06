# CoNoMi Recognition

A beginner-friendly webcam recognition website built with HTML, CSS, JavaScript, TensorFlow.js, and Google's Teachable Machine image library. No build tools or backend are required.

## Recognition classes

The trained model recognizes **Coco**, **Nono**, **Mimi**, and **CoNoMi** (the combined class). Exact class labels are loaded dynamically from the model metadata.

The site displays live confidence scores and changes its pastel background and animated effects when the best prediction exceeds 80% confidence. Otherwise, it displays "Searching...". Start and Stop buttons control the webcam; camera frames are processed locally in your browser.

Model: https://teachablemachine.withgoogle.com/models/987HOFcWM/

## Run locally

1. Open this project folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` and select **Open with Live Server**.
4. Open the localhost address, click **Start Camera**, and allow camera access.
5. Show a trained subject in good lighting. Click **Stop Camera** when finished.

Internet access is required to download the libraries and model. Webcam access requires localhost or HTTPS; opening the HTML file directly or using a plain HTTP LAN address may not work.

## Files and deployment

- `index.html`, `style.css`, `script.js`: the complete static website.
- `Dockerfile`, `.dockerignore`: optional Nginx packaging for Dokploy. Select the Dockerfile build type, use container port 80, and enable HTTPS on your domain.
- `verify.cjs`: optional mocked behavior checks; run `node verify.cjs` if Node.js is installed. Node.js is not needed to run the website.

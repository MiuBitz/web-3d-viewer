# Web 3D Viewer

A fast, lightweight, browser-based 3D model viewer built with Three.js and vanilla web technologies.

## Supported Formats

- **GLB / GLTF** (including Draco compression)
- **FBX**
- **OBJ + MTL**
- **STL**

## Features

- **Zero Build Setup**: Pure HTML5, CSS, and ES Modules loaded via CDN import maps.
- **Drag & Drop**: Drop 3D files directly into the browser or use the file picker.
- **Toggles (Off by default)**:
  - Grid plane
  - Wireframe mode
  - PBR Studio Lighting
- **Animation Player**: Play, pause, and switch animation tracks automatically for rigged models.
- **Inspection Statistics**: Live geometry details (triangle count, vertex count, mesh count, materials).
- **GitHub Pages Ready**: 100% client-side with relative paths; ready to host directly on GitHub.

## Local Development

Because the app uses browser ES Modules and import maps, serve it through any static local server:

### Python
```bash
python -m http.server 8000
```
Then open: `http://localhost:8000`

### VS Code
Install the **Live Server** extension and click **Go Live** on `index.html`.

## Deploying to GitHub Pages

1. Initialize git and push this folder to a GitHub repository named `web-3d-viewer`:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Web 3D Viewer"
   git branch -M main
   git remote add origin https://github.com/<your-username>/web-3d-viewer.git
   git push -u origin main
   ```
2. Go to your repository on GitHub.
3. Navigate to **Settings** → **Pages**.
4. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then click **Save**.
6. Your viewer will be live at:
   `https://<your-username>.github.io/web-3d-viewer/`

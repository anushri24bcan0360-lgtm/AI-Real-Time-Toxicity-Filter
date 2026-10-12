# AI Real-Time Toxicity Filter

Chrome extension and local API for detecting toxic text in comments and chats. The API combines the English ONNX model with the local Hinglish classifier.

## Run the models locally

The model files are read from `backend/model` and `backend/model_hinglish`. The Hinglish checkpoint is large (about 1.1 GB), so the first model startup can take a minute and needs enough available memory. Model inference runs locally on CPU; the API does not download the classifier at startup.

1. Install Python 3.10 or newer.
2. Run `backend/setup_local.bat` once. It creates an isolated `backend/.venv` and installs the Python packages. Package installation needs an internet connection.
3. Run `backend/start_backend.bat` and leave its window open. Wait for Uvicorn to report that it is running at `http://127.0.0.1:8000`.
4. Check `http://127.0.0.1:8000/`. The response should contain `"model_loaded": true` after startup. `http://127.0.0.1:8000/docs` provides an interactive API page.
5. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `entension` folder. Keep the backend window running while using the extension.

In the extension popup's **Dashboard** tab, choose **English only**, **Hinglish only**, or **English + Hinglish (both)** under **Language models**. The default is **both**. The choice is saved locally and applies to new comment analyses; changing it rechecks comments currently on the page. Both model checkpoints are still loaded by the backend at startup, while the selection controls which model inference runs for each comment.

Hinglish model labels use separate default cutoffs (0.55 for profanity and targeted abuse; 0.30 for hate-related labels), based on the model card's recommended ranges. The popup sensitivity control scales these cutoffs along with the English cutoff. Override the defaults with `HINGLISH_PROFANITY_THRESHOLD`, `HINGLISH_ABUSE_THRESHOLD`, and `HINGLISH_HATE_THRESHOLD` if you later calibrate them on labeled validation data. These starting values have not been calibrated on this project's own dataset.

To try a Hinglish message directly against the running API in PowerShell:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/analyze -Method Post -ContentType 'application/json' -Body '{"comment":"Tu ek chutiya hai aur teri soch bakwas hai"}'
```

The response includes per-model scores and indicates whether the Hinglish model was used. To stop the local API, focus its terminal and press `Ctrl+C`.

## Backend setup notes

- `backend/setup_local.bat` installs packages only; it does not download model weights.
- `backend/start_backend.bat` checks for the required local model files and Python dependencies before starting the API.
- The Chrome extension sends analysis requests to `http://127.0.0.1:8000/analyze`.
- If port 8000 is already occupied, stop the other service before starting this API.

# Hinglish toxicity model

- Source: [darelphilip/hinglish-toxicity-classifier](https://huggingface.co/darelphilip/hinglish-toxicity-classifier)
- Base architecture: XLM-RoBERTa sequence classifier
- License stated by the model card: MIT
- Task: multi-label classification for Hinglish text
- Inference: sigmoid probabilities over the model's seven labels

The API combines this model with the existing English ONNX classifier. It maps
`profanity_vulgarity` to `toxic` and `obscene`,
`targeted_abuse_harassment` to `toxic` and `insult`, and its discriminatory,
caste, communal, regional, and misogyny labels to `toxic` and `identity_hate`.
The ensemble takes the higher probability for each shared category, favoring
recall so either model can catch a comment. The original per-model scores remain
available in the `/analyze` response for inspection.

Model files are downloaded from the Hugging Face repository. Set
`HINGLISH_MODEL_DIR` if the files are stored somewhere other than this folder.

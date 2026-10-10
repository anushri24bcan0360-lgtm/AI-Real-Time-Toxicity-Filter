"""FastAPI service combining English and Hinglish multi-label toxicity models."""

import os
import re
from contextlib import asynccontextmanager
from typing import Dict, List

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import torch
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer, BertTokenizerFast

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.getenv("MODEL_DIR", os.path.join(BACKEND_DIR, "model"))
HINGLISH_MODEL_DIR = os.getenv(
    "HINGLISH_MODEL_DIR", os.path.join(BACKEND_DIR, "model_hinglish")
)
ONNX_PATH = os.path.join(MODEL_DIR, "model.onnx")
MAX_LEN = 128
THRESHOLD = 0.8
CATEGORIES = ["toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate"]
HINGLISH_TO_CANONICAL = {
    "profanity_vulgarity": ("toxic", "obscene"),
    "targeted_abuse_harassment": ("toxic", "insult"),
    "discriminatory_hate_speech": ("toxic", "identity_hate"),
    "caste": ("toxic", "identity_hate"),
    "communal_religious": ("toxic", "identity_hate"),
    "regional_xenophobic": ("toxic", "identity_hate"),
    "misogyny_gender": ("toxic", "identity_hate"),
}
HINGLISH_MARKERS = {
    "aap", "acha", "accha", "apna", "apne", "aur", "bakwas", "bahut",
    "abhi", "aisa", "aisi", "aise", "behen", "bhen", "bhai", "bhi", "bilkul",
    "bura", "chup", "chutiya", "chutiye", "gaali", "gaandu", "gandu", "gaya",
    "gayi", "hai", "hain", "harami", "ho", "hona", "hoon", "hu", "hum", "ka",
    "kaise", "kaisa", "kamina", "kamine", "karna", "karo", "ke", "ki", "ko",
    "kuch", "kya", "kyu", "kyun", "kyunki", "madarchod", "mat", "mein", "mera",
    "meri", "mere", "mujhe", "nahin", "nahi", "nalla", "pagal", "raha", "rahe",
    "rahi", "saala", "sala", "saali", "sali", "tera", "tere", "teri", "tha", "the",
    "thi", "toh", "tum", "tumhara", "tumhe", "tujhe", "tujh", "tu", "wala", "wali",
    "wale", "yaar", "ye", "yeh",
}
LATIN_WORD_RE = re.compile(r"[a-z]+", re.IGNORECASE)
DEVANAGARI_RE = re.compile(r"[\u0900-\u097f]")

# Populated on startup
resources: Dict[str, object] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    torch.set_num_threads(max(1, int(os.getenv("TORCH_NUM_THREADS", "2"))))
    required_files = (
        os.path.join(MODEL_DIR, "model.onnx"),
        os.path.join(MODEL_DIR, "tokenizer.json"),
        os.path.join(HINGLISH_MODEL_DIR, "config.json"),
        os.path.join(HINGLISH_MODEL_DIR, "model.safetensors"),
        os.path.join(HINGLISH_MODEL_DIR, "tokenizer.json"),
    )
    missing_files = [path for path in required_files if not os.path.isfile(path)]
    if missing_files:
        missing_list = "\n  ".join(missing_files)
        raise RuntimeError(f"Required local model files are missing:\n  {missing_list}")

    print(f"Loading English ONNX model from {MODEL_DIR}", flush=True)
    resources["tokenizer"] = BertTokenizerFast.from_pretrained(
        MODEL_DIR, do_lower_case=True, local_files_only=True
    )

    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    resources["session"] = ort.InferenceSession(
        ONNX_PATH, sess_options=opts, providers=["CPUExecutionProvider"]
    )
    print(
        f"Loading Hinglish XLM-R model from {HINGLISH_MODEL_DIR} (large local checkpoint)",
        flush=True,
    )
    resources["hinglish_tokenizer"] = AutoTokenizer.from_pretrained(
        HINGLISH_MODEL_DIR, local_files_only=True
    )
    resources["hinglish_model"] = AutoModelForSequenceClassification.from_pretrained(
        HINGLISH_MODEL_DIR, local_files_only=True
    ).to("cpu").eval()
    resources["hinglish_id2label"] = {
        int(index): str(label)
        for index, label in resources["hinglish_model"].config.id2label.items()
    }
    print("Both local models are loaded; the API is ready.", flush=True)
    yield
    resources.clear()


app = FastAPI(title="Local Toxicity Ensemble API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # must be False when allow_origins is "*"
    allow_methods=["*"],
    allow_headers=["*"],
)


class CommentRequest(BaseModel):
    comment: str


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def likely_hinglish(text: str) -> bool:
    """Route Hindi/ Hinglish text to the specialist classifier, including short phrases."""
    if DEVANAGARI_RE.search(text):
        return True
    words = {word.lower() for word in LATIN_WORD_RE.findall(text)}
    markers = words & HINGLISH_MARKERS
    # `main` and `par` are common English words too, so require another Hindi
    # marker when either is the only match. A single distinctive marker such as
    # `hai`, `yaar`, or a Hinglish abuse term is enough for short chat messages.
    return len(markers) >= 2 or bool(markers - {"main", "par"})


@app.get("/")
def health_check():
    return {
        "status": "ok",
        "model_loaded": all(
            key in resources
            for key in ("session", "tokenizer", "hinglish_model", "hinglish_tokenizer")
        ),
        "models": ["english_onnx", "hinglish_xlm_roberta"],
    }


@app.post("/analyze")
def analyze(request: CommentRequest):
    # 1. Preprocess: lowercasing is handled by the uncased tokenizer (do_lower_case=True)
    enc = resources["tokenizer"](
        request.comment,
        max_length=MAX_LEN,
        truncation=True,
        return_token_type_ids=True,
        return_attention_mask=True,
        return_tensors="np",
    )
    feed = {
        "input_ids": enc["input_ids"].astype(np.int64),
        "attention_mask": enc["attention_mask"].astype(np.int64),
        "token_type_ids": enc["token_type_ids"].astype(np.int64),
    }

    # 2. Inference
    logits = resources["session"].run(None, feed)[0][0]  # shape: (6,)

    # Model 1: English multi-label toxicity classifier.
    probs = sigmoid(logits)
    english_scores: Dict[str, float] = {
        cat: float(p) for cat, p in zip(CATEGORIES, probs)
    }

    # Model 2: Hinglish multi-label classifier. Map its taxonomy onto the
    # extension's existing categories. For detected Hinglish, retain the stronger
    # model score so a weak English-model score cannot dilute the specialist.
    hinglish_scores: Dict[str, float] = {}
    used_hinglish_model = likely_hinglish(request.comment)
    if used_hinglish_model:
        hinglish_tokenizer = resources["hinglish_tokenizer"]
        hinglish_model = resources["hinglish_model"]
        hinglish_enc = hinglish_tokenizer(
            request.comment,
            max_length=MAX_LEN,
            truncation=True,
            return_tensors="pt",
        )
        with torch.inference_mode():
            hinglish_logits = hinglish_model(**hinglish_enc).logits[0]
            hinglish_probs = torch.sigmoid(hinglish_logits).cpu().tolist()
        hinglish_scores = {
            resources["hinglish_id2label"].get(index, f"label_{index}"): float(score)
            for index, score in enumerate(hinglish_probs)
        }

    hinglish_category_scores: Dict[str, float] = {}
    for label, destinations in HINGLISH_TO_CANONICAL.items():
        probability = hinglish_scores.get(label)
        if probability is None:
            continue
        for category in destinations:
            hinglish_category_scores[category] = max(
                hinglish_category_scores.get(category, 0.0), probability
            )

    scores = dict(english_scores)
    for category, hinglish_score in hinglish_category_scores.items():
        scores[category] = max(english_scores[category], hinglish_score)

    flagged: List[str] = [cat for cat, score in scores.items() if score >= THRESHOLD]

    return {
        "is_toxic": len(flagged) > 0,
        "max_score": max(scores.values()),
        "flagged_categories": flagged,
        "scores": scores,
        "models": {
            "english_onnx": {
                "max_score": max(english_scores.values()),
                "scores": english_scores,
            },
            "hinglish_xlm_roberta": {
                "max_score": max(hinglish_scores.values(), default=0.0),
                "scores": hinglish_scores,
                "used": used_hinglish_model,
            },
        },
    }

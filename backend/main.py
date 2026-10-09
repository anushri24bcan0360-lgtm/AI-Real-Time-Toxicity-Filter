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
THRESHOLD = 0.6
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
    "bhai", "bhi", "bura", "chutiya", "gaali", "gaya", "gayi", "hai",
    "hain", "ho", "hum", "ka", "kaise", "kaisa", "karna", "karo", "ke",
    "ki", "ko", "kya", "kyu", "kyun", "kyunki", "main", "mat", "mein",
    "mera", "meri", "mere", "mujhe", "nahi", "nahin", "pagal", "par",
    "raha", "rahe", "rahi", "se", "tera", "tere", "teri", "tha", "the",
    "thi", "toh", "tum", "tumhara", "tujhe", "tu", "wala", "wali", "wale",
    "yaar",
}
LATIN_WORD_RE = re.compile(r"[a-z]+", re.IGNORECASE)

# Populated on startup
resources: Dict[str, object] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    torch.set_num_threads(max(1, int(os.getenv("TORCH_NUM_THREADS", "2"))))
    resources["tokenizer"] = BertTokenizerFast.from_pretrained(
        MODEL_DIR, do_lower_case=True
    )

    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    resources["session"] = ort.InferenceSession(
        ONNX_PATH, sess_options=opts, providers=["CPUExecutionProvider"]
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
    """Route likely Romanized Hindi-English text to the specialist classifier."""
    words = {word.lower() for word in LATIN_WORD_RE.findall(text)}
    return len(words & HINGLISH_MARKERS) >= 2


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
    # extension's existing categories and use max fusion for a recall-first filter.
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

    scores = dict(english_scores)
    for label, destinations in HINGLISH_TO_CANONICAL.items():
        probability = hinglish_scores.get(label)
        if probability is None:
            continue
        for category in destinations:
            scores[category] = max(scores[category], probability)

    flagged: List[str] = [cat for cat, score in scores.items() if score > THRESHOLD]

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

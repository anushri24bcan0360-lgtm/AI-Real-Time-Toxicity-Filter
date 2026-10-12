"""FastAPI service combining English and Hinglish multi-label toxicity models."""

import os
import re
import unicodedata
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Dict, List, Literal

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import torch
from pydantic import BaseModel, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer, BertTokenizerFast

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.getenv("MODEL_DIR", os.path.join(BACKEND_DIR, "model"))
HINGLISH_MODEL_DIR = os.getenv(
    "HINGLISH_MODEL_DIR", os.path.join(BACKEND_DIR, "model_hinglish")
)
ONNX_PATH = os.path.join(MODEL_DIR, "model.onnx")
MAX_LEN = 128
THRESHOLD = 0.8
HINGLISH_LABEL_THRESHOLDS = {
    "profanity_vulgarity": float(os.getenv("HINGLISH_PROFANITY_THRESHOLD", "0.55")),
    "targeted_abuse_harassment": float(os.getenv("HINGLISH_ABUSE_THRESHOLD", "0.55")),
    "discriminatory_hate_speech": float(os.getenv("HINGLISH_HATE_THRESHOLD", "0.30")),
    "caste": float(os.getenv("HINGLISH_HATE_THRESHOLD", "0.30")),
    "communal_religious": float(os.getenv("HINGLISH_HATE_THRESHOLD", "0.30")),
    "regional_xenophobic": float(os.getenv("HINGLISH_HATE_THRESHOLD", "0.30")),
    "misogyny_gender": float(os.getenv("HINGLISH_HATE_THRESHOLD", "0.30")),
}
UNCERTAIN_MARGIN = float(os.getenv("UNCERTAIN_MARGIN", "0.12"))
NORMALIZED_PASS_ENABLED = os.getenv("NORMALIZED_PASS_ENABLED", "true").lower() in {"1", "true", "yes"}
CACHE_MAX_SIZE = max(0, int(os.getenv("ANALYSIS_CACHE_SIZE", "2048")))
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

resources: Dict[str, object] = {}
result_cache = OrderedDict()
cache_lock = threading.Lock()
LEET_TRANSLATION = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "!": "i"})
SEPARATOR_LETTERS = re.compile(r"(?<!\w)(?:[a-z0-9][ ._\-]){3,}[a-z0-9](?!\w)", re.IGNORECASE)
SUSPICIOUS_TOKEN = re.compile(r"(?<![\w@])(?=[a-z][a-z0-9@!]*[a-z])(?=[a-z0-9@!]*[0-9@!])[a-z][a-z0-9@!]{2,}(?!\w)", re.IGNORECASE)
REPEATED_RUN = re.compile(r"(.)\1{2,}")
URL_RE = re.compile(r"(?:https?://|www\.)[^\s]+", re.IGNORECASE)
INTRAWORD_SEPARATOR = re.compile(r"(?<=[a-z])[._-](?=[a-z])")

# Supplemental local Hinglish phrase list.
HINGLISH_OFFENSIVE_TERMS = (
    "bewakoof", "pagal", "gadhe", "gadha", "ullu", "nalayak", "nikamma",
    "kamina", "kameena", "ghatiya", "harami", "haraami", "besharam",
    "badtameez", "saala", "saali", "kutte", "kutta", "kutiya", "bkl",
    "bsdk", "bhosdike", "bhosdikey", "bhosdiwala", "bhosdi", "bhosdi ke",
    "gaand", "gand", "gaanduu", "gandu", "ganduu", "chutiya", "chutiye",
    "chutia", "chootiya", "chutya", "madarchod", "madharchod", "madrchod",
    "behenchod", "bhenchod", "bhnchod", "bhen ke lode", "maa ki", "ma ki",
    "teri maa", "teri behen", "maa ch*d", "bhen ch*d", "lavde", "lode", "laude", "lund", "jhaant",
    "jhant", "randi", "raand", "raandi", "randii", "saala kutta", "saalaa",
    "kameenaaa", "kuttta", "haraaamii",
)
HINGLISH_OFFENSIVE_PATTERNS = tuple(
    re.compile(r"(?<![a-z0-9_])" + r"\s+".join(re.escape(word).replace(r"\*", "[a-z]*") for word in term.split()) + r"(?![a-z0-9_])")
    for term in HINGLISH_OFFENSIVE_TERMS
)


def matched_hinglish_terms(text: str) -> List[str]:
    candidate = normalized_candidate(text)
    return [term for term, pattern in zip(HINGLISH_OFFENSIVE_TERMS, HINGLISH_OFFENSIVE_PATTERNS) if pattern.search(candidate)]


def normalized_candidate(text: str) -> str:
    """Build a cautious alternate only for clear obfuscation; never mutate display text."""
    candidate = unicodedata.normalize("NFKC", text).lower()
    protected_urls = []

    def protect_url(match):
        protected_urls.append(match.group(0))
        return f" codexurlplaceholder{len(protected_urls) - 1} "

    candidate = URL_RE.sub(protect_url, candidate)
    candidate = INTRAWORD_SEPARATOR.sub("", candidate)
    candidate = SEPARATOR_LETTERS.sub(lambda m: re.sub(r"[ ._\-]", "", m.group(0)), candidate)
    candidate = SUSPICIOUS_TOKEN.sub(lambda m: m.group(0).translate(LEET_TRANSLATION), candidate)
    candidate = REPEATED_RUN.sub(lambda m: m.group(1) * 2, candidate)
    for index, url in enumerate(protected_urls):
        candidate = candidate.replace(f"codexurlplaceholder{index}", url)
    return candidate


def cache_get(key: str):
    if not CACHE_MAX_SIZE:
        return None
    with cache_lock:
        value = result_cache.get(key)
        if value is not None:
            result_cache.move_to_end(key)
            return value
    return None


def cache_put(key: str, value: dict) -> None:
    if not CACHE_MAX_SIZE:
        return
    with cache_lock:
        result_cache[key] = value
        result_cache.move_to_end(key)
        while len(result_cache) > CACHE_MAX_SIZE:
            result_cache.popitem(last=False)


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
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CommentRequest(BaseModel):
    comment: str
    model_mode: Literal["english", "hinglish", "both"] = "both"
    threshold: float = Field(default=THRESHOLD, ge=0.5, le=0.95)


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def likely_hinglish(text: str) -> bool:
    """Route Hindi/ Hinglish text to the specialist classifier, including short phrases."""
    if DEVANAGARI_RE.search(text):
        return True
    words = {word.lower() for word in LATIN_WORD_RE.findall(text)}
    markers = words & HINGLISH_MARKERS
    # Require another marker for ambiguous words like "main" and "par".
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
    original = request.comment
    model_mode = request.model_mode
    cache_key = f"{model_mode}:{request.threshold:.3f}:{unicodedata.normalize('NFKC', original).strip().lower()}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    use_english = model_mode in {"english", "both"}
    use_hinglish = model_mode in {"hinglish", "both"}
    english_scores: Dict[str, float] = {cat: 0.0 for cat in CATEGORIES}
    alternate_used = False
    if use_english:
        enc = resources["tokenizer"](
            original, max_length=MAX_LEN, truncation=True,
            return_token_type_ids=True, return_attention_mask=True, return_tensors="np",
        )
        feed = {
            "input_ids": enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
            "token_type_ids": enc["token_type_ids"].astype(np.int64),
        }
        logits = resources["session"].run(None, feed)[0][0]
        probs = sigmoid(logits)
        english_scores = {cat: float(p) for cat, p in zip(CATEGORIES, probs)}

        # Retry only uncertain, clearly obfuscated text.
        alternate_text = normalized_candidate(original) if NORMALIZED_PASS_ENABLED else original
        comparison_text = unicodedata.normalize("NFKC", original).lower()
        if alternate_text != comparison_text and max(probs) >= request.threshold - UNCERTAIN_MARGIN and max(probs) < request.threshold + UNCERTAIN_MARGIN:
            alt_enc = resources["tokenizer"](
                alternate_text, max_length=MAX_LEN, truncation=True,
                return_token_type_ids=True, return_attention_mask=True, return_tensors="np",
            )
            alt_feed = {
                "input_ids": alt_enc["input_ids"].astype(np.int64),
                "attention_mask": alt_enc["attention_mask"].astype(np.int64),
                "token_type_ids": alt_enc["token_type_ids"].astype(np.int64),
            }
            alt_probs = sigmoid(resources["session"].run(None, alt_feed)[0][0])
            english_scores = {cat: max(english_scores[cat], float(p)) for cat, p in zip(CATEGORIES, alt_probs)}
            alternate_used = True

    hinglish_scores: Dict[str, float] = {}
    used_hinglish_model = use_hinglish
    if use_hinglish:
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

    matched_terms = matched_hinglish_terms(original) if use_hinglish else []
    if matched_terms:
        # Explicit local matches trigger blur independently of model scores.
        hinglish_category_scores["toxic"] = 1.0

    scores = dict(english_scores)
    for category, hinglish_score in hinglish_category_scores.items():
        scores[category] = max(english_scores[category], hinglish_score)

    flagged_set = {cat for cat, score in english_scores.items() if use_english and score >= request.threshold}
    # Scale Hinglish cutoffs with the popup sensitivity setting.
    threshold_scale = request.threshold / THRESHOLD
    if use_hinglish:
        for label, destinations in HINGLISH_TO_CANONICAL.items():
            label_threshold = min(0.99, HINGLISH_LABEL_THRESHOLDS.get(label, 0.55) * threshold_scale)
            if hinglish_scores.get(label, 0.0) >= label_threshold:
                flagged_set.update(destinations)
    if matched_terms:
        flagged_set.add("toxic")
    flagged: List[str] = [cat for cat in CATEGORIES if cat in flagged_set]

    result = {
        "is_toxic": len(flagged) > 0,
        "max_score": max(scores.values()),
        "flagged_categories": flagged,
        "scores": scores,
        "local_hinglish_terms": {"used": bool(matched_terms), "count": len(matched_terms)},
        "model_mode": model_mode,
        "decision_thresholds": {
            "english": request.threshold,
            "hinglish": {
                label: min(0.99, threshold * threshold_scale)
                for label, threshold in HINGLISH_LABEL_THRESHOLDS.items()
            } if use_hinglish else {},
        },
        "models": {
            "english_onnx": {
                "max_score": max(english_scores.values()),
                "scores": english_scores,
                "normalized_pass_used": alternate_used,
            },
            "hinglish_xlm_roberta": {
                "max_score": max(hinglish_scores.values(), default=0.0),
                "scores": hinglish_scores,
                "used": used_hinglish_model,
            },
        },
    }
    cache_put(cache_key, result)
    return result

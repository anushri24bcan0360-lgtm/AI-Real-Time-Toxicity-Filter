"""
Export a fine-tuned BertForSequenceClassification model to ONNX and benchmark latency.

Usage:
    python export_bert_onnx.py                         # uses ./model -> model.onnx
    python export_bert_onnx.py --model_dir ./model --output model.onnx

Requirements:
    pip install torch transformers onnx onnxruntime numpy
"""

import argparse
import os
import time

import numpy as np
import onnxruntime as ort
import torch
from transformers import AutoTokenizer, BertForSequenceClassification

MAX_LEN = 128


class BertOnnxWrapper(torch.nn.Module):
    """Returns a plain logits tensor (not a ModelOutput) so the ONNX graph has one clean output."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, token_type_ids):
        return self.model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            return_dict=False,
        )[0]


def export_to_onnx(model_dir: str, output_path: str, opset: int = 17):
    model_dir = os.path.abspath(model_dir)

    if not os.path.isdir(model_dir):
        raise FileNotFoundError(
            f'Model folder not found: {model_dir}\n'
            'Make sure your trained model is inside a folder named "model".'
        )

    if not os.path.isfile(os.path.join(model_dir, "config.json")):
        raise FileNotFoundError(
            f'config.json not found in: {model_dir}\n'
            'Make sure the "model" folder contains your complete Hugging Face model.'
        )

    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    # Eager attention exports more reliably than SDPA.
    model = BertForSequenceClassification.from_pretrained(model_dir, attn_implementation="eager")
    model.eval()
    wrapper = BertOnnxWrapper(model).eval()

    # Use a short, multi-item dummy batch for dynamic axes.
    dummy = tokenizer(
        ["export example sentence", "another example"],
        padding="max_length",
        truncation=True,
        max_length=16,
        return_tensors="pt",
    )
    args = (
        dummy["input_ids"],
        dummy["attention_mask"],
        dummy.get("token_type_ids", torch.zeros_like(dummy["input_ids"])),
    )

    dynamic_axes = {
        "input_ids": {0: "batch_size", 1: "sequence_length"},
        "attention_mask": {0: "batch_size", 1: "sequence_length"},
        "token_type_ids": {0: "batch_size", 1: "sequence_length"},
        "logits": {0: "batch_size"},
    }

    export_kwargs = dict(
        input_names=["input_ids", "attention_mask", "token_type_ids"],
        output_names=["logits"],
        dynamic_axes=dynamic_axes,
        opset_version=opset,
        do_constant_folding=True,
    )
    with torch.no_grad():
        try:
            # Use the legacy exporter for dynamic axes.
            torch.onnx.export(wrapper, args, output_path, dynamo=False, **export_kwargs)
        except TypeError:
            # Older PyTorch versions do not accept `dynamo`.
            torch.onnx.export(wrapper, args, output_path, **export_kwargs)

    print(f"[export] Saved ONNX model to {output_path}")
    return tokenizer, wrapper


def validate(tokenizer, torch_model, onnx_path: str, text: str = "This is a validation sentence."):
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    enc = tokenizer(text, truncation=True, max_length=MAX_LEN, return_tensors="pt")
    token_type_ids = enc.get("token_type_ids", torch.zeros_like(enc["input_ids"]))

    with torch.no_grad():
        torch_logits = torch_model(enc["input_ids"], enc["attention_mask"], token_type_ids).numpy()

    onnx_logits = session.run(
        ["logits"],
        {
            "input_ids": enc["input_ids"].numpy().astype(np.int64),
            "attention_mask": enc["attention_mask"].numpy().astype(np.int64),
            "token_type_ids": token_type_ids.numpy().astype(np.int64),
        },
    )[0]

    max_diff = float(np.abs(torch_logits - onnx_logits).max())
    print(f"[validate] max |torch - onnx| = {max_diff:.2e}")
    assert max_diff < 1e-3, "ONNX output deviates from PyTorch output!"

    # Multi-label outputs use sigmoid.
    probs = 1 / (1 + np.exp(-onnx_logits))
    print(f"[validate] sigmoid probs: {np.round(probs, 4)}")


def benchmark_latency(
    tokenizer,
    onnx_path: str,
    text: str = "ONNX Runtime makes BERT inference fast and portable.",
    warmup: int = 10,
    runs: int = 100,
):
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])

    enc = tokenizer(text, truncation=True, max_length=MAX_LEN, return_tensors="np")
    feed = {
        "input_ids": enc["input_ids"].astype(np.int64),
        "attention_mask": enc["attention_mask"].astype(np.int64),
        "token_type_ids": enc.get(
            "token_type_ids", np.zeros_like(enc["input_ids"])
        ).astype(np.int64),
    }

    for _ in range(warmup):
        session.run(None, feed)

    timings_ms = []
    for _ in range(runs):
        start = time.perf_counter()
        session.run(None, feed)
        timings_ms.append((time.perf_counter() - start) * 1000.0)

    t = np.array(timings_ms)
    print(f"[latency] input tokens : {feed['input_ids'].shape[1]}")
    print(f"[latency] runs         : {runs} (after {warmup} warm-up)")
    print(f"[latency] mean         : {t.mean():.2f} ms")
    print(f"[latency] median (p50) : {np.percentile(t, 50):.2f} ms")
    print(f"[latency] p95          : {np.percentile(t, 95):.2f} ms")
    print(f"[latency] min / max    : {t.min():.2f} / {t.max():.2f} ms")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
    "--model_dir",
    default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
)
    parser.add_argument("--output", default="model.onnx")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    tok, wrapped = export_to_onnx(args.model_dir, args.output, args.opset)
    validate(tok, wrapped, args.output)
    benchmark_latency(tok, args.output)

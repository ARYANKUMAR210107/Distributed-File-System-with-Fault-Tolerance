"""Unit tests for file chunking, hashing, and reconstruction."""

import os
import pytest

from master.services.chunker import (
    compute_sha256,
    reconstruct_chunks,
    split_file_into_chunks,
)


def test_split_and_reconstruct_binary_roundtrip():
    payload = os.urandom(250_000)  # ~250 KB random binary data
    chunks = split_file_into_chunks(payload, file_id="file_abc", chunk_size=65_536)

    assert len(chunks) == 4
    assert [c.chunk_index for c in chunks] == [0, 1, 2, 3]
    assert chunks[0].chunk_id == "file_abc_c00000"
    assert chunks[3].chunk_id == "file_abc_c00003"
    assert chunks[3].chunk_size == 250_000 - 3 * 65_536

    for c in chunks:
        assert c.sha256_hash == compute_sha256(c.data)

    reconstructed = reconstruct_chunks([c.data for c in chunks])
    assert reconstructed == payload
    assert compute_sha256(reconstructed) == compute_sha256(payload)


def test_empty_file_produces_no_chunks_and_reconstructs_empty():
    chunks = split_file_into_chunks(b"", file_id="file_empty", chunk_size=1024)
    assert chunks == []
    assert reconstruct_chunks([]) == b""


def test_invalid_chunk_size_raises():
    with pytest.raises(ValueError):
        split_file_into_chunks(b"hello", file_id="file_x", chunk_size=0)
